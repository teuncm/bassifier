// Align two periods to the voice's continuous phase, independent of zero crossings.
export function oscillationSamples(samples, sampleRate, frequency, phase, points = 512, output = new Float32Array(points)) {
  const period = sampleRate / frequency;
  const span = Math.min(period * 2, samples.length - 1);
  const start = Math.max(0, samples.length - 1 - span - (phase % 1) * period);
  for (let index = 0; index < points; index++) {
    const position = start + (index / (points - 1)) * span;
    const left = Math.min(samples.length - 1, Math.floor(position));
    const right = Math.min(samples.length - 1, left + 1);
    const value = samples[left] + (samples[right] - samples[left]) * (position - left);
    output[index] = Math.max(-0.25, Math.min(0.25, value));
  }
  return output;
}

// A short display-only settling time softens the steps between audio captures.
export function smoothTrace(display, target, elapsed) {
  const amount = -Math.expm1(-Math.max(0, elapsed) / 0.025);
  for (let index = 0; index < display.length; index++)
    display[index] += (target[index] - display[index]) * amount;
}

const coordinatePrefixes = new Map();
export function tracePath(values) {
  if (!coordinatePrefixes.has(values.length)) {
    if (coordinatePrefixes.size >= 4) coordinatePrefixes.delete(coordinatePrefixes.keys().next().value);
    coordinatePrefixes.set(values.length, Array.from({ length: values.length }, (_, index) =>
      (index ? "L" : "M") + (index / (values.length - 1) * 720).toFixed(2) + ","));
  }
  const prefixes = coordinatePrefixes.get(values.length);
  return Array.from(values, (value, index) => {
    const y = 42 - value * 152;
    return prefixes[index] + y.toFixed(2);
  }).join(" ");
}

export function oscillationPath(samples, sampleRate, frequency, phase, points = 512) {
  return tracePath(oscillationSamples(samples, sampleRate, frequency, phase, points));
}
