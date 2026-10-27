export const noteFrequency = (note) => 440 * 2 ** ((note - 69) / 12);
const noteNames = [
  "C",
  "C♯",
  "D",
  "D♯",
  "E",
  "F",
  "F♯",
  "G",
  "G♯",
  "A",
  "A♯",
  "B",
];
export const noteName = (note) =>
  `${noteNames[note % 12]}${Math.floor(note / 12) - 1}`;

export const parameters = {
  unisonVoices: { label: "Unison voices", min: 1, max: 7, step: 1 },
  note: { label: "Note", min: 12, max: 84, step: 1 },
  unisonDetune: {
    label: "Unison detune",
    min: 0,
    max: 75,
    step: 1,
    unit: "ct",
  },
  unisonWidth: { label: "Unison width", min: 0, max: 100, step: 1, unit: "%" },
  drive: { label: "Drive", min: 5, max: 25, step: 0.1, unit: "dB" },
  cutoff: {
    label: "Low pass",
    min: 75,
    max: 10000,
    step: 5,
    unit: "Hz",
    log: true,
  },
  noiseLevel: { label: "Noise level", min: 0, max: 20, step: 1, unit: "%" },
  resonance: { label: "Resonance", min: 0, max: 100, step: 1, unit: "%" },
};

export const defaults = Object.freeze({
  note: 36,
  unisonVoices: 2,
  unisonDetune: 9,
  noiseLevel: 0,
  cutoff: 1800,
  resonance: 0,
  drive: 25,
  unisonWidth: 75,
});

export function unisonDetunes(voices, detune) {
  return Array.from({ length: voices }, (_, index) =>
    voices === 1 ? 0 : ((2 * index) / (voices - 1) - 1) * detune,
  );
}

export function seededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

export const settingKeys = Object.keys(defaults);
export const signature = (settings) =>
  settingKeys.map((key) => settings[key]).join(",");

export function randomSettings(settings, locks, random = Math.random) {
  const next = { ...settings };
  for (const [key, parameter] of Object.entries(parameters)) {
    if (locks[key]) continue;
    if (parameter.values)
      next[key] =
        parameter.values[Math.floor(random() * parameter.values.length)];
    else {
      let value = parameter.log
        ? Math.exp(
            Math.log(parameter.min) +
              random() * Math.log(parameter.max / parameter.min),
          )
        : parameter.min + random() * (parameter.max - parameter.min);
      if (key === "note") value = 28 + random() * 24;
      next[key] = Number(
        (Math.round(value / parameter.step) * parameter.step).toFixed(4),
      );
    }
  }
  return next;
}

// A versioned, positional format, independent of UI state.
export function encodeSettings(settings) {
  return [17, ...settingKeys.map((key) => settings[key])].join(",");
}

export function decodeSettings(value) {
  if (!value || value.length > 256) return null;
  const tokens = value.split(",");
  if (!tokens.every((token) => /^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(token)))
    return null;
  let values = tokens.map(Number);
  if (!values.every(Number.isFinite)) return null;
  if (values[0] === 1) {
    // Preserve the remaining sound controls from links made before simplification.
    const legacyBounds = [
      [0, 100],
      [0, 20],
      [0, 100],
      [0, 20],
      [0, 100],
      [0.2, 4],
      [0, 2],
      [0, 1],
    ];
    if (
      values.length !== 16 ||
      legacyBounds.some(
        ([min, max], index) =>
          values[index + 8] < min || values[index + 8] > max,
      ) ||
      ![0, 1].includes(values[15])
    )
      return null;
    values = [2, ...values.slice(1, 8)];
  }
  if (values[0] === 2 && values.length === 8) {
    values = [3, ...values.slice(1), defaults.noiseLevel];
  }
  if (values[0] === 3) {
    if (
      values.length !== 9 ||
      values[4] < 0 ||
      values[4] > 100 ||
      values[5] < 0 ||
      values[5] > 24 ||
      values[6] < -24 ||
      values[6] > 0 ||
      values[8] < 0 ||
      values[8] > 100
    )
      return null;
    values = [
      4,
      ...values.slice(1, 4),
      Math.min(75, values[4]),
      values[5],
      values[7],
      Math.min(30, values[8]),
    ];
  }
  if (values[0] === 4 && values.length === 8) {
    values = [5, ...values.slice(1), 2, 0];
  }
  if (values[0] === 5 && values.length === 10) {
    values = [6, ...values.slice(1), 0, 0];
  }
  if (values[0] === 6) {
    const bounds = [
      [0, 1],
      [0, 1],
      [24, 72],
      [0, 75],
      [0, 30],
      [80, 12000],
      [0, 30],
      [0, 20],
      [0, 4],
      [0, 100],
      [0, 100],
    ];
    if (
      values.length !== 12 ||
      bounds.some(
        ([min, max], index) =>
          values[index + 1] < min || values[index + 1] > max,
      ) ||
      ![0, 1].includes(values[1]) ||
      ![0, 1].includes(values[2]) ||
      !Number.isInteger(values[3])
    )
      return null;
    values = [
      7,
      values[3],
      2,
      values[4],
      values[7],
      values[6],
      values[10],
      values[5],
    ];
  }
  if (values[0] === 7 && values.length === 8)
    values = [11, ...values.slice(1)];
  if (values[0] === 8 && values.length === 10)
    values = [10, ...values.slice(1)];
  // Version 9's obsolete final control is validated and discarded.
  if (values[0] === 9) {
    if (values.length !== 11 || values[10] < 0 || values[10] > 100) return null;
    values = [10, ...values.slice(1, -1)];
  }
  // Validate and discard the two retired effect controls from older links.
  if (values[0] === 10) {
    if (
      values.length !== 10 ||
      values.slice(8).some((value) => value < 0 || value > 100)
    )
      return null;
    values = [11, ...values.slice(1, 8)];
  }
  if (values[0] === 11 && values.length === 8)
    values = [13, ...values.slice(1), 0];
  // Validate and discard the retired notch controls.
  if (values[0] === 12) {
    if (values.length !== 10 || values[8] < 20 || values[8] > 12000 || values[9] < 0.1 || values[9] > 30) return null;
    values = [13, ...values.slice(1, 8), 0];
  }
  // Validate and discard the retired chorus mix.
  if (values[0] === 13) {
    if (values.length !== 9 || values[8] < 0 || values[8] > 100) return null;
    values = [14, ...values.slice(1, 8)];
  }
  if (values[0] === 14 && values.length === 8)
    values = [15, ...values.slice(1), 0];
  if (values[0] === 15 && values.length === 9)
    values = [16, ...values.slice(1), 0];
  // Validate and discard the retired noise-width control.
  if (values[0] === 16) {
    if (values.length !== 10 || values[9] < 0 || values[9] > 100) return null;
    values = [17, ...values.slice(1, 9)];
  }
  if (values[0] !== 17 || values.length !== settingKeys.length + 1) return null;
  // Preserve links from when noise could reach 30%, clamping to today's limit.
  const noiseIndex = settingKeys.indexOf("noiseLevel") + 1;
  if (values[noiseIndex] >= 0 && values[noiseIndex] <= 30)
    values[noiseIndex] = Math.min(parameters.noiseLevel.max, values[noiseIndex]);
  // Preserve old links while capping their drive at the current maximum.
  const driveIndex = settingKeys.indexOf("drive") + 1;
  if (values[driveIndex] >= 0 && values[driveIndex] <= 30)
    values[driveIndex] = Math.max(parameters.drive.min, Math.min(parameters.drive.max, values[driveIndex]));
  const cutoffIndex = settingKeys.indexOf("cutoff") + 1;
  if (values[cutoffIndex] >= parameters.cutoff.min && values[cutoffIndex] <= 12000)
    values[cutoffIndex] = Math.max(parameters.cutoff.min, Math.min(parameters.cutoff.max, values[cutoffIndex]));
  const settings = {};
  for (let index = 0; index < settingKeys.length; index++) {
    const key = settingKeys[index],
      value = values[index + 1],
      parameter = parameters[key];
    if (!Number.isFinite(value)) return null;
    if (parameter.values) {
      if (![0, 1].includes(value)) return null;
      settings[key] = value ? "square" : "sawtooth";
    } else {
      if (
        value < parameter.min ||
        value > parameter.max ||
        (["note", "unisonVoices"].includes(key) && !Number.isInteger(value))
      )
        return null;
      settings[key] = value;
    }
  }
  return { settings };
}
