"""Synthetic regression fixtures; the user's licensed keychain is never committed."""
import copy
import json
import os
from pathlib import Path
import struct
import subprocess
import sys
import tempfile
import unittest
import xml.etree.ElementTree as ET
import zipfile

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
from inspect_3mf import inspect, compare, CORE, PROD

SETTINGS = {
    'printer_model': 'Bambu Lab A1', 'printer_settings_id': 'Bambu Lab A1 0.4 nozzle',
    'print_settings_id': 'Custom fine keychain', 'layer_height': '0.08',
    'initial_layer_print_height': '0.2', 'wall_generator': 'arachne',
    'enable_support': '1', 'support_type': 'tree(auto)', 'support_style': 'tree_slim',
    'support_top_z_distance': '0.3', 'tree_support_wall_count': '-1',
    'raft_first_layer_expansion': '-1', 'filament_colour': ['#000000', '#FFFFFF', '#FFFFFF'],
    'filament_type': ['PLA', 'PLA', 'PLA'], 'filament_diameter': ['1.75'] * 3,
    'filament_settings_id': ['Generic PLA @BBL A1'] * 3,
    'default_filament_profile': ['Generic PLA @BBL A1'],
    'nozzle_temperature': ['220', '215', '210'], 'textured_plate_temp': ['60'] * 3,
    'filament_start_gcode': ['M1002'] * 3, 'machine_start_gcode': 'M620',
    'before_layer_change_gcode': 'M1002', 'layer_change_gcode': 'M1002',
    'inherits_group': ['0.16mm High Quality @BBL A1', '', '', '', ''],
    'different_settings_to_system': ['layer_height;enable_support', '', '', '', ''],
    'compatible_machine_expression_group': ['printer_model=="Bambu Lab A1"'] * 5,
    'compatible_process_expression_group': ['Bambu'] * 3,
    'version': '02.06.01.55',
}


def box(oid, size):
    x, y, z = size
    vertices = [(0, 0, 0), (x, 0, 0), (x, y, 0), (0, y, 0),
                (0, 0, z), (x, 0, z), (x, y, z), (0, y, z)]
    triangles = [(0, 2, 1), (0, 3, 2), (4, 5, 6), (4, 6, 7),
                 (0, 1, 5), (0, 5, 4), (1, 2, 6), (1, 6, 5),
                 (2, 3, 7), (2, 7, 6), (3, 0, 4), (3, 4, 7)]
    vs = ''.join(f'<vertex x="{a}" y="{b}" z="{c}"/>' for a, b, c in vertices)
    ts = ''.join(f'<triangle v1="{a}" v2="{b}" v3="{c}" paint_color="0C"/>' for a, b, c in triangles)
    return f'<object id="{oid}" type="model"><mesh><vertices>{vs}</vertices><triangles>{ts}</triangles></mesh></object>'


def fixture(settings=None, nested=False, multiple=False, unit='millimeter', unicode_boundary=False):
    props = copy.deepcopy(SETTINGS)
    props.update(settings or {})
    prefix = (f'<model xmlns="{CORE}" xmlns:p="{PROD}" unit="{unit}" requiredextensions="p">'
              '<metadata name="Application">BambuStudio-02.06.01.55</metadata>')
    if unicode_boundary:
        prefix += '<metadata name="Description">'
        prefix += 'x' * (128 * 1024 - 1 - len(prefix.encode())) + '\U0001f600</metadata>'
    components = (f'<component p:path="/3D/Objects/parts.model" objectid="1"/>'
                  '<component p:path="/3D/Objects/parts.model" objectid="2" transform="1 0 0 0 1 0 0 0 1 3 1 3.45"/>'
                  '<component p:path="/3D/Objects/parts.model" objectid="3" transform="1 0 0 0 1 0 0 0 1 -2 2 0"/>')
    resources = f'<object id="10" type="model"><components>{components}</components></object>'
    if nested:
        resources += ('<object id="11" type="model"><components><component objectid="10" '
                      'transform="0 1 0 -1 0 0 0 0 1 10 20 0"/></components></object>')
    resources += ('<object id="4" type="model"><components><component objectid="' + ('11' if nested else '10') + '" '
                  'transform="2 0 0 0 3 0 0 0 1 4 5 0"/></components></object>')
    build = '<item objectid="4" transform="1 0 0 0 1 0 0 0 1 100 100 0" printable="1"/>'
    if multiple:
        build += '<item objectid="10" transform="1 0 0 0 1 0 0 0 1 30 40 0" printable="1"/>'
    model = prefix + f'<resources>{resources}</resources><build>{build}</build></model>'
    parts = (f'<model xmlns="{CORE}" unit="{unit}"><resources>'
             '<basematerials id="100"><base name="black" displaycolor="#000000FF"/>'
             '<base name="white" displaycolor="#FFFFFFFF"/></basematerials>'
             + box(1, (10, 5, 3.5)).replace('id="1"', 'id="1" pid="100" pindex="0"')
             + box(2, (27.205, 7.94, 1.5)).replace('id="2"', 'id="2" pid="100" pindex="1"') + box(3, (4, 4, 2))
             + '</resources></model>')
    relns = 'http://schemas.openxmlformats.org/package/2006/relationships'
    entries = {
        '[Content_Types].xml': '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>',
        '3D/3dmodel.model': model, '3D/Objects/parts.model': parts,
        '_rels/.rels': f'<Relationships xmlns="{relns}"><Relationship Id="r0" Target="/3D/3dmodel.model" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>',
        '3D/_rels/3dmodel.model.rels': f'<Relationships xmlns="{relns}"><Relationship Id="r1" Target="/3D/Objects/parts.model" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>',
        'Metadata/project_settings.config': json.dumps(props),
        'Metadata/model_settings.config': '<config><object id="4"><metadata key="extruder" value="1"/><part id="1" subtype="normal_part"><metadata key="name" value="base"/></part><part id="2" subtype="normal_part"><metadata key="extruder" value="2"/><metadata key="name" value="text"/></part><part id="3" subtype="normal_part"><metadata key="name" value="ring"/></part></object><plate><model_instance><metadata key="object_id" value="4"/></model_instance></plate></config>',
        'Metadata/custom_gcode_per_layer.xml': '<custom_gcodes_per_layer/>',
        'Metadata/layer_height_profile.txt': 'object_id=4|0;0.08;3.5;0.08;4.95;0.08',
        'Metadata/filament_sequence.json': '{"sequence":[0,1,2]}',
        'Textures/color.bin': b'\x00\x01\x80\xff',
    }
    return {k: v.encode() if isinstance(v, str) else v for k, v in entries.items()}


class ConversionTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.directory = Path(self.temp.name)
        self.sequence = 0

    def convert(self, entries):
        self.sequence += 1
        original = self.directory / f'original{self.sequence}.3mf'
        converted = self.directory / f'converted{self.sequence}.3mf'
        with zipfile.ZipFile(original, 'w', compression=zipfile.ZIP_STORED) as archive:
            for name, data in entries.items():
                archive.writestr(name, data)
        run = subprocess.run(['node', str(ROOT / 'scripts/convert.js'), str(original), str(converted)],
                             text=True, capture_output=True)
        self.assertEqual(run.returncode, 0, run.stderr)
        return original, converted, json.loads(run.stdout)

    def test_keychain_geometry_colors_and_relative_positions(self):
        a, b, _ = self.convert(fixture())
        report = compare(a, b)
        self.assertTrue(report['geometry_equal'])
        self.assertEqual(report['removed_entries'], [])
        self.assertEqual(len(report['components']), 3)
        self.assertEqual(sum(c['triangles'] for c in report['components']), 36)
        self.assertEqual([c['color'] for c in report['components']], ['#000000', '#FFFFFF', '#000000'])
        self.assertEqual(report['components'][1]['world_bbox_mm']['min'][2], 3.45)
        self.assertEqual(report['components'][0]['world_bbox_mm']['max'][2], 3.5)

    def test_nested_rotations_scales_translations_and_multiple_build_items(self):
        a, b, _ = self.convert(fixture(nested=True, multiple=True))
        report = compare(a, b)
        self.assertTrue(report['geometry_equal'])
        self.assertEqual(len(report['components']), 6)
        bbox = report['components'][0]['world_bbox_mm']
        self.assertEqual(bbox['min'], [114, 165, 0])
        self.assertEqual(bbox['max'], [124, 195, 3.5])

    def test_units_and_external_resources_are_preserved(self):
        a, b, _ = self.convert(fixture(unit='inch'))
        self.assertTrue(compare(a, b)['geometry_equal'])
        self.assertAlmostEqual(inspect(b)['geometry']['components'][0]['world_bbox_mm']['max'][2], 88.9)

    def test_preserves_process_and_each_filament_override(self):
        _, b, _ = self.convert(fixture())
        settings = inspect(b)['settings']
        for key in ['layer_height', 'initial_layer_print_height', 'enable_support', 'support_type',
                    'support_style', 'support_top_z_distance', 'wall_generator', 'nozzle_temperature', 'filament_colour']:
            self.assertEqual(settings[key], SETTINGS[key])
        slots = settings['different_settings_to_system']
        self.assertEqual(len(slots), 5)
        self.assertIn('layer_height', slots[0].split(';'))
        self.assertIn('enable_support', slots[0].split(';'))
        for slot in slots[1:4]:
            self.assertIn('nozzle_temperature', slot.split(';'))
            self.assertIn('filament_colour', slot.split(';'))
            self.assertNotIn('filament_start_gcode', slot.split(';'))
        self.assertEqual(slots[-1], '')
        self.assertEqual(settings['print_compatible_printers'], ['Flashforge AD5X 0.4 nozzle'])
        self.assertNotIn('BBL', json.dumps(settings['inherits_group']))
        self.assertEqual(settings['compatible_machine_expression_group'], [''] * 5)

    def test_builds_override_slots_when_missing(self):
        entries = fixture()
        settings = json.loads(entries['Metadata/project_settings.config'])
        del settings['different_settings_to_system']
        del settings['inherits_group']
        entries['Metadata/project_settings.config'] = json.dumps(settings).encode()
        _, b, _ = self.convert(entries)
        self.assertEqual(len(inspect(b)['settings']['different_settings_to_system']), 5)

    def test_support_auto_translation_and_explicit_values(self):
        for wall, expansion, expected in [('-1', '-1', ('0', '2')), (1, 3, (1, 3)), (-1, -1, (0, 2))]:
            with self.subTest(wall=wall):
                _, b, report = self.convert(fixture({'tree_support_wall_count': wall, 'raft_first_layer_expansion': expansion}))
                config = inspect(b)['settings']
                self.assertEqual((config['tree_support_wall_count'], config['raft_first_layer_expansion']), expected)
                self.assertEqual(bool(report['warnings']), str(expansion) == '-1')

    def test_no_temperature_clamp_on_filament_indices_or_material_properties(self):
        extra = {'support_filament': '999', 'filament_density': ['1200'], 'nozzle_temperature': ['320', '215', '210']}
        _, b, _ = self.convert(fixture(extra))
        config = inspect(b)['settings']
        self.assertEqual(config['support_filament'], '999')
        self.assertEqual(config['filament_density'], ['1200'])
        self.assertEqual(config['nozzle_temperature'], ['300', '215', '210'])

    def test_unknown_nested_metadata_is_not_treated_as_printer_profile(self):
        extra = {'extension_data': {'version': '1.2.3', 'printer_model': 'source', 'layer_height': '0.05'}}
        _, b, _ = self.convert(fixture(extra))
        self.assertEqual(inspect(b)['settings']['extension_data'], extra['extension_data'])

    def test_utf8_character_crossing_header_limit_is_not_corrupted(self):
        entries = fixture(unicode_boundary=True)
        _, b, _ = self.convert(entries)
        with zipfile.ZipFile(b) as archive:
            expected = entries['3D/3dmodel.model'].replace(b'BambuStudio-02.06.01.55', b'BambuStudio-02.04.00.02')
            self.assertEqual(archive.read('3D/3dmodel.model'), expected)
            ET.fromstring(archive.read('3D/3dmodel.model'))

    def test_preserves_all_other_entries_and_is_idempotent(self):
        entries = fixture()
        _, b, _ = self.convert(entries)
        with zipfile.ZipFile(b) as archive:
            next_entries = {n: archive.read(n) for n in archive.namelist()}
        for name, data in entries.items():
            if name not in ['3D/3dmodel.model', 'Metadata/project_settings.config']:
                self.assertEqual(next_entries[name], data, name)
        _, c, _ = self.convert(next_entries)
        self.assertEqual(inspect(b)['settings'], inspect(c)['settings'])
        self.assertTrue(compare(b, c)['geometry_equal'])

    def test_corrupted_mesh_crc_is_rejected_without_output(self):
        a, _, _ = self.convert(fixture())
        with zipfile.ZipFile(a) as archive:
            entry = archive.getinfo('3D/Objects/parts.model')
        data = bytearray(a.read_bytes())
        name_len, extra_len = struct.unpack_from('<HH', data, entry.header_offset + 26)
        data[entry.header_offset + 30 + name_len + extra_len + 10] ^= 1
        a.write_bytes(data)
        output = self.directory / 'bad.3mf'
        run = subprocess.run(['node', str(ROOT / 'scripts/convert.js'), str(a), str(output)], text=True, capture_output=True)
        self.assertNotEqual(run.returncode, 0)
        self.assertIn('CRC', run.stderr)
        self.assertFalse(output.exists())

    def test_truncated_archive_and_duplicate_resources_are_rejected(self):
        for mode in ['truncate', 'duplicate']:
            with self.subTest(mode=mode):
                a, _, _ = self.convert(fixture())
                if mode == 'truncate':
                    a.write_bytes(a.read_bytes()[:-30])
                else:
                    import warnings
                    with warnings.catch_warnings():
                        warnings.simplefilter('ignore', UserWarning)
                        with zipfile.ZipFile(a, 'a') as archive:
                            archive.writestr('3D/Objects/parts.model', b'<model/>')
                output = self.directory / f'{mode}.3mf'
                run = subprocess.run(['node', str(ROOT / 'scripts/convert.js'), str(a), str(output)], text=True, capture_output=True)
                self.assertNotEqual(run.returncode, 0)
                self.assertFalse(output.exists())

    @unittest.skipUnless(os.environ.get('ORIGINAL_3MF'), 'Set ORIGINAL_3MF for local licensed model validation')
    def test_local_keychain_without_redistributing_model(self):
        original = Path(os.environ['ORIGINAL_3MF'])
        output = self.directory / 'keychain.3mf'
        subprocess.run(['node', str(ROOT / 'scripts/convert.js'), str(original), str(output)],
                       check=True, capture_output=True)
        report = compare(original, output)
        self.assertTrue(report['geometry_equal'])
        self.assertEqual(len(report['components']), 3)
        self.assertEqual(sum(c['vertices'] for c in report['components']), 6642)
        self.assertEqual(sum(c['triangles'] for c in report['components']), 13280)


if __name__ == '__main__':
    unittest.main()
