import { test } from "node:test";
import assert from "node:assert/strict";
import { oscillationPath, smoothTrace } from "../src/oscilloscope.js";
import {
  defaults,
  parameters,
  randomSettings,
  seededRandom,
  noteFrequency,
  unisonDetunes,
  noteName,
  encodeSettings,
  decodeSettings,
} from "../src/settings.js";
import {
  parabolicSample,
  driveSample,
  encodeWav,
} from "../src/audio.js";

test("oscilloscope shows two phase-aligned periods at different notes and sample rates", () => {
  for (const rate of [44100, 48000, 96000]) {
    for (const frequency of [16.352, 32.703, 65.406, 261.626, 523.251]) {
      const samples = Float32Array.from({ length: 32768 }, (_, index) =>
        0.2 * Math.sin(index * 2 * Math.PI * frequency / rate + 0.9));
      const phase = (samples.length - 1) * frequency / rate + 0.9 / (2 * Math.PI);
      const path = oscillationPath(samples, rate, frequency, phase);
      const y = [...path.matchAll(/[ML][\d.]+,([\d.]+)/g)].map((match) => Number(match[1]));
      assert.equal(y.length, 512);
      assert.ok(Math.abs(y[0] - 42) < 0.02);
      assert.ok(Math.abs(y.at(-1) - 42) < 0.03);
      let peaks = 0;
      for (let i = 1; i < y.length - 1; i++)
        if (y[i] < y[i - 1] && y[i] <= y[i + 1]) peaks++;
      assert.equal(peaks, 2);
    }
  }
  assert.ok(!oscillationPath(new Float32Array(8192), 44100, 32.703, 0).includes("NaN"));
});

test("scope display settles without overshoot at the same speed on different screens", () => {
  const target = Float32Array.of(0.2, -0.2, 0);
  const settle = (frames) => {
    const display = Float32Array.of(-0.2, 0.2, 0.1);
    for (let frame = 0; frame < frames; frame++) {
      const before = display.slice();
      smoothTrace(display, target, 0.1 / frames);
      display.forEach((value, index) => {
        assert.ok(value >= Math.min(before[index], target[index]));
        assert.ok(value <= Math.max(before[index], target[index]));
      });
    }
    return display;
  };
  const slow = settle(6), fast = settle(14);
  slow.forEach((value, index) => {
    assert.ok(Math.abs(value - fast[index]) < 1e-6);
    assert.ok(Math.abs(value - target[index]) < 0.008);
  });
  assert.deepEqual(target, Float32Array.of(0.2, -0.2, 0));
});

test("equal-tempered MIDI notes use A4 = 440 Hz", () => {
  assert.equal(noteFrequency(69), 440);
  assert.equal(noteFrequency(57), 220);
  assert.equal(noteName(36), "C2");
  assert.equal(noteName(37), "C♯2");
});
test("oscilloscope keeps its phase when harmonics and interference move zero crossings", () => {
  const rate = 48000, frequency = 65.406;
  for (let frame = 0; frame < 40; frame++) {
    const end = rate + frame * 1371;
    const dc = Math.sin(frame / 10) * 0.08;
    const samples = Float32Array.from({ length: 4096 }, (_, index) => {
      const theta = (end - 4095 + index) * frequency / rate * Math.PI * 2;
      return 0.14 * Math.sin(theta) + 0.09 * Math.sin(theta * 2 + 2.4) + dc;
    });
    const path = oscillationPath(samples, rate, frequency, end * frequency / rate);
    const firstY = Number(path.match(/^M[\d.]+,([\d.]+)/)[1]);
    assert.ok(Math.abs(firstY - (42 - (0.09 * Math.sin(2.4) + dc) * 152)) < 0.02);
  }
});
test("unison sharing round trips and legacy links discard bypassed processing", () => {
  const settings = {
    ...defaults,
    unisonVoices: 7,
    unisonDetune: 12.5,
    drive: 6.14159,
    cutoff: 1000.5,
    noiseLevel: 17.5,
    resonance: 47,
  };
  assert.deepEqual(decodeSettings(encodeSettings(settings)), { settings });
  for (const value of [
    "",
    "x",
    ",".repeat(16),
    encodeSettings({ ...defaults, note: 36.5 }),
    encodeSettings({ ...defaults, note: 11 }),
    encodeSettings({ ...defaults, note: 85 }),
    encodeSettings({ ...defaults, unisonVoices: 0 }),
    encodeSettings({ ...defaults, unisonVoices: 8 }),
    encodeSettings({ ...defaults, unisonVoices: 1.5 }),
    encodeSettings({ ...defaults, unisonDetune: 76 }),
    encodeSettings({ ...defaults, noiseLevel: 31 }),
    encodeSettings({ ...defaults, drive: 30.1 }),
    encodeSettings({ ...defaults, resonance: 101 }),
    encodeSettings({ ...defaults, unisonWidth: 101 }),
    encodeSettings({ ...defaults, unisonWidth: -1 }),
    "13,36,2,9,0,1800,0,25,101",
    "13,36,2,9,0,1800,0,25,-1",
    "12,36,2,9,0,1800,0,25,19,1",
    "12,36,2,9,0,1800,0,25,1000,0",
    encodeSettings(defaults).replace(/^17,/, "18,"),
    "9,36,2,9,0,1800,0,25,0,70,101",
    "10,36,2,9,0,1800,0,25,101,70",
    "10,36,2,9,0,1800,0,25,25,-1",
    "10,36,2,9,0,1800,0,25",
    "0".repeat(257),
  ])
    assert.equal(decodeSettings(value), null, value);
  for (const value of [
    "2,0,0,36,9,4,-8,1800",
    "1,0,0,36,9,4,-8,1800,20,3,0,4,0,1.2,0.3,1",
  ])
    assert.deepEqual(decodeSettings(value), {
      settings: { ...defaults, unisonWidth: 0, drive: 5 },
    });
  assert.deepEqual(decodeSettings("3,0,0,36,100,24,-8,1800,100"), {
    settings: {
      ...defaults,
      unisonWidth: 0,
      drive: 24,
      unisonDetune: 75,
      noiseLevel: 20,
    },
  });
  assert.deepEqual(
    decodeSettings(encodeSettings({ ...defaults, noiseLevel: 30 })),
    {
      settings: { ...defaults, noiseLevel: 20 },
    },
  );
  for (const value of [
    "4,0,0,36,9,25,1800,0",
    "5,0,0,36,9,25,1800,0,2,4",
    "6,1,1,36,9,25,1800,0,20,4,0,100",
    "7,36,2,9,0,1800,0,25",
    "11,36,2,9,0,1800,0,25",
    "13,36,2,9,0,1800,0,25,100",
    "12,36,2,9,0,1800,0,25,1000,1",
    "8,36,2,9,0,1800,0,25,0,70",
    "10,36,2,9,0,1800,0,25,100,100",
    "9,36,2,9,0,1800,0,25,0,70,37",
    "9,36,2,9,0,1800,0,25,0,70,0",
    "9,36,2,9,0,1800,0,25,0,70,100",
  ])
    assert.deepEqual(decodeSettings(value), {
      settings: { ...defaults, unisonWidth: 0 },
    });
});

test("unison has one centered voice or a symmetric evenly spaced spread", () => {
  assert.deepEqual(unisonDetunes(1, 75), [0]);
  assert.deepEqual(unisonDetunes(2, 75), [-75, 75]);
  for (let count = 2; count <= 7; count++) {
    const offsets = unisonDetunes(count, 75);
    assert.equal(offsets.length, count);
    assert.equal(offsets[0], -75);
    assert.equal(offsets.at(-1), 75);
    assert.ok(Math.abs(offsets.reduce((sum, n) => sum + n, 0)) < 1e-10);
    for (let index = 1; index < count; index++)
      assert.ok(
        Math.abs(offsets[index] - offsets[index - 1] - 150 / (count - 1)) <
          1e-10,
      );
  }
});

test("randomization respects every lock and parameter bound", () => {
  const random = seededRandom(7);
  for (let i = 0; i < 300; i++) {
    const locks = Object.fromEntries(
      Object.keys(parameters).map((key) => [key, random() > 0.5]),
    );
    const next = randomSettings(defaults, locks, random);
    for (const [key, p] of Object.entries(parameters)) {
      if (locks[key]) assert.equal(next[key], defaults[key]);
      else if (p.values) assert.ok(p.values.includes(next[key]));
      else
        assert.ok(
          next[key] >= p.min && next[key] <= p.max,
          `${key}: ${next[key]}`,
        );
    }
  }
});
test("parabolic saturation is odd, bounded, monotonic and preserves silence", () => {
  assert.equal(parabolicSample(0), 0);
  assert.equal(parabolicSample(0.5), 0.75);
  assert.equal(parabolicSample(10), 1);
  let last = -1;
  for (let i = -200; i <= 200; i++) {
    const x = i / 100,
      y = parabolicSample(x);
    assert.ok(Math.abs(y) <= 1);
    assert.ok(y >= last);
    assert.ok(Math.abs(y + parabolicSample(-x)) < 1e-10);
    last = y;
  }
});
test("drive uses parabolic saturation from its minimum gain", () => {
  for (const x of [-10, -1, -0.5, 0, 0.5, 1, 10])
    assert.equal(driveSample(x, 5), parabolicSample(x * 10 ** (5 / 20)));
  for (const db of [5, 7, 15, 25]) {
    const gain = 10 ** (db / 20);
    // Compare curvature at a fixed level after the input gain.
    assert.ok(
      Math.abs(driveSample(0.5 / gain, db) - parabolicSample(0.5)) < 1e-10,
    );
    let previous = -1;
    for (let index = -200; index <= 200; index++) {
      const x = index / 100,
        y = driveSample(x, db);
      assert.ok(Math.abs(y) <= 1);
      assert.ok(y >= previous);
      assert.ok(Math.abs(y + driveSample(-x, db)) < 1e-10);
      previous = y;
    }
    assert.equal(driveSample(0, db), 0);
  }
  for (const x of [-1, -0.7, -0.1, 0, 0.1, 0.7, 1])
    assert.ok(
      Math.abs(driveSample(x / 10 ** (25 / 20), 25) - parabolicSample(x)) <
        1e-10,
    );
});

test("WAV interleaves stereo PCM", async () => {
  const samples = [
    Float32Array.of(0.25, -0.25, 0, 0.1),
    Float32Array.of(-0.25, 0.25, 0.2, -0.1),
  ];
  const buffer = {
    numberOfChannels: 2,
    sampleRate: 44100,
    length: 4,
    getChannelData: (index) => samples[index],
  };
  const data = new DataView(await encodeWav(buffer).arrayBuffer());
  assert.equal(data.byteLength, 60);
  assert.equal(data.getUint16(22, true), 2);
  assert.equal(data.getUint32(24, true), 44100);
  assert.equal(data.getInt16(44, true), 8192);
  assert.equal(data.getInt16(46, true), -8192);
  assert.equal(data.getUint32(40, true), 16);
});

test("manual outer octaves share correctly while random notes stay in the original range", () => {
  for (const note of [12, 23, 60, 83, 84]) {
    const settings = { ...defaults, note };
    assert.deepEqual(decodeSettings(encodeSettings(settings)), { settings });
    assert.equal(randomSettings(settings, { note: true }).note, note);
  }
  const random = seededRandom(83);
  for (let index = 0; index < 500; index++) {
    const note = randomSettings({ ...defaults, note: index % 2 ? 12 : 84 }, {}, random).note;
    assert.ok(note >= 28 && note <= 52);
  }
});


test("spectrum line resolves nearby bass peaks and retains narrow high-frequency peaks", async () => {
  const { spectrumPath, spectrumFftSize } = await import("../src/spectrum.js");
  const samples = new Float32Array(spectrumFftSize / 2).fill(-Infinity);
  const rate = 48000, binHz = rate / spectrumFftSize;
  const frequencies = [55, 65, 110, 9000];
  for (const hz of frequencies) samples[Math.round(hz / binHz)] = -24;
  const points = spectrumPath(samples, rate).split(" ").slice(1, -1).map(point => point.slice(1).split(",").map(Number));
  const peaks = points.filter(([,y]) => y < 20);
  assert.equal(peaks.length, frequencies.length);
  frequencies.forEach((hz, index) => {
    const actualHz = Math.round(hz / binHz) * binHz;
    assert.ok(Math.abs(peaks[index][0] - Math.log(actualHz / 20) / Math.log(1000) * 720) < 0.01);
  });
  assert.ok(!spectrumPath(samples, rate).includes("NaN"));
});


test("oscilloscope reuses capture storage without changing its trace", async () => {
  const { oscillationSamples, tracePath } = await import("../src/oscilloscope.js");
  const source = Float32Array.from({length:16384}, (_,i) => 0.2 * Math.sin(i * 0.03));
  const output = new Float32Array(512);
  for (const frequency of [16.352, 65.406, 523.251]) {
    const expected = oscillationSamples(source, 48000, frequency, 0.375);
    assert.equal(oscillationSamples(source, 48000, frequency, 0.375, 512, output), output);
    assert.deepEqual(output, expected);
    assert.equal(tracePath(output), tracePath(expected));
  }
});

test("FFT silence is flat and cached layouts preserve peaks across sample rates", async () => {
  const {spectrumPath} = await import("../src/spectrum.js");
  for (const rate of [44100,48000,96000]) for (const length of [4096,8192,16384]) {
    const samples = new Float32Array(length).fill(-Infinity);
    assert.equal(spectrumPath(samples,rate), "M0,90H720");
    const binHz = rate / (length * 2), bin = Math.round(110 / binHz);
    samples[bin] = -12;
    const points = spectrumPath(samples,rate).split(" ").filter(point => point.endsWith(",2.00"));
    assert.equal(points.length,1);
    const expectedX = Math.log(bin * binHz / 20) / Math.log(Math.min(20000,rate/2) / 20) * 720;
    assert.ok(Math.abs(Number(points[0].slice(1).split(",")[0])-expectedX)<0.01);
  }
});


test("drive caps at 25 dB, including historical share links and audio input", () => {
  assert.equal(parameters.drive.max,25);
  for (const link of ["14,36,2,9,0,1800,0,30",encodeSettings({...defaults,drive:30})])
    assert.equal(decodeSettings(link).settings.drive,25);
  assert.equal(decodeSettings(encodeSettings({...defaults,drive:30.1})),null);
  assert.equal(driveSample(0.02,30),driveSample(0.02,25));
});


test("drive floors at 5 dB across shared links and audio", () => {
  assert.equal(parameters.drive.min,5);
  for (const drive of [0,3,4.9]) {
    assert.equal(decodeSettings(encodeSettings({...defaults,drive})).settings.drive,5);
    assert.equal(driveSample(0.1,drive),driveSample(0.1,5));
  }
  assert.equal(decodeSettings(encodeSettings({...defaults,drive:-1})),null);
});


test("cutoff caps at 10 kHz while preserving historical shared sounds", () => {
  assert.equal(parameters.cutoff.max,10000);
  assert.equal(decodeSettings(encodeSettings({...defaults,cutoff:12000})).settings.cutoff,10000);
  assert.equal(decodeSettings("14,36,2,9,0,12000,0,25").settings.cutoff,10000);
  assert.equal(decodeSettings(encodeSettings({...defaults,cutoff:12000.1})),null);
});


test("cutoff floors at 75 Hz and preserves historical valid values", () => {
  assert.equal(parameters.cutoff.min,75);
  for (const cutoff of [75,80,90,99])
    assert.equal(decodeSettings(encodeSettings({...defaults,cutoff})).settings.cutoff,cutoff);
  assert.equal(decodeSettings(encodeSettings({...defaults,cutoff:74})),null);
});


test("retired noise width is validated and discarded from shared links", () => {
  for (const width of [0,50,100])
    assert.deepEqual(decodeSettings(`16,36,2,9,0,1800,0,25,75,${width}`),{settings:{...defaults}});
  for (const width of [-1,101])
    assert.equal(decodeSettings(`16,36,2,9,0,1800,0,25,75,${width}`),null);
  assert.deepEqual(decodeSettings("15,36,2,9,0,1800,0,25,75"),{settings:{...defaults}});
});
