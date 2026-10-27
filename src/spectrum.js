export const spectrumFftSize = 16384;

// Precompute logarithmic bin groups once per FFT configuration.
const layouts = new Map();
function spectrumLayout(length, sampleRate, columns = 720) {
  const key = `${length}:${sampleRate}:${columns}`;
  if (layouts.has(key)) return layouts.get(key);
  const binHz = sampleRate / (length * 2);
  const high = Math.min(20000, sampleRate / 2);
  const scale = 720 / Math.log(high / 20);
  const groups = [];
  let column = -1;
  for (let bin = Math.max(1, Math.ceil(20 / binHz)); bin < length && bin * binHz <= high; bin++) {
    const x = Math.log(bin * binHz / 20) * scale;
    const nextColumn = Math.floor(x / 720 * columns);
    if (nextColumn !== column) {
      groups.push({ start: bin, end: bin + 1, x: [] });
      column = nextColumn;
    }
    const group = groups[groups.length - 1];
    group.end = bin + 1;
    group.x.push(x);
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
    path.push(`L${group.x[peakBin - group.start].toFixed(2)},${(90 - level * 88).toFixed(2)}`);
  }
  return audible ? path.join(" ") + " L720,90" : "M0,90H720";
}

// Numeric output avoids allocating and parsing an SVG path on every frame.
export function spectrumPoints(samples, sampleRate, output, columns = 720) {
  const groups = spectrumLayout(samples.length, sampleRate, columns);
  const length = (groups.length + 2) * 2;
  if (output?.length !== length) output = new Float32Array(length);
  output[0] = 0; output[1] = 90;
  for (let i = 0; i < groups.length; i++) {
    const group = groups[i];
    let peak = -Infinity, peakBin = group.start;
    for (let bin = group.start; bin < group.end; bin++) {
      if (samples[bin] > peak) { peak = samples[bin]; peakBin = bin; }
    }
    const level = Math.max(0, Math.min(1, (peak + 96) / 84));
    output[(i + 1) * 2] = group.x[peakBin - group.start];
    output[(i + 1) * 2 + 1] = 90 - level * 88;
  }
  output[length - 2] = 720; output[length - 1] = 90;
  return output;
}
