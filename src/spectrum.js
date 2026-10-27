export const spectrumFftSize = 16384;

// Precompute logarithmic bin groups once per FFT configuration.
const layouts = new Map();
function spectrumLayout(length, sampleRate) {
  const key = `${length}:${sampleRate}`;
  if (layouts.has(key)) return layouts.get(key);
  const binHz = sampleRate / (length * 2);
  const high = Math.min(20000, sampleRate / 2);
  const scale = 720 / Math.log(high / 20);
  const groups = [];
  let column = -1;
  for (let bin = Math.max(1, Math.ceil(20 / binHz)); bin < length && bin * binHz <= high; bin++) {
    const x = Math.log(bin * binHz / 20) * scale;
    const nextColumn = Math.floor(x);
    if (nextColumn !== column) {
      groups.push({ start: bin, end: bin + 1, x: [] });
      column = nextColumn;
    }
    const group = groups[groups.length - 1];
    group.end = bin + 1;
    group.x.push(x.toFixed(2));
  }
  if (layouts.size >= 4) layouts.delete(layouts.keys().next().value);
  layouts.set(key, groups);
  return groups;
}

// Keep individual bass bins, retaining the strongest peak per pixel at high frequencies.
export function spectrumPath(samples, sampleRate) {
  const groups = spectrumLayout(samples.length, sampleRate);
  const path = ["M0,90"];
  let audible = false;
  for (const group of groups) {
    let peak = -Infinity, peakBin = group.start;
    for (let bin = group.start; bin < group.end; bin++) {
      if (samples[bin] > peak) { peak = samples[bin]; peakBin = bin; }
    }
    const level = Math.max(0, Math.min(1, (peak + 96) / 84));
    audible ||= level > 0;
    path.push(`L${group.x[peakBin - group.start]},${(90 - level * 88).toFixed(2)}`);
  }
  return audible ? path.join(" ") + " L720,90" : "M0,90H720";
}
