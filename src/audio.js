import {
  noteFrequency,
  parameters,
  seededRandom,
  signature,
  unisonDetunes,
} from "./settings.js";

const noiseBuffers = new Map();
function whiteNoiseBuffer(context) {
  const rate = context.sampleRate;
  if (noiseBuffers.has(rate)) return noiseBuffers.get(rate);
  const buffer = context.createBuffer(1, rate * 4, rate);
  const samples = buffer.getChannelData(0);
  const random = seededRandom(0xbaa551f1);
  let mean = 0;
  for (let i = 0; i < samples.length; i++) {
    samples[i] = random() * 2 - 1;
    mean += samples[i];
  }
  mean /= samples.length;
  for (let i = 0; i < samples.length; i++) samples[i] -= mean;
  noiseBuffers.set(rate, buffer);
  if (noiseBuffers.size > 2)
    noiseBuffers.delete(noiseBuffers.keys().next().value);
  return buffer;
}

export function parabolicSample(input) {
  const x = Math.max(-1, Math.min(1, input));
  return 2 * x - x * Math.abs(x);
}

// Retained alternative for future shaping experiments.
export function tanhSample(input) {
  return Math.tanh(input);
}

// Combined gain and parabolic shaping transfer, shared with the interface.
export function driveSample(input, drive) {
  const db = Math.max(parameters.drive.min, Math.min(parameters.drive.max, drive));
  return parabolicSample(input * 10 ** (db / 20));
}

const driveCurves = new Map();
function driveCurve(drive) {
  const key = drive;
  if (!driveCurves.has(key)) {
    driveCurves.set(
      key,
      Float32Array.from({ length: 16385 }, (_, i) =>
        driveSample(i / 8192 - 1, drive),
      ),
    );
    if (driveCurves.size > 8)
      driveCurves.delete(driveCurves.keys().next().value);
  }
  return driveCurves.get(key);
}
const limitCurve = Float32Array.from({ length: 16385 }, (_, i) => {
  const x = i / 8192 - 1;
  return Math.abs(x) <= 0.2
    ? x
    : Math.sign(x) * (0.2 + 0.05 * Math.tanh((Math.abs(x) - 0.2) / 0.05));
});
const guardCurve = Float32Array.from({ length: 16385 }, (_, i) =>
  Math.max(-0.25, Math.min(0.25, i / 8192 - 1)),
);
const smooth = (param, value, time) => {
  if (typeof param.cancelAndHoldAtTime === "function")
    param.cancelAndHoldAtTime(time);
  else {
    // Older Web Audio implementations need the current value held explicitly.
    const heldValue = param.value;
    param.cancelScheduledValues(time);
    param.setValueAtTime(heldValue, time);
  }
  param.setTargetAtTime(value, time, 0.015);
};
const releaseTail = 0.025;
export const exportDuration = 5;
export const cutoffLfoEnabled = false;
export const glideDuration = 0.3;

function cutoffModulationCurve(cutoff, sampleRate) {
  const minimum = 1200 * Math.log2(parameters.cutoff.min / cutoff);
  const maximum = 1200 * Math.log2(Math.min(parameters.cutoff.max, sampleRate * 0.4) / cutoff);
  return Float32Array.from({ length: 4097 }, (_, index) =>
    Math.max(minimum, Math.min(maximum, (index / 2048 - 1) * 4800)),
  );
}

// Used by both the live instrument and OfflineAudioContext exports.
export function createVoice(
  context,
  settings,
  {
    start = context.currentTime,
    duration = null,
    velocity = 1,
    onEnded,
    destination = context.destination,
    initialFrequency = noteFrequency(settings.note),
  } = {},
) {
  let current = { ...settings },
    stopped = false,
    disposed = false;
  let pitchRamp = {
    from: initialFrequency,
    to: initialFrequency,
    start,
    end: start,
    phase: 0,
  };
  function phaseAt(time = context.currentTime) {
    const elapsed = Math.max(0, Math.min(time, pitchRamp.end) - pitchRamp.start);
    const length = pitchRamp.end - pitchRamp.start;
    return pitchRamp.phase + pitchRamp.from * elapsed +
      (length > 0 ? (pitchRamp.to - pitchRamp.from) * elapsed ** 2 / (2 * length) : 0) +
      pitchRamp.to * Math.max(0, time - pitchRamp.end);
  }
  function frequencyAt(time = context.currentTime) {
    if (time >= pitchRamp.end) return pitchRamp.to;
    if (time <= pitchRamp.start) return pitchRamp.from;
    return (
      pitchRamp.from +
      ((pitchRamp.to - pitchRamp.from) * (time - pitchRamp.start)) /
        (pitchRamp.end - pitchRamp.start)
    );
  }
  function glideTo(frequency, time) {
    const from = frequencyAt(time);
    const phase = phaseAt(time);
    pitchRamp = { from, to: frequency, start: time, end: time + glideDuration, phase };
    for (const { osc } of oscillators) {
      osc.frequency.cancelScheduledValues(time);
      osc.frequency.setValueAtTime(from, time);
      osc.frequency.linearRampToValueAtTime(frequency, time + glideDuration);
    }
  }
  const nodes = [],
    sources = [];
  const node = (kind, ...args) => {
    const value = context[kind](...args);
    nodes.push(value);
    return value;
  };
  const gain = (value) => {
    const result = node("createGain");
    result.gain.value = value;
    return result;
  };
  const oscillators = [];
  let started = false;
  let noise;
  const noiseGain = gain(Math.max(0, Math.min(parameters.noiseLevel.max, settings.noiseLevel)) / 200);
  const mix = gain(1),
    input = gain(1),
    shaper = node("createWaveShaper");
  shaper.oversample = "4x";
  const envelope = gain(0);
  const filter = node("createBiquadFilter");
  filter.type = "lowpass";
  // Web Audio low/high-pass Q uses dB; filter designs specify linear Q.
  filter.Q.value = 20 * Math.log10(Math.SQRT1_2);
  noiseGain.connect(input);
  mix.connect(filter);
  filter.connect(input);
  input.connect(shaper);
  shaper.connect(envelope);
  const limiter = node("createWaveShaper");
  limiter.curve = limitCurve;
  limiter.oversample = "4x";
  let cutoffLfo, cutoffLfoGain, cutoffLfoBounds;
  if (cutoffLfoEnabled) {
    cutoffLfo = node("createOscillator");
    cutoffLfo.type = "sine";
    cutoffLfoGain = gain((settings.cutoffLfoDepth ?? 0) / 4);
    cutoffLfoBounds = node("createWaveShaper");
    cutoffLfoBounds.curve = cutoffModulationCurve(
      settings.cutoff,
      context.sampleRate,
    );
    cutoffLfo.connect(cutoffLfoGain);
    cutoffLfoGain.connect(cutoffLfoBounds);
    cutoffLfoBounds.connect(filter.detune);
    sources.push(cutoffLfo);
  }
  const guard = node("createWaveShaper");
  guard.curve = guardCurve;
  const output = gain(1);
  envelope.connect(limiter);

  limiter.connect(guard);
  guard.connect(output);
  output.connect(destination);

  function configureUnison(next, immediate) {
    const time = immediate ? start : context.currentTime;
    while (oscillators.length < next.unisonVoices) {
      const osc = node("createOscillator"),
        level = gain(0),
        panner = node("createStereoPanner");
      osc.type = "sawtooth";
      osc.frequency.value = frequencyAt(time);
      osc.frequency.setValueAtTime(frequencyAt(time), time);
      if (pitchRamp.end > time)
        osc.frequency.linearRampToValueAtTime(pitchRamp.to, pitchRamp.end);
      osc.connect(level);
      level.connect(panner);
      panner.connect(mix);
      oscillators.push({ osc, level, panner });
      sources.push(osc);
      if (started) {
        osc.start(time);
        if (duration !== null) osc.stop(endTime);
      }
    }
    if (!immediate && next.unisonVoices === current.unisonVoices &&
        next.unisonDetune === current.unisonDetune && next.unisonWidth === current.unisonWidth) return;
    const offsets = unisonDetunes(next.unisonVoices, next.unisonDetune);
    oscillators.forEach(({ osc, level, panner }, index) => {
      const pan = !next.unisonWidth || next.unisonVoices === 1 || index >= next.unisonVoices
        ? 0 : (2 * index / (next.unisonVoices - 1) - 1) * ((next.unisonWidth ?? 0) / 100);
      if (immediate) panner.pan.value = pan;
      else if (next.unisonWidth !== current.unisonWidth || next.unisonVoices !== current.unisonVoices)
        smooth(panner.pan, pan, time);
      if (immediate || next.unisonVoices !== current.unisonVoices) {
        const value = index < next.unisonVoices ? 1 / next.unisonVoices : 0;
        if (immediate) level.gain.value = value;
        else smooth(level.gain, value, time);
      }
      if (
        immediate ||
        next.unisonVoices !== current.unisonVoices ||
        next.unisonDetune !== current.unisonDetune
      ) {
        const value = offsets[index] ?? 0;
        if (immediate) osc.detune.value = value;
        else smooth(osc.detune, value, time);
      }
    });
  }

  function apply(next, immediate = false) {
    const time = context.currentTime;
    const set = (param, value) =>
      immediate ? (param.value = value) : smooth(param, value, time);
    if (immediate || next.drive !== current.drive)
      shaper.curve = driveCurve(next.drive);
    if (next.noiseLevel > 0 && !noise) {
      noise = node("createBufferSource");
      noise.buffer = whiteNoiseBuffer(context);
      noise.loop = true;
      noise.connect(noiseGain);
      sources.push(noise);
      if (started) {
        noise.start(time, Math.max(0, time - start) % noise.buffer.duration);
        if (duration !== null) noise.stop(endTime);
      }
    }
    configureUnison(next, immediate);
    if (immediate) {
      if (initialFrequency !== noteFrequency(next.note))
        glideTo(noteFrequency(next.note), start);
    } else if (next.note !== current.note)
      glideTo(noteFrequency(next.note), time);
    const changes = [
      ["noiseLevel", noiseGain.gain, Math.max(0, Math.min(parameters.noiseLevel.max, next.noiseLevel)) / 200],
      [
        "resonance",
        filter.Q,
        20 *
          Math.log10(
            Math.SQRT1_2 * (20 / Math.SQRT1_2) ** (next.resonance / 100),
          ),
      ],
      [
        "cutoff",
        filter.frequency,
        Math.max(parameters.cutoff.min, Math.min(parameters.cutoff.max, next.cutoff, context.sampleRate * 0.4)),
      ],
    ];
    if (cutoffLfoEnabled)
      changes.push(
        ["cutoffLfoRate", cutoffLfo.frequency, next.cutoffLfoRate ?? 2],
        ["cutoffLfoDepth", cutoffLfoGain.gain, (next.cutoffLfoDepth ?? 0) / 4],
      );
    for (const [key, param, value] of changes)
      if (immediate || next[key] !== current[key]) set(param, value);
    if (cutoffLfoBounds && (immediate || next.cutoff !== current.cutoff)) {
      cutoffLfoBounds.curve = cutoffModulationCurve(
        next.cutoff,
        context.sampleRate,
      );
    }
    current = { ...next };
  }
  apply(settings, true);
  const peak = 0.23 * Math.max(0.01, Math.min(1, velocity));
  envelope.gain.setValueAtTime(0, start);
  envelope.gain.linearRampToValueAtTime(peak, start + 0.015);
  let endTime = duration === null ? Infinity : start + duration + releaseTail;
  if (duration !== null) {
    envelope.gain.setValueAtTime(
      peak,
      Math.max(start + 0.015, start + duration - 0.045),
    );
    envelope.gain.linearRampToValueAtTime(0, start + duration);
    output.gain.setValueAtTime(1, endTime - 0.025);
    output.gain.linearRampToValueAtTime(0, endTime);
  }
  sources.forEach((source) => {
    source.start(start);
    if (duration !== null) source.stop(endTime);
  });
  started = true;
  oscillators[0].osc.onended = () => {
    dispose();
    onEnded?.();
  };

  function dispose() {
    if (disposed) return;
    disposed = true;
    stopped = true;
    endTime = context.currentTime;
    oscillators[0].osc.onended = null;
    sources.forEach((source) => {
      try {
        source.stop();
      } catch {
        /* already stopped */
      }
    });
    nodes.forEach((value) => value.disconnect());
  }
  return {
    start,
    get frequency() {
      return frequencyAt();
    },
    get phase() {
      return phaseAt();
    },
    get gliding() {
      return context.currentTime < pitchRamp.end;
    },
    get endTime() {
      return endTime;
    },
    update: apply,
    dispose,
    setVelocity(value) {
      if (!stopped && duration === null)
        smooth(
          envelope.gain,
          0.23 * Math.max(0.01, Math.min(1, value)),
          context.currentTime,
        );
    },
    release() {
      dispose();
    },
  };
}

export class BassEngine {
  context = null;
  master = null;
  analyser = null;
  voice = null;
  request = 0;
  lastFrequency = null;
  async play(settings, options = {}) {
    if (
      this.voice &&
      this.voice.endTime === Infinity &&
      options.duration == null
    ) {
      this.voice.update(settings);
      this.voice.setVelocity(options.velocity ?? 1);
      return this.voice;
    }
    const request = ++this.request;
    if (this.voice) {
      this.lastFrequency = this.voice.frequency;
      this.voice.dispose();
    }
    this.voice = null;
    const Audio = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!Audio)
      throw new Error(
        "This browser cannot play Web Audio. Try a recent Chrome, Edge, Firefox, or Safari.",
      );
    this.context ??= new Audio({ latencyHint: "interactive" });
    const context = this.context;
    if (!this.master) {
      this.master = context.createWaveShaper();
      this.master.curve = guardCurve;
      this.analyser = context.createAnalyser();
      // Keep enough history for the lowest supported note throughout a glide.
      this.analyser.fftSize = Math.min(32768, 2 ** Math.ceil(Math.log2(
        context.sampleRate * 3 / noteFrequency(parameters.note.min) + 2,
      )));
      this.master.connect(this.analyser);
      this.analyser.connect(context.destination);
    }
    await context.resume();
    if (request !== this.request || context !== this.context) return null;
    this.voice = createVoice(context, settings, {
      ...options,
      destination: this.master,
      initialFrequency: this.lastFrequency ?? noteFrequency(settings.note),
    });
    return this.voice;
  }
  update(settings) {
    this.voice?.update(settings);
  }
  stop() {
    ++this.request;
    if (this.voice) {
      this.lastFrequency = this.voice.frequency;
      this.voice.dispose();
    }
    this.voice = null;
  }
  async close() {
    this.stop();
    const context = this.context;
    this.context = null;
    this.master = null;
    this.analyser = null;
    if (context && context.state !== "closed") await context.close();
  }
}

const renderCache = new Map();
export function renderSound(settings) {
  const snapshot = { ...settings },
    key = signature(snapshot);
  if (renderCache.has(key)) {
    const promise = renderCache.get(key);
    renderCache.delete(key);
    renderCache.set(key, promise);
    return promise;
  }
  const promise = (async () => {
    const Offline =
      globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext;
    if (!Offline)
      throw new Error(
        "Offline audio rendering is unavailable in this browser.",
      );
    const context = new Offline(
      2,
      Math.ceil(exportDuration * 44100),
      44100,
    );
    createVoice(context, snapshot, { start: 0, duration: exportDuration - releaseTail });
    return context.startRendering();
  })();
  renderCache.set(key, promise);
  if (renderCache.size > 4) renderCache.delete(renderCache.keys().next().value);
  promise.catch(() => renderCache.delete(key));
  return promise;
}

export function encodeWav(buffer) {
  const bytes = new ArrayBuffer(
      44 + buffer.length * buffer.numberOfChannels * 2,
    ),
    view = new DataView(bytes);
  const write = (offset, text) =>
    [...text].forEach((char, i) =>
      view.setUint8(offset + i, char.charCodeAt(0)),
    );
  const channels = buffer.numberOfChannels,
    rate = buffer.sampleRate;
  write(0, "RIFF");
  view.setUint32(4, bytes.byteLength - 8, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * channels * 2, true);
  view.setUint16(32, channels * 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, bytes.byteLength - 44, true);
  const samples = Array.from({ length: channels }, (_, channel) =>
    buffer.getChannelData(channel),
  );
  for (let frame = 0; frame < buffer.length; frame++)
    for (let channel = 0; channel < channels; channel++) {
      const value = Math.max(-1, Math.min(1, samples[channel][frame]));
      view.setInt16(
        44 + (frame * channels + channel) * 2,
        Math.round(value * (value < 0 ? 32768 : 32767)),
        true,
      );
    }
  return new Blob([bytes], { type: "audio/wav" });
}
