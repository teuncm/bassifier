import { createFrameLoop } from "../src/frame-loop.js";
import { spectrumPoints, spectrumPath } from "../src/spectrum.js";
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
test("version 1 sharing round trips current settings and rejects invalid packets", () => {
  const settings = {...defaults,unisonVoices:5,unisonDetune:12.5,drive:16.14159,cutoff:1000.5,noiseLevel:17.5,resonance:47};
  const encoded = encodeSettings(settings);
  assert.ok(encoded.startsWith("1,"));
  assert.equal(encoded.split(",").length,9);
  assert.deepEqual(decodeSettings(encoded),{settings});
  for (const value of [undefined,null,123,"","x",",".repeat(8),"0".repeat(257),
    encoded+",0",encoded.split(",").slice(0,-1).join(","),encoded.replace("16.14159","Infinity"),
    encoded.replace("16.14159","NaN"),encodeSettings({...defaults,note:36.5}),
    encodeSettings({...defaults,unisonVoices:1.5})]) assert.equal(decodeSettings(value),null);
  for (const [key,parameter] of Object.entries(parameters)) {
    for (const invalid of [parameter.min-1,parameter.max+1])
      assert.equal(decodeSettings(encodeSettings({...defaults,[key]:invalid})),null,`${key}: ${invalid}`);
  }
});

test("share links reject unsupported versions and obsolete packet layouts", () => {
  for (const version of [0,...Array.from({length:16},(_,index)=>index+2)])
    assert.equal(decodeSettings(encodeSettings(defaults).replace(/^1,/,`${version},`)),null);
  assert.equal(decodeSettings("1,0,0,36,9,4,-8,1800,20,3,0,4,0,1.2,0.3,1"),null);
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
    assert.equal(driveSample(x, 10), parabolicSample(x * 10 ** (10 / 20)));
  for (const db of [10, 12, 15, 25]) {
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

test("manual outer octaves share correctly while random notes stay in C1–C3", () => {
  for (const note of [12, 23, 60, 83, 84]) {
    const settings = { ...defaults, note };
    assert.deepEqual(decodeSettings(encodeSettings(settings)), { settings });
    assert.equal(randomSettings(settings, { note: true }).note, note);
  }
  assert.equal(randomSettings(defaults, {}, () => 0).note,24);
  assert.equal(randomSettings(defaults, {}, () => 1-Number.EPSILON).note,48);
  const random = seededRandom(83);
  for (let index = 0; index < 500; index++) {
    const note = randomSettings({ ...defaults, note: index % 2 ? 12 : 84 }, {}, random).note;
    assert.ok(note >= 24 && note <= 48);
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


test("drive caps at 25 dB and rejects out-of-range shared values", () => {
  assert.equal(parameters.drive.max,25);
  assert.equal(decodeSettings(encodeSettings({...defaults,drive:30})),null);
  assert.equal(decodeSettings(encodeSettings({...defaults,drive:30.1})),null);
  assert.equal(driveSample(0.02,30),driveSample(0.02,25));
});


test("drive floors at 10 dB across shared links and audio", () => {
  assert.equal(parameters.drive.min,10);
  for (const drive of [0,3,5,9.9]) {
    assert.equal(decodeSettings(encodeSettings({...defaults,drive})),null);
    assert.equal(driveSample(0.1,drive),driveSample(0.1,10));
  }
  assert.equal(decodeSettings(encodeSettings({...defaults,drive:-1})),null);
});


test("cutoff caps at 10 kHz and rejects out-of-range shared values", () => {
  assert.equal(parameters.cutoff.max,10000);
  assert.equal(decodeSettings(encodeSettings({...defaults,cutoff:12000})),null);
  assert.equal(decodeSettings(encodeSettings({...defaults,cutoff:12000.1})),null);
});


test("cutoff floors at 75 Hz", () => {
  assert.equal(parameters.cutoff.min,75);
  for (const cutoff of [75,80,90,99])
    assert.equal(decodeSettings(encodeSettings({...defaults,cutoff})).settings.cutoff,cutoff);
  assert.equal(decodeSettings(encodeSettings({...defaults,cutoff:74})),null);
});


test("GPU spectrum points preserve peaks and reuse storage", () => {
  for (const rate of [44100, 48000, 96000]) {
    const samples = Float32Array.from({length: 8192}, (_, i) => -96 + 84 * Math.abs(Math.sin(i * 0.017)));
    const points = spectrumPoints(samples, rate);
    const expected = [...spectrumPath(samples, rate).matchAll(/[ML]([\d.]+),([\d.]+)/g)].flatMap(match => [Number(match[1]), Number(match[2])]);
    assert.equal(points.length, expected.length);
    for (let i = 0; i < points.length; i++) assert.ok(Math.abs(points[i] - expected[i]) < 0.006);
    samples.fill(-Infinity);
    assert.equal(spectrumPoints(samples, rate, points), points);
    for (let i = 1; i < points.length; i += 2) assert.equal(points[i], 90);
  }
});


test("frame caps retain cadence on 60/90/120/144 Hz displays and cancel cleanly", () => {
  const request = globalThis.requestAnimationFrame, cancel = globalThis.cancelAnimationFrame;
  try {
    for (const refresh of [60,90,120,144]) for (const cap of [30,60]) {
      let serial = 0, ticks = 0;
      const pending = new Map();
      globalThis.requestAnimationFrame = callback => { pending.set(++serial,callback); return serial; };
      globalThis.cancelAnimationFrame = id => pending.delete(id);
      const loop = createFrameLoop(() => ticks++,cap);
      loop.start(); loop.start();
      assert.equal(pending.size,1);
      for(let time=0;time<1000;time+=1000/refresh) {
        const callbacks=[...pending.values()];pending.clear();
        callbacks.forEach(callback => callback(time));
      }
      assert.ok(Math.abs(ticks-cap)<=1, `${refresh} Hz / ${cap} fps: ${ticks}`);
      loop.stop(); assert.equal(pending.size,0);
    }
    let callback, canceled = false;
    globalThis.requestAnimationFrame = cb => {callback=cb;return 1;};
    globalThis.cancelAnimationFrame = () => {canceled=true;};
    const loop = createFrameLoop(() => loop.stop());
    loop.start();callback(0);
    assert.equal(canceled,true);
  } finally {
    if(request)globalThis.requestAnimationFrame=request;else delete globalThis.requestAnimationFrame;
    if(cancel)globalThis.cancelAnimationFrame=cancel;else delete globalThis.cancelAnimationFrame;
  }
});

test("viewport-sized spectrum reduction preserves narrow peaks with fewer points", () => {
  const samples=new Float32Array(8192).fill(-Infinity),rate=48000;
  for(const bin of [18,22,30,3000,6000])samples[bin]=-12;
  const full=spectrumPoints(samples,rate);
  for(const columns of [128,320,375]) {
    const compact=spectrumPoints(samples,rate,undefined,columns);
    assert.ok(compact.length<full.length);
    for(let group=0;group<Math.floor(compact.length/2)-2;group++) {
      assert.ok(Number.isFinite(compact[group*2]));
    }
    for(const bin of [18,22,30,3000,6000]) {
      const x=Math.log(bin*rate/16384/20)*720/Math.log(20000/20);
      assert.ok([...compact].some((value,i)=>i%2===0&&Math.abs(value-x)<0.001&&compact[i+1]===2));
    }
    assert.equal(spectrumPoints(samples,rate,compact,columns),compact);
  }
});


test("unison caps at five and rejects larger shared counts", () => {
  assert.equal(parameters.unisonVoices.max,5);
  assert.equal(decodeSettings(encodeSettings({...defaults,unisonVoices:5})).settings.unisonVoices,5);
  for (const count of [0,5.5,6,6.5,7,8])
    assert.equal(decodeSettings(encodeSettings({...defaults,unisonVoices:count})),null);
});
