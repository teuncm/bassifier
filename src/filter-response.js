const grids = new Map(), responses = new Map();
function frequencyGrid(sampleRate) {
  if (grids.has(sampleRate)) return grids.get(sampleRate);
  const maxFrequency = Math.min(20000, sampleRate * 0.49);
  const grid = Array.from({ length: 257 }, (_, index) => {
    const frequency = 20 * (maxFrequency / 20) ** (index / 256);
    const w = 2 * Math.PI * frequency / sampleRate;
    return { position: index / 256, frequency, c1: Math.cos(w), c2: Math.cos(2 * w), s1: Math.sin(w), s2: Math.sin(2 * w) };
  });
  if (grids.size >= 4) grids.delete(grids.keys().next().value);
  grids.set(sampleRate, grid);
  return grid;
}

// Shared logarithmic response for the filter visual and the fish's hair.
export function filterResponse(cutoffValue, resonance, sampleRate = 44100) {
  const key = `${cutoffValue}:${resonance}:${sampleRate}`;
  if (responses.has(key)) return responses.get(key);
  const rate = sampleRate;
  const cutoff = Math.min(cutoffValue, rate * 0.4);
  const q = Math.SQRT1_2 * (20 / Math.SQRT1_2) ** (resonance / 100);
  const omega = (2 * Math.PI * cutoff) / rate;
  const cosine = Math.cos(omega),
    alpha = Math.sin(omega) / (2 * q);
  const b0 = (1 - cosine) / 2,
    b1 = 1 - cosine,
    b2 = b0;
  const a0 = 1 + alpha,
    a1 = -2 * cosine,
    a2 = 1 - alpha;
  const response = frequencyGrid(rate).map(({ position, frequency, c1, c2, s1, s2 }) => {
    const magnitude =
      Math.hypot(b0 + b1 * c1 + b2 * c2, b1 * s1 + b2 * s2) /
      Math.hypot(a0 + a1 * c1 + a2 * c2, a1 * s1 + a2 * s2);
    const db = 20 * Math.log10(Math.max(1e-8, magnitude));
    const y = Math.max(3, Math.min(77, 40 - db * 1.2));
    return { position, frequency, magnitude, db, y };
  });
  if (responses.size >= 16) responses.delete(responses.keys().next().value);
  responses.set(key, response);
  return response;
}
