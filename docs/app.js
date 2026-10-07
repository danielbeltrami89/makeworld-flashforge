const SAO_PAULO_KWH_PRICE = 0.78938;

const PRINTER_PRESETS = {
  ad5x: {
    label: "FlashForge AD5X",
    powerWatts: 120,
  },
  a1mini: {
    label: "Bambu Lab A1 mini",
    powerWatts: 90,
  },
};

const MATERIAL_PRESETS = {
  pla: { label: "PLA", price: 95 },
  petg: { label: "PETG", price: 110 },
  abs: { label: "ABS", price: 120 },
  tpu: { label: "TPU", price: 160 },
  resin: { label: "Resina", price: 180 },
  custom: { label: "Personalizado", price: 0 },
};

const DEFAULTS = {
  printerPreset: "ad5x",
  materialPreset: "pla",
  filamentPrice: 95,
  weightGrams: 35,
  printTime: "02:30",
  quantity: 1,
  powerWatts: PRINTER_PRESETS.ad5x.powerWatts,
  kwhPrice: SAO_PAULO_KWH_PRICE,
  machineHourly: "",
  wastePercent: 8,
  setupMinutes: "",
  laborHourly: "",
  fixedExtras: 0,
};

const STORAGE_KEY = "threeDQuoteCalculatorDefaults";
const STORAGE_VERSION = 2;

const currency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

function toNumber(value) {
  const parsed = Number.parseFloat(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function positive(value) {
  return Math.max(0, toNumber(value));
}

function percent(value) {
  return Math.min(95, Math.max(0, toNumber(value))) / 100;
}

function formatCurrency(value) {
  return currency.format(Number.isFinite(value) ? value : 0);
}

function formatDuration(hours) {
  const totalMinutes = Math.max(0, Math.round(hours * 60));
  const fullHours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${fullHours}h ${String(minutes).padStart(2, "0")}min`;
}

function formatTimeInput(hours) {
  const totalMinutes = Math.max(0, Math.round(hours * 60));
  const fullHours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(fullHours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function maskTimeInput(value) {
  const digits = String(value).replace(/\D/g, "").slice(0, 5);

  if (digits.length <= 2) {
    return digits;
  }

  const hours = digits.slice(0, -2).replace(/^0+(?=\d)/, "") || "0";
  const minutes = digits.slice(-2);
  return `${hours}:${minutes}`;
}

function parseTimeInput(value, fallbackHours = 0) {
  const text = String(value || "").trim();

  if (!text) {
    return fallbackHours;
  }

  if (text.includes(":")) {
    const [hoursText, minutesText = "0"] = text.split(":");
    const hours = positive(hoursText);
    const minutes = positive(minutesText);
    return hours + minutes / 60;
  }

  return positive(text);
}

function calculateQuote(values) {
  const quantity = Math.max(1, Math.floor(positive(values.quantity)));
  const weightGrams = positive(values.weightGrams);
  const filamentPrice = positive(values.filamentPrice);
  const legacyTime =
    positive(values.printHours) + Math.min(59, positive(values.printMinutes)) / 60;
  const printTimeHours = parseTimeInput(values.printTime, legacyTime);
  const wasteMultiplier = 1 + percent(values.wastePercent);

  const materialUnit = (weightGrams / 1000) * filamentPrice;
  const energyUnit =
    (positive(values.powerWatts) / 1000) * printTimeHours * positive(values.kwhPrice);
  const machineUnit = printTimeHours * positive(values.machineHourly);
  const productionUnit = materialUnit + energyUnit + machineUnit;

  const laborBatch = (positive(values.setupMinutes) / 60) * positive(values.laborHourly);
  const extrasBatch = positive(values.fixedExtras);
  const productionBatch = productionUnit * quantity * wasteMultiplier;
  const baseBatchCost = productionBatch + laborBatch + extrasBatch;
  const baseUnitCost = baseBatchCost / quantity;

  const breakdown = {
    material: materialUnit * wasteMultiplier,
    energy: energyUnit * wasteMultiplier,
    machine: machineUnit * wasteMultiplier,
    labor: laborBatch / quantity,
    extras: extrasBatch / quantity,
  };

  return {
    quantity,
    weightGrams,
    printTimeHours,
    materialUnit,
    energyUnit,
    machineUnit,
    laborBatch,
    extrasBatch,
    baseBatchCost,
    baseUnitCost,
    breakdown,
  };
}

function getSavedDefaults() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));

    if (!saved || typeof saved !== "object") {
      return DEFAULTS;
    }

    const migrated = { ...DEFAULTS, ...saved };

    if (!migrated.printTime && (saved.printHours || saved.printMinutes)) {
      migrated.printTime = formatTimeInput(
        positive(saved.printHours) + Math.min(59, positive(saved.printMinutes)) / 60
      );
    }

    if (saved._version !== STORAGE_VERSION) {
      migrated.machineHourly = DEFAULTS.machineHourly;
      migrated.setupMinutes = DEFAULTS.setupMinutes;
      migrated.laborHourly = DEFAULTS.laborHourly;
    }

    return migrated;
  } catch {
    return DEFAULTS;
  }
}

function collectValues(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function setFormValues(form, values) {
  Object.entries(values).forEach(([key, value]) => {
    const field = form.elements[key];
    if (field) {
      field.value = value;
    }
  });
}

function setText(id, text) {
  const element = document.getElementById(id);
  if (element) {
    element.textContent = text;
  }
}

function updatePrinterMeta() {
  const printerPreset = document.getElementById("printerPreset");
  const printerMeta = document.getElementById("printerMeta");
  const preset = PRINTER_PRESETS[printerPreset.value];

  if (preset && printerMeta) {
    printerMeta.textContent = `${preset.powerWatts} W médios`;
  }
}

function applyPrinterPreset() {
  const form = document.getElementById("quoteForm");
  const preset = PRINTER_PRESETS[form.elements.printerPreset.value];

  if (!preset) {
    return;
  }

  form.elements.powerWatts.value = preset.powerWatts;
  updatePrinterMeta();
}

function render() {
  const form = document.getElementById("quoteForm");
  const values = collectValues(form);
  const result = calculateQuote(values);

  setText("resultUnit", formatCurrency(result.baseUnitCost));
  setText("resultTotal", formatCurrency(result.baseBatchCost));
  setText("resultTime", formatDuration(result.printTimeHours));
  setText("lineMaterialValue", formatCurrency(result.breakdown.material));
  setText("lineEnergyValue", formatCurrency(result.breakdown.energy));
  setText("lineMachineValue", formatCurrency(result.breakdown.machine));
  setText("lineLaborValue", formatCurrency(result.breakdown.labor));
  setText("lineExtrasValue", formatCurrency(result.breakdown.extras));

  form.elements.printTime.value = formatTimeInput(result.printTimeHours);

  return result;
}

function buildQuoteText(values, result) {
  const material =
    MATERIAL_PRESETS[values.materialPreset]?.label || MATERIAL_PRESETS.custom.label;
  const printer =
    PRINTER_PRESETS[values.printerPreset]?.label || PRINTER_PRESETS.ad5x.label;

  return [
    "Custo de impressão 3D",
    `Impressora: ${printer}`,
    `Material: ${material}`,
    `Peso por peça: ${positive(values.weightGrams).toLocaleString("pt-BR")} g`,
    `Tempo por peça: ${formatDuration(result.printTimeHours)}`,
    `Quantidade: ${result.quantity}`,
    `Custo unitário: ${formatCurrency(result.baseUnitCost)}`,
    `Custo total do lote: ${formatCurrency(result.baseBatchCost)}`,
  ].join("\n");
}

function setupCalculator() {
  const form = document.getElementById("quoteForm");
  const printerPreset = document.getElementById("printerPreset");
  const materialPreset = document.getElementById("materialPreset");
  const filamentPrice = document.getElementById("filamentPrice");
  const printTime = document.getElementById("printTime");
  const status = document.getElementById("calculationStatus");

  setFormValues(form, getSavedDefaults());
  updatePrinterMeta();
  render();

  printerPreset.addEventListener("change", () => {
    applyPrinterPreset();
    status.textContent = "preset aplicado";
  });

  printTime.addEventListener("input", () => {
    printTime.value = maskTimeInput(printTime.value);
    status.textContent = "editar e calcular";
  });

  printTime.addEventListener("blur", () => {
    const normalized = formatTimeInput(parseTimeInput(printTime.value));
    printTime.value = normalized;
  });

  form.addEventListener("input", (event) => {
    if (event.target === filamentPrice) {
      materialPreset.value = "custom";
    }

    if (event.target !== printTime) {
      status.textContent = "editar e calcular";
    }
  });

  materialPreset.addEventListener("change", () => {
    const preset = MATERIAL_PRESETS[materialPreset.value];
    if (preset && materialPreset.value !== "custom") {
      filamentPrice.value = preset.price;
    }

    status.textContent = "material aplicado";
  });

  document.getElementById("calculateQuote").addEventListener("click", () => {
    render();
    status.textContent = "calculado";
  });

  document.getElementById("saveDefaults").addEventListener("click", () => {
    const result = render();
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...collectValues(form), _version: STORAGE_VERSION })
    );
    status.textContent = result.baseUnitCost > 0 ? "valores salvos" : "salvo";
  });

  document.getElementById("resetValues").addEventListener("click", () => {
    localStorage.removeItem(STORAGE_KEY);
    setFormValues(form, DEFAULTS);
    updatePrinterMeta();
    render();
    status.textContent = "padrão restaurado";
  });

  document.getElementById("copyQuote").addEventListener("click", async () => {
    const values = collectValues(form);
    const result = render();
    const quoteText = buildQuoteText(values, result);

    try {
      await navigator.clipboard.writeText(quoteText);
      status.textContent = "copiado";
    } catch {
      status.textContent = "falha ao copiar";
    }
  });
}

if (typeof document !== "undefined") {
  setupCalculator();
}

if (typeof module !== "undefined") {
  module.exports = {
    calculateQuote,
    formatDuration,
    formatTimeInput,
    parseTimeInput,
    maskTimeInput,
    formatCurrency,
  };
}
