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
  unisonVoices: { label: "Unison voices", min: 1, max: 5, step: 1 },
  note: { label: "Note", min: 12, max: 84, step: 1 },
  unisonDetune: {
    label: "Unison detune",
    min: 0,
    max: 75,
    step: 1,
    unit: "ct",
  },
  unisonWidth: { label: "Unison width", min: 0, max: 100, step: 1, unit: "%" },
  drive: { label: "Drive", min: 10, max: 25, step: 0.1, unit: "dB" },
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
      if (key === "note") value = 24 + Math.floor(random() * 25);
      next[key] = Number(
        (Math.round(value / parameter.step) * parameter.step).toFixed(4),
      );
    }
  }
  return next;
}

// Version 1: the eight current sound parameters, independent of UI state.
export function encodeSettings(settings) {
  return [1, ...settingKeys.map((key) => settings[key])].join(",");
}

export function decodeSettings(value) {
  if (typeof value !== "string" || !value || value.length > 256) return null;
  const tokens = value.split(",");
  if (tokens.length !== settingKeys.length + 1 ||
      !tokens.every((token) => /^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(token))) return null;
  const values = tokens.map(Number);
  if (values[0] !== 1 || !values.every(Number.isFinite)) return null;
  const settings = {};
  for (let index = 0; index < settingKeys.length; index++) {
    const key = settingKeys[index], value = values[index + 1], parameter = parameters[key];
    if (value < parameter.min || value > parameter.max ||
        (["note", "unisonVoices"].includes(key) && !Number.isInteger(value))) return null;
    settings[key] = value;
  }
  return { settings };
}
