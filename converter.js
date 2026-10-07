(() => {
  const TARGET = {
    printerModel: 'Flashforge AD5X',
    printerPreset: 'Flashforge AD5X 0.4 nozzle',
    nozzle: '0.4',
    maxTemp: 300,
    bedX: 220,
    bedY: 220
  };

  // Machine-specific values must come from the installed FlashForge/Orca profile, not the Bambu project.
  const DROP_EXACT = new Set([
    'machine_start_gcode','machine_end_gcode','machine_pause_gcode','change_filament_gcode',
    'machine_load_filament_time','machine_unload_filament_time','machine_max_acceleration_extruding',
    'machine_max_acceleration_retracting','machine_max_acceleration_travel','machine_max_acceleration_x',
    'machine_max_acceleration_y','machine_max_acceleration_z','machine_max_jerk_e','machine_max_jerk_x',
    'machine_max_jerk_y','machine_max_jerk_z','machine_max_speed_e','machine_max_speed_x','machine_max_speed_y',
    'machine_max_speed_z','machine_min_extruding_rate','machine_min_travel_rate','print_host','print_host_webui',
    'printhost_apikey','printhost_user','printhost_password','flashforge_serial_number','printer_agent',
    'bed_custom_model','bed_custom_texture','bed_exclude_area','extruder_offset','printable_area'
  ]);
  const DROP_PREFIX = ['machine_', 'bbl_', 'ams_', 'scan_first_layer', 'timelapse_type'];
  const RENAME = {
    prime_tower: 'wipe_tower',
    prime_tower_width: 'wipe_tower_width'
  };
  const TEMP_KEYS = /(?:nozzle|filament|temperature|temp)(?!.*bed)/i;

  function sameShape(old, value) {
    if (Array.isArray(old)) return Array.isArray(value) ? value : old.map(() => String(value));
    if (typeof old === 'string') return String(value);
    return value;
  }

  function shouldDrop(k) {
    return DROP_EXACT.has(k) || DROP_PREFIX.some(p => k.startsWith(p));
  }

  function capTemps(k, v, report) {
    if (!TEMP_KEYS.test(k)) return v;
    const cap = x => {
      const n = Number(x);
      if (!Number.isFinite(n) || n <= TARGET.maxTemp) return x;
      report.capped.push(`${k}: ${x} → ${TARGET.maxTemp}`);
      return typeof x === 'string' ? String(TARGET.maxTemp) : TARGET.maxTemp;
    };
    return Array.isArray(v) ? v.map(cap) : cap(v);
  }

  function convertJson(obj, report) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
    const out = {};
    for (const [key, raw] of Object.entries(obj)) {
      if (shouldDrop(key)) { report.dropped.push(key); continue; }
      let key2 = RENAME[key] || key;
      if (key2 !== key) report.renamed.push(`${key} → ${key2}`);
      let value = raw;
      if (value && typeof value === 'object' && !Array.isArray(value)) value = convertJson(value, report);
      value = capTemps(key2, value, report);
      out[key2] = value;
    }

    const set = (k,v) => { out[k] = sameShape(out[k], v); report.replaced.push(k); };
    set('printer_model', TARGET.printerModel);
    set('printer_settings_id', TARGET.printerPreset);
    set('nozzle_diameter', TARGET.nozzle);
    if ('printer_variant' in out) set('printer_variant', TARGET.nozzle);
    if ('host_type' in out) delete out.host_type;
    if ('gcode_flavor' in out) delete out.gcode_flavor; // Let AD5X profile supply Klipper flavor.

    // Keep process/filament overrides active. Slot 0 is process overrides in Bambu/Orca projects.
    const keys = Object.keys(out).filter(k => !['different_settings_to_system'].includes(k));
    const processKeys = keys.filter(k => !/^(filament_|nozzle_|bed_|cool_plate_|hot_plate_|textured_plate_)/.test(k));
    const first = processKeys.sort().join(';');
    if (Array.isArray(out.different_settings_to_system)) {
      const arr = [...out.different_settings_to_system];
      if (arr.length === 0) arr.push(first); else arr[0] = first;
      out.different_settings_to_system = arr;
      report.rebuiltDifferentSettings = true;
    }
    return out;
  }

  function patchXmlText(text, report) {
    let s = text;
    const replacements = [
      [/(key|name)=(['"])printer_model\2\s+value=(['"])[^'"]*\3/gi, `$1=$2printer_model$2 value=$3${TARGET.printerModel}$3`],
      [/(key|name)=(['"])printer_settings_id\2\s+value=(['"])[^'"]*\3/gi, `$1=$2printer_settings_id$2 value=$3${TARGET.printerPreset}$3`]
    ];
    for (const [re, rep] of replacements) {
      const before=s; s=s.replace(re,rep); if(s!==before) report.xmlPatched++;
    }
    return s;
  }

  async function convert3mf(bytes) {
    const entries = await MiniZip.read(bytes);
    const report = { target: TARGET.printerPreset, jsonFiles: [], dropped: [], renamed: [], replaced: [], capped: [], xmlPatched: 0, rebuiltDifferentSettings: false };
    let foundProject = false;

    const out = entries.map(ent => {
      const name = ent.name.toLowerCase();
      if (name.endsWith('metadata/project_settings.config') || name.endsWith('/project_settings.config')) {
        foundProject = true;
        try {
          const original = JSON.parse(MiniZip.text(ent.data));
          const converted = convertJson(original, report);
          report.jsonFiles.push(ent.name);
          return { ...ent, data: MiniZip.bytes(JSON.stringify(converted, null, 4)) };
        } catch (e) {
          throw new Error(`Não consegui interpretar ${ent.name} como JSON: ${e.message}`);
        }
      }
      if (name.endsWith('.config') || name.endsWith('.xml')) {
        const text = MiniZip.text(ent.data);
        if (text.trim().startsWith('<')) return { ...ent, data: MiniZip.bytes(patchXmlText(text, report)) };
      }
      return ent;
    });

    if (!foundProject) throw new Error('Este 3MF não contém Metadata/project_settings.config. Baixe o Print Profile do MakerWorld, não apenas o modelo.');

    // Add a small, harmless conversion note for diagnostics.
    out.push({
      name: 'Metadata/flashforge_conversion.json',
      data: MiniZip.bytes(JSON.stringify({ converter: 'MakerWorld → FlashForge AD5X Chrome Extension', version: '0.1.0', target: TARGET }, null, 2))
    });

    return { bytes: await MiniZip.write(out), report };
  }

  globalThis.FlashForgeConverter = { convert3mf, TARGET };
})();
