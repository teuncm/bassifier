import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { defaults, encodeSettings } from "../src/settings.js";

const shared = (settings = defaults) =>
  `/?p=${encodeURIComponent(encodeSettings(settings))}`;

async function trackGpuTraces(page) {
  await page.addInitScript(() => {
    window.gpuTraces = {};
    function capture(gl) {
      const pixels = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
      gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      let hash = 0, lit = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        if (pixels[i + 3]) lit++;
        hash = (Math.imul(hash, 31) + pixels[i] + pixels[i + 1] + pixels[i + 2] + pixels[i + 3]) | 0;
      }
      window.gpuTraces[gl.canvas.className] = { hash, lit, error: gl.getError() };
    }
    const draw = WebGLRenderingContext.prototype.drawArrays;
    WebGLRenderingContext.prototype.drawArrays = function (...args) { draw.apply(this, args); capture(this); };
    const getExtension = WebGLRenderingContext.prototype.getExtension, wrapped = new WeakSet();
    WebGLRenderingContext.prototype.getExtension = function (name) {
      const extension = getExtension.call(this, name);
      if (name === 'ANGLE_instanced_arrays' && extension && !wrapped.has(extension)) {
        wrapped.add(extension);
        const gl = this, draw = extension.drawArraysInstancedANGLE.bind(extension);
        extension.drawArraysInstancedANGLE = (...args) => { draw(...args); capture(gl); };
      }
      return extension;
    };
  });
}

test.describe("noise particle visual", () => {
  test.use({ hasTouch: true, viewport: { width: 375, height: 850 } });
  test("particle density tracks the slider and mouse, touch and keys edit noise despite locks", async ({ page }) => {
    await page.addInitScript(() => {
      window.noiseDots = [];
      const clear = CanvasRenderingContext2D.prototype.clearRect, arc = CanvasRenderingContext2D.prototype.arc;
      CanvasRenderingContext2D.prototype.clearRect = function (...args) {
        if (this.canvas.classList.contains('noise-particles')) window.noiseDots = [];
        return clear.apply(this,args);
      };
      CanvasRenderingContext2D.prototype.arc = function (...args) {
        if (this.canvas.classList.contains('noise-particles')) window.noiseDots.push(args.slice(0,3));
        return arc.apply(this,args);
      };
    });
    await page.goto(shared());
    const visual = page.getByRole("slider", { name: "Noise visual control", exact: true });
    const slider = page.getByRole("slider", { name: "Noise level", exact: true });
    const visibleParticles = () => page.evaluate(() => window.noiseDots.length);
    await expect(slider).toHaveAttribute("step", "1");
    await expect.poll(visibleParticles).toBe(0);
    await visual.scrollIntoViewIfNeeded();
    const box = await visual.boundingBox(), x = box.x + box.width / 2, y = box.y + box.height / 2;
    const badge = page.locator('output[for="range-noiseLevel"]');
    const normal = await badge.evaluate((element) => getComputedStyle(element).backgroundColor);
    await page.mouse.move(x, y); await page.mouse.down();
    await page.mouse.move(x, y - box.height / 2);
    await expect(slider).toHaveValue("10");
    await expect(badge).not.toHaveCSS("background-color", normal);
    await page.mouse.up();
    await expect(visual).not.toHaveClass(/dragging/);
    await expect.poll(visibleParticles).toBe(100);
    const positions = await page.evaluate(() => window.noiseDots.slice(0,50));
    await page.getByRole("button", { name: "Lock Noise level", exact: true }).click();
    await visual.focus(); await page.keyboard.press("End");
    await expect(slider).toHaveValue("20");
    await expect(visual).toHaveAttribute("aria-valuenow", "20");
    await expect.poll(visibleParticles).toBe(200);
    expect(await page.evaluate(() => window.noiseDots.slice(0,50))).not.toEqual(positions);
    expect(await page.evaluate(() => window.noiseDots.every(dot => dot[2] === 1.5))).toBe(true);
    expect(await visual.locator('canvas').evaluate(canvas => canvas.getContext('2d')
      .getImageData(0,0,canvas.width,canvas.height).data.some((value,index) => index % 4 === 3 && value === 255))).toBe(true);
    const bounds = await visual.boundingBox();
    const touch = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2, id: 1 };
    const session = await page.context().newCDPSession(page);
    await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [touch] });
    await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ ...touch, y: touch.y + bounds.height * 0.4 }] });
    await session.send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] });
    await expect(slider).toHaveValue("12");
    await expect(visual).not.toHaveClass(/dragging/);
    const lockedPositions = await page.evaluate(() => window.noiseDots);
    await page.getByRole("button", { name: "Randomize", exact: true }).click();
    expect(await page.evaluate(() => window.noiseDots)).toEqual(lockedPositions);
    await expect(slider).toHaveValue("12");
    await slider.fill("5");
    await expect(visual).toHaveAttribute("aria-valuenow", "5");
    await expect.poll(visibleParticles).toBe(50);
    await visual.focus(); await page.keyboard.press("Home");
    await page.keyboard.press("ArrowDown");
    await expect(slider).toHaveValue("0");
    await expect.poll(visibleParticles).toBe(0);
  });

  test("every parameter visual and full slider track highlight on mouse and touch", async ({ page }) => {
    await page.goto(shared());
    const session = await page.context().newCDPSession(page);
    for (const mode of ["mouse", "touch"]) {
      for (const selector of [".unison-display", ".filter-display", ".shaper-curve", ".noise-display"]) {
        const visual = page.locator(selector);
        await visual.scrollIntoViewIfNeeded();
        const box = await visual.boundingBox(), x = box.x + box.width / 2, y = box.y + box.height / 2;
        const mark = visual.locator(selector === ".noise-display" ? ".noise-particles" : ".visual-line").first();
        const property = selector === ".noise-display" ? "color" : "stroke";
        await expect(mark).toHaveCSS(property, "rgb(163, 71, 67)");
        if (mode === "mouse") { await page.mouse.move(x, y); await page.mouse.down(); }
        else await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y, id: 1 }] });
        await expect(mark).toHaveCSS(property, "rgb(137, 82, 194)");
        if (mode === "mouse") await page.mouse.up();
        else await session.send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] });
        await expect(mark).toHaveCSS(property, "rgb(163, 71, 67)");
      }
      const slider = page.getByRole("slider", { name: "Noise level", exact: true });
      await slider.scrollIntoViewIfNeeded();
      const box = await slider.boundingBox(), x = box.x + box.width / 2, y = box.y + box.height / 2;
      if (mode === "mouse") { await page.mouse.move(x, y); await page.mouse.down(); }
      else await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y, id: 1 }] });
      await expect(slider).toHaveCSS("--slider-fill", "#8952c2");
      expect(await slider.evaluate((element) => getComputedStyle(element).backgroundImage)).toContain("137, 82, 194");
      await expect(slider).toHaveCSS("--slider-track", /color-mix/);
      if (mode === "mouse") await page.mouse.up();
      else await session.send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] });
      await expect(slider).toHaveCSS("--slider-fill", "");
    }
  });
});

test.describe("filter visual", () => {
  test.use({ hasTouch: true, viewport: { width: 375, height: 850 } });
  test("mouse and touch adjust cutoff and resonance, with bounds and keyboard control", async ({
    page,
  }) => {
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(shared());
    const pad = page.getByRole("group", { name: "Low pass visual control" });
    const cutoff = page.getByRole("slider", { name: "Low pass", exact: true });
    const resonance = page.getByRole("slider", {
      name: "Resonance",
      exact: true,
    });
    await pad.scrollIntoViewIfNeeded();
    const rect = await pad.boundingBox();
    const x = rect.x + rect.width / 2,
      y = rect.y + rect.height / 2;
    const path = await pad.locator(".filter-response").getAttribute("d");
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + rect.width / 10, y - rect.height / 5);
    await expect(cutoff).toHaveAttribute(
      "aria-valuetext",
      `${(Math.round((1800 * (10000 / 75) ** 0.1) / 5) * 5).toLocaleString("en-US")} Hz`,
    );
    await expect(resonance).toHaveValue("20");
    await expect(pad.locator(".filter-response")).not.toHaveAttribute(
      "d",
      path,
    );
    await page.mouse.move(x + rect.width * 2, y - rect.height * 2);
    await expect(resonance).toHaveValue("100");
    await expect(cutoff).toHaveValue("1000");
    await page.mouse.move(x - rect.width * 2, y + rect.height * 2);
    await expect(resonance).toHaveValue("0");
    await expect(cutoff).toHaveValue("0");
    await page.mouse.up();
    await pad.focus();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowUp");
    await expect(cutoff).toHaveAttribute("aria-valuetext", "80 Hz");
    await expect(resonance).toHaveValue("1");
    const session = await page.context().newCDPSession(page);
    await session.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x, y, id: 1 }],
    });
    await session.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: x + rect.width / 5, y: y - rect.height / 4, id: 1 }],
    });
    await expect(cutoff).toHaveAttribute(
      "aria-valuetext",
      `${Math.round((80 * (10000 / 75) ** 0.2) / 5) * 5} Hz`,
    );
    await expect(resonance).toHaveValue("26");
    await session.send("Input.dispatchTouchEvent", {
      type: "touchCancel",
      touchPoints: [],
    });
    await expect(pad).not.toHaveClass(/dragging/);
    await resonance.fill("80");
    const expected = await page.evaluate(() => {
      const context = new OfflineAudioContext(1, 1, 44100);
      const filter = context.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = Math.round((80 * (10000 / 75) ** 0.2) / 5) * 5;
      filter.Q.value =
        20 * Math.log10(Math.SQRT1_2 * (20 / Math.SQRT1_2) ** 0.8);
      const indices = [0, 64, 128, 160, 200, 256];
      const frequencies = Float32Array.from(
        indices,
        (i) => 20 * 1000 ** (i / 256),
      );
      const magnitude = new Float32Array(indices.length);
      filter.getFrequencyResponse(
        frequencies,
        magnitude,
        new Float32Array(indices.length),
      );
      return indices.map((index, i) => ({
        index,
        y: Math.max(3, Math.min(77, 40 - 20 * Math.log10(magnitude[i]) * 1.2)),
      }));
    });
    const points = (
      await pad.locator(".filter-response").getAttribute("d")
    ).split(" ");
    for (const { index, y: expectedY } of expected) {
      expect(Number(points[index].split(",")[1])).toBeCloseTo(expectedY, 2);
    }
    expect(errors).toEqual([]);
  });
});

test.describe("drive visual", () => {
  test.use({ hasTouch: true, viewport: { width: 375, height: 850 } });
  test("mouse, touch and keyboard edits synchronize drive and respect its bounds", async ({
    page,
  }) => {
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(shared());
    const visual = page.getByRole("slider", {
      name: "Drive visual control",
      exact: true,
    });
    const slider = page.getByRole("slider", { name: "Drive", exact: true });
    await visual.scrollIntoViewIfNeeded();
    const rect = await visual.boundingBox();
    const x = rect.x + rect.width / 2,
      y = rect.y + rect.height / 2;
    const initialCurve = await visual.locator(".curve-path").getAttribute("d");
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y + rect.height / 4);
    await expect.poll(async () => Math.abs(Number(await slider.inputValue()) - 21.25)).toBeLessThan(0.06);
    await expect(visual.locator(".curve-path")).not.toHaveAttribute(
      "d",
      initialCurve,
    );
    await page.mouse.move(x, y - rect.height);
    await expect(slider).toHaveValue("25");
    await page.mouse.move(x, y + rect.height);
    await expect(slider).toHaveValue("10");
    await page.mouse.up();
    await visual.focus();
    await page.keyboard.press("ArrowUp");
    await expect(slider).toHaveValue("10.1");
    await page.keyboard.press("End");
    await expect(slider).toHaveValue("25");
    const session = await page.context().newCDPSession(page);
    await session.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x, y, id: 1 }],
    });
    await session.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x, y: y + rect.height / 4, id: 1 }],
    });
    await expect.poll(async () => Math.abs(Number(await slider.inputValue()) - 21.25)).toBeLessThan(0.06);
    await session.send("Input.dispatchTouchEvent", {
      type: "touchCancel",
      touchPoints: [],
    });
    await expect(visual).not.toHaveClass(/dragging/);
    await slider.fill("10");
    await expect(visual).toHaveAttribute("aria-valuenow", "10");
    await expect(
      page.getByRole("button", { name: "Lock Drive", exact: true }),
    ).toHaveAttribute("aria-pressed", "false");
    expect(errors).toEqual([]);
  });
});

test("unison visual edits both axes, clamps values and stays synchronized", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(shared());
  const pad = page.getByRole("group", { name: "Unison visual control" });
  const voices = page.getByRole("slider", {
    name: "Unison voices",
    exact: true,
  });
  const detune = page.getByRole("slider", {
    name: "Unison detune",
    exact: true,
  });
  const width = page.getByRole("slider", { name: "Unison width", exact: true });
  const lines = pad.locator(".unison-voice");
  await expect(lines).toHaveCount(2);
  const rect = await pad.boundingBox();
  const x = rect.x + rect.width / 2,
    y = rect.y + rect.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + rect.width / 5, y - rect.height / 3);
  await expect(width).toHaveValue("100");
  await expect(voices).toHaveValue("2");
  await expect(detune).toHaveValue("24");
  await expect(lines).toHaveCount(2);
  await page.mouse.move(x + rect.width * 2, y - rect.height * 2);
  await expect(width).toHaveValue("100");
  await expect(detune).toHaveValue("75");
  await page.mouse.move(x - rect.width * 2, y + rect.height * 2);
  await expect(width).toHaveValue("0");
  await expect(detune).toHaveValue("0");
  await page.mouse.up();
  await expect(lines).toHaveCount(2);
  await expect(lines.first()).toHaveAttribute("x1", "200");
  await pad.focus();
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowRight");
  await expect(width).toHaveValue("1");
  await expect(voices).toHaveValue("2");
  await expect(detune).toHaveValue("1");
  await page.keyboard.press("PageUp");
  await expect(voices).toHaveValue("3");
  await voices.fill("5");
  await detune.fill("75");
  await expect(lines).toHaveCount(5);
  const ends = await lines.evaluateAll(nodes => nodes.map(node => Number(node.getAttribute("x1"))));
  expect(ends[0]).toBeGreaterThanOrEqual(4);
  expect(ends.at(-1)).toBeLessThanOrEqual(396);
  expect(ends[0] + ends.at(-1)).toBeCloseTo(400);
  await expect(
    page.getByRole("button", { name: "Play", exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("unison visual supports touch drag and cancellation on mobile", async ({
  browser,
}, testInfo) => {
  const context = await browser.newContext({
    baseURL: testInfo.project.use.baseURL,
    hasTouch: true,
    viewport: { width: 375, height: 850 },
  });
  try {
    const page = await context.newPage();
    await page.goto(shared());
    const pad = page.getByRole("group", { name: "Unison visual control" });
    await pad.scrollIntoViewIfNeeded();
    const rect = await pad.boundingBox();
    const x = rect.x + rect.width / 3,
      y = rect.y + rect.height * 0.7;
    const session = await context.newCDPSession(page);
    await session.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x, y, id: 1 }],
    });
    await session.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: x + rect.width / 5, y: y - rect.height / 3, id: 1 }],
    });
    await expect(
      page.getByRole("slider", { name: "Unison width", exact: true }),
    ).toHaveValue("100");
    await expect(
      page.getByRole("slider", { name: "Unison detune", exact: true }),
    ).toHaveValue("24");
    await session.send("Input.dispatchTouchEvent", {
      type: "touchCancel",
      touchPoints: [],
    });
    await expect(pad).not.toHaveClass(/dragging/);
    await expect(pad.locator(".unison-voice")).toHaveCount(2);
    const widthControl = page.getByRole("slider", {name:"Unison width",exact:true});
    const detuneControl = page.getByRole("slider", {name:"Unison detune",exact:true});
    const widthBefore = await widthControl.inputValue(), detuneBefore = await detuneControl.inputValue();
    await session.send("Input.dispatchTouchEvent", {type:"touchStart", touchPoints:[{x:x-20,y,id:1},{x:x+20,y,id:2}]});
    await session.send("Input.dispatchTouchEvent", {type:"touchMove", touchPoints:[
      {x:x-20,y:y-rect.height/3,id:1},{x:x+20,y:y-rect.height/3,id:2}]});
    await expect(page.getByRole("slider", {name:"Unison voices",exact:true})).toHaveValue("3");
    await expect(widthControl).toHaveValue(widthBefore);
    await expect(detuneControl).toHaveValue(detuneBefore);
    // Lifting a finger rebases the one-finger gesture without jumping values.
    await session.send("Input.dispatchTouchEvent", {type:"touchEnd", touchPoints:[{x:x+20,y:y-rect.height/3,id:2}]});
    await session.send("Input.dispatchTouchEvent", {type:"touchMove", touchPoints:[{x:x-20,y:y-rect.height/3+rect.height/4,id:1}]});
    await expect(widthControl).toHaveValue("75");
    await expect(detuneControl).toHaveValue(detuneBefore);
    await expect(page.getByRole("slider", {name:"Unison voices",exact:true})).toHaveValue("3");
    await session.send("Input.dispatchTouchEvent", {type:"touchCancel",touchPoints:[]});
    await expect(pad).not.toHaveClass(/dragging/);

  } finally {
    await context.close();
  }
});

test("starts from defaults silently; unison controls, locks and reset work without presets", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Play", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Preset" })).toHaveCount(0);
  await expect(
    page.getByRole("slider", { name: "Asymmetry", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /Previous preset|Next preset/ }),
  ).toHaveCount(0);
  await page.locator("body").click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowRight");
  await expect(
    page.getByRole("button", { name: "Play", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".waveform-trace")).toHaveAttribute("data-state", "silent");
  await expect(
    page.getByRole("slider", { name: "Drive", exact: true }),
  ).toHaveValue("25");
  await expect(
    page.getByRole("button", { name: "Lock Drive", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
  const voices = page.getByRole("slider", {
    name: "Unison voices",
    exact: true,
  });
  await expect(voices).toHaveAttribute("min", "1");
  await expect(voices).toHaveAttribute("max", "5");
  await expect(voices).toHaveAttribute("step", "1");
  await voices.fill("1");
  await expect(voices).toHaveValue("1");
  await voices.fill("5");
  await expect(voices).toHaveValue("5");
  await page
    .getByRole("button", { name: "Lock Unison detune", exact: true })
    .click();
  await page.evaluate(() => {
    Math.random = () => 0.5;
  });
  await page.getByRole("button", { name: "Randomize", exact: true }).click();
  await expect(
    page.getByRole("slider", { name: "Unison detune", exact: true }),
  ).toHaveValue("9");
  await expect(
    page.getByRole("slider", { name: "Drive", exact: true }),
  ).toHaveValue("17.5");
  await page.getByRole("button", { name: "Lock Drive", exact: true }).click();
  await page.evaluate(() => {
    Math.random = () => 0.2;
  });
  await page.getByRole("button", { name: "Randomize", exact: true }).click();
  await expect(
    page.getByRole("slider", { name: "Drive", exact: true }),
  ).toHaveValue("17.5");
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Play", exact: true }),
  ).toBeVisible();
  await expect(voices).toHaveValue("2");
  await expect(
    page.getByRole("slider", { name: "Drive", exact: true }),
  ).toHaveValue("25");
  await expect(
    page.getByRole("button", { name: "Lock Drive", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
  await expect(
    page.getByRole("button", { name: "Unlock Unison detune", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Collapse", exact: true }).click();
  await page.getByRole("button", { name: "Expand", exact: true }).click();
  expect(errors).toEqual([]);
});

test("live oscilloscope follows audio, refreshes at half pitch and tracks glides", async ({ page }) => {
  await trackGpuTraces(page);
  await page.addInitScript(() => {
    window.scopeReads = [];
    window.scopeSizes = [];
    const create = AudioContext.prototype.createAnalyser;
    AudioContext.prototype.createAnalyser = function () {
      const analyser = create.call(this), read = analyser.getFloatTimeDomainData.bind(analyser);
      analyser.getFloatTimeDomainData = (samples) => {
        window.scopeReads.push(this.currentTime);
        window.scopeSizes.push(analyser.fftSize);
        return read(samples);
      };
      return analyser;
    };
  });
  await page.goto(shared({ ...defaults, note: 24, unisonVoices: 2, unisonDetune: 75 }));
  const trace = page.locator(".waveform-trace");
  await expect(trace).toHaveAttribute("data-state", "silent");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(trace).toHaveAttribute("data-state", "live");
  await expect(trace).toHaveAttribute("data-renderer", "webgl");
  const initial = await page.evaluate(() => window.gpuTraces["waveform-trace"].hash);
  await expect.poll(() => page.evaluate(() => window.gpuTraces["waveform-trace"].hash)).not.toBe(initial);
  expect(await page.evaluate(() => window.gpuTraces["waveform-trace"].lit)).toBeGreaterThan(0);
  await page.waitForTimeout(500);
  const reads = await page.evaluate(() => window.scopeReads);
  expect(reads.length).toBeGreaterThan(4);
  for (let index = 1; index < reads.length; index++)
    expect(reads[index] - reads[index - 1]).toBeGreaterThanOrEqual(2 / 32.703 - 0.0001);
  const midWindow = await page.evaluate(async () => {
    document.body.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyK", bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 90));
    return Number(document.querySelector(".waveform").dataset.windowSeconds);
  });
  expect(midWindow).toBeGreaterThan(2 / 65.406);
  expect(midWindow).toBeLessThan(2 / 32.703);
  await expect.poll(async () => Number(await page.locator(".waveform").getAttribute("data-window-seconds")))
    .toBeCloseTo(2 / 65.406, 4);
  expect(await page.evaluate(() => new Set(window.scopeSizes).size)).toBe(1);
  await page.keyboard.up("k");
  await expect(trace).toHaveAttribute("data-state", "silent");
});

test("randomize plays one waveform; keyboard takeover sustains until release", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.addInitScript(() => { Math.random = () => 0.5; });
  await page.goto(shared());
  const randomize = page.getByRole("button", { name: "Randomize", exact: true });
  const play = page.getByRole("button", { name: "Play", exact: true });
  const stop = page.getByRole("button", { name: "Stop", exact: true });
  await randomize.click();
  await expect(stop).toBeVisible();
  const selected = page.locator(".piano-key.chosen-note");
  await expect(selected).toHaveClass(/preview-playing/);
  await expect(selected).toHaveCSS("animation-name", "randomized-key-pulse");
  await page.waitForTimeout(2400);
  await expect(stop).toBeVisible();
  await expect(play).toBeVisible({ timeout: 3000 });
  await expect(selected).not.toHaveClass(/preview-playing/);
  await expect(selected).toHaveCSS("animation-name", "none");
  await expect(selected).toHaveCSS("background-color", "rgb(163, 71, 67)");
  await expect(page.locator(".piano-key.chosen-note")).toHaveCount(1);
  await expect(page.locator(".waveform-trace")).toHaveAttribute("data-state", "silent");

  await randomize.click();
  await expect(stop).toBeVisible();
  await page.keyboard.down("a");
  await expect(page.locator(".piano-key.preview-playing")).toHaveCount(0);
  await page.waitForTimeout(3300);
  await expect(stop).toBeVisible();
  await expect(page.getByRole("button", { name: "Play C1", exact: true }))
    .toHaveAttribute("aria-pressed", "true");
  await page.keyboard.up("a");
  await expect(play).toBeVisible();
});

test("Z and X change octaves with visible hints, respect bounds and ignore focused inputs", async ({ page }) => {
  await page.goto(shared());
  const lower = page.getByRole("button", { name: "Lower octave", exact: true });
  const higher = page.getByRole("button", { name: "Higher octave", exact: true });
  await expect(lower.locator("kbd")).toHaveText("Z");
  await expect(higher.locator("kbd")).toHaveText("X");
  await page.keyboard.press("z");
  await expect(page.locator(".octave-value")).toHaveText("0");
  await expect(lower).toBeDisabled();
  await page.keyboard.down("a");
  await expect(page.locator(".selected-tone strong")).toHaveText("C0");
  await page.keyboard.press("z");
  await expect(page.getByRole("button", { name: "Stop", exact: true })).toBeVisible();
  await page.keyboard.press("x");
  await page.keyboard.press("x");
  await expect(page.locator(".octave-value")).toHaveText("2");
  await expect(page.getByRole("button", { name: "Play", exact: true })).toBeVisible();
  await page.keyboard.up("a");
  await page.keyboard.press("x");
  await page.keyboard.press("x");
  await page.keyboard.press("x");
  await expect(page.locator(".octave-value")).toHaveText("4");
  await expect(higher).toBeDisabled();
  await page.keyboard.press("x");
  await page.getByRole("button", { name: "Play C6", exact: true }).click();
  await expect(page.locator(".selected-tone strong")).toHaveText("C6");
  await page.keyboard.press("z");
  await page.keyboard.press("z");
  await expect(page.locator(".octave-value")).toHaveText("2");
  await page.getByRole("slider", { name: "Noise level", exact: true }).focus();
  await page.keyboard.press("z");
  await expect(page.locator(".octave-value")).toHaveText("2");
});

test("randomize selects the first piano view containing the note, including locked notes", async ({ page }) => {
  await page.goto(shared());
  const randomize = page.getByRole("button", { name: "Randomize", exact: true });
  await page.evaluate(() => { Math.random = () => 0.9; });
  await randomize.click();
  await expect(page.locator(".octave-value")).toHaveText("1");
  await expect(page.locator('.piano-key[data-note="46"]')).toHaveClass(/chosen-note/);
  const blackKey = page.locator('.piano-key[data-note="46"]');
  await expect(blackKey).toHaveCSS("background-color", "rgb(163, 71, 67)");
  await page.getByRole("button", { name: "Switch to dark appearance", exact: true }).click();
  await expect(blackKey).toHaveCSS("background-color", "rgb(240, 155, 140)");
  await page.getByRole("button", { name: "Switch to light appearance", exact: true }).click();
  await page.evaluate(() => { Math.random = () => 0.2; });
  await randomize.click();
  await expect(page.locator(".octave-value")).toHaveText("1");
  await expect(page.locator('.piano-key[data-note="29"]')).toHaveClass(/chosen-note/);
  for (const [note, octave] of [[12, 0], [48, 1], [49, 2], [60, 2], [61, 3], [72, 3], [84, 4]]) {
    await page.goto(shared({ ...defaults, note }));
    await page.getByRole("button", { name: "Lock Note", exact: true }).click();
    await randomize.click();
    await expect(page.locator(".octave-value")).toHaveText(String(octave));
    await expect(page.locator(`.piano-key[data-note="${note}"]`)).toHaveClass(/chosen-note/);
    await expect(page.getByRole("button", { name: "Stop", exact: true })).toBeVisible();
  }
});

test("held keys walk back through the stack; the last release and blur stop audio", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.liveOscillators = 0;
    const create = AudioContext.prototype.createOscillator;
    AudioContext.prototype.createOscillator = function (...args) {
      window.liveOscillators++;
      return create.apply(this, args);
    };
  });
  await page.goto(shared());
  await page.keyboard.down("a");
  await expect(
    page.getByRole("button", { name: "Play C1", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.waitForTimeout(1400);
  await expect(
    page.getByRole("button", { name: "Stop", exact: true }),
  ).toBeVisible();
  const count = await page.evaluate(() => window.liveOscillators);
  await page.keyboard.down("d");
  await expect(page.locator(".selected-tone strong")).toHaveText("E1");
  await page.keyboard.down("f");
  await expect(page.locator(".selected-tone strong")).toHaveText("F1");
  await page.keyboard.up("f");
  await expect(page.locator(".selected-tone strong")).toHaveText("E1");
  await page.keyboard.down("g");
  await page.keyboard.up("d");
  await expect(page.locator(".selected-tone strong")).toHaveText("G1");
  await page.keyboard.up("g");
  await expect(page.locator(".selected-tone strong")).toHaveText("C1");
  await expect(page.getByRole("button", { name: "Stop", exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.liveOscillators)).toBe(count);
  await page.keyboard.up("a");
  await expect(
    page.getByRole("button", { name: "Play", exact: true }),
  ).toBeVisible();
  const key = page.getByRole("button", { name: "Play G1", exact: true });
  await key.hover();
  await page.mouse.down();
  await expect(key).toHaveAttribute("aria-pressed", "true");
  await page.mouse.up();
  await expect(key).toHaveAttribute("aria-pressed", "false");
  await page.keyboard.down("s");
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await expect(
    page.getByRole("button", { name: "Play", exact: true }),
  ).toBeVisible();
  await page.keyboard.up("s");
});

test("audio updates work without cancelAndHoldAtTime", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    Object.defineProperty(AudioParam.prototype, "cancelAndHoldAtTime", {
      value: undefined,
      configurable: true,
    });
  });
  await page.goto(shared());
  await page.keyboard.down("a");
  await expect(
    page.getByRole("button", { name: "Stop", exact: true }),
  ).toBeVisible();
  for (const [name, value] of [
    ["Unison voices", "5"],
    ["Unison detune", "25"],
    ["Noise level", "10"],
    ["Low pass", "800"],
    ["Resonance", "40"],
    ["Drive", "20"],
  ]) {
    await page.getByRole("slider", { name, exact: true }).fill(value);
  }
  await page.keyboard.up("a");
  await page.getByRole("button", { name: "Play C1", exact: true }).hover();
  await page.mouse.down();
  await page.getByRole("button", { name: "Play E1", exact: true }).hover();
  await expect(page.locator(".selected-tone strong")).toHaveText("E1");
  await page.mouse.up();
  await expect(
    page.getByRole("button", { name: "Play", exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("keyboard drag follows white and black keys without restarting the voice", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.liveOscillators = 0;
    const create = AudioContext.prototype.createOscillator;
    AudioContext.prototype.createOscillator = function (...args) {
      window.liveOscillators++;
      return create.apply(this, args);
    };
  });
  await page.goto(shared());
  const key = (name) =>
    page.getByRole("button", { name: `Play ${name}`, exact: true });
  const center = async (locator) => {
    const rect = await locator.boundingBox();
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  };
  const start = await center(key("C1"));
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await expect(key("C1")).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("button", { name: "Stop", exact: true }),
  ).toBeVisible();
  const count = await page.evaluate(() => window.liveOscillators);
  const black = await center(key("C♯1"));
  await page.mouse.move(black.x, black.y);
  await expect(key("C♯1")).toHaveAttribute("aria-pressed", "true");
  await expect(key("C1")).toHaveAttribute("aria-pressed", "false");
  await expect(key("C♯1")).toHaveCSS("background-color", "rgb(137, 82, 194)");
  await expect(key("C1")).not.toHaveCSS("background-color", "rgb(137, 82, 194)");
  const next = await center(key("D1"));
  await page.mouse.move(next.x, next.y);
  await expect(key("D1")).toHaveAttribute("aria-pressed", "true");
  expect(await page.evaluate(() => window.liveOscillators)).toBe(count);
  const piano = await page.locator(".piano").boundingBox();
  await page.mouse.move(piano.x, piano.y - 15);
  await expect(
    page.getByRole("button", { name: "Play", exact: true }),
  ).toBeVisible();
  await page.mouse.move(next.x, next.y);
  await expect(key("D1")).toHaveAttribute("aria-pressed", "true");
  await page.mouse.up();
  await expect(key("D1")).toHaveAttribute("aria-pressed", "false");
  await expect(
    page.getByRole("button", { name: "Play", exact: true }),
  ).toBeVisible();
});

test("touch drag follows the finger and touch cancellation releases the note", async ({
  browser,
}, testInfo) => {
  const context = await browser.newContext({
    baseURL: testInfo.project.use.baseURL,
    hasTouch: true,
    viewport: { width: 375, height: 850 },
    reducedMotion: "reduce",
  });
  try {
    const page = await context.newPage();
    await page.goto(shared());
    const session = await context.newCDPSession(page);
    const key = (name) =>
      page.getByRole("button", { name: `Play ${name}`, exact: true });
    const point = async (name) => {
      const rect = await key(name).boundingBox();
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, id: 1 };
    };
    await session.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [await point("C1")],
    });
    await expect(key("C1")).toHaveAttribute("aria-pressed", "true");
    await session.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [await point("C♯1")],
    });
    await expect(key("C♯1")).toHaveAttribute("aria-pressed", "true");
    await expect(key("C1")).toHaveAttribute("aria-pressed", "false");
    await expect(key("C♯1")).toHaveCSS("background-color", "rgb(137, 82, 194)");
    await expect(key("C1")).not.toHaveCSS(
      "background-color",
      "rgb(137, 82, 194)",
    );
    await session.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [await point("E1")],
    });
    await expect(key("E1")).toHaveAttribute("aria-pressed", "true");
    await session.send("Input.dispatchTouchEvent", {
      type: "touchCancel",
      touchPoints: [],
    });
    await expect(
      page.getByRole("button", { name: "Play", exact: true }),
    ).toBeVisible();
    await expect(key("E1")).toHaveAttribute("aria-pressed", "false");
    await session.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [await point("G1")],
    });
    await expect(key("G1")).toHaveAttribute("aria-pressed", "true");
    await session.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await expect(
      page.getByRole("button", { name: "Play", exact: true }),
    ).toBeVisible();
  } finally {
    await context.close();
  }
});

test("drive uses parabolic at minimum gain and the live shaper matches its visual", async ({
  page,
}) => {
  await page.goto(shared({ ...defaults, drive: 10 }));
  await expect(page.getByRole("slider", { name: "Drive", exact: true })).toHaveAttribute("min", "10");
  const result = await page.evaluate(async () => {
    const { createVoice } = await import("/src/audio.js");
    const { defaults } = await import("/src/settings.js");
    const context = new OfflineAudioContext(2, 22050, 44100), shapers = [];
    const create = context.createWaveShaper.bind(context), connect = AudioNode.prototype.connect;
    let input, curveSets = 0;
    context.createWaveShaper = () => {
      const node = create(), descriptor = Object.getOwnPropertyDescriptor(WaveShaperNode.prototype,'curve');
      Object.defineProperty(node,'curve',{ get:() => descriptor.get.call(node), set:value => {curveSets++; descriptor.set.call(node,value);} });
      shapers.push(node); return node;
    };
    AudioNode.prototype.connect = function (destination, ...args) {
      if (destination === shapers[0]) input = this;
      return connect.call(this,destination,...args);
    };
    try {
      const settings = { ...defaults, drive: 10 };
      const voice = createVoice(context, settings, { start: 0, duration: 0.4 });
      const initialGain = input.gain.value, curve = shapers[0].curve, initialSets = curveSets;
      const targets = [], automate = input.gain.setTargetAtTime.bind(input.gain);
      input.gain.setTargetAtTime = (value,...args) => { targets.push(value); return automate(value,...args); };
      voice.update({ ...settings, drive: 15 });
      voice.update({ ...settings, drive: 25 });
      voice.update(settings);
      const unchanged = curveSets === initialSets;
      const sample = curve[9216];
      await context.startRendering();
      return { initialGain, targets, unchanged, sample };
    } finally { AudioNode.prototype.connect = connect; }
  });
  expect(result.initialGain).toBeCloseTo(10 ** (10 / 20), 5);
  expect(result.targets).toHaveLength(3);
  for (const [index,db] of [15,25,10].entries()) expect(result.targets[index]).toBeCloseTo(10 ** (db / 20), 5);
  expect(result.unchanged).toBe(true);
  expect(result.sample).toBeCloseTo(2 * 0.125 - 0.125 ** 2, 6);
  const visual = page.getByRole("slider", {
    name: "Drive visual control",
    exact: true,
  });
  const zeroCurve = await visual.locator(".curve-path").getAttribute("d");
  zeroCurve.split(" ").forEach((point, i) => {
    const y = Number(point.split(",")[1]);
    const x = Math.max(-1, Math.min(1, (i / 50 - 1) * 10 ** (10 / 20)));
    expect(y).toBeCloseTo(40 - (2 * x - x * Math.abs(x)) * 36, 8);
  });
  await page.getByRole("slider", { name: "Drive", exact: true }).fill("25");
  await expect(visual.locator(".curve-path")).not.toHaveAttribute("d", zeroCurve);
});

test("all unison sources are sawtooth, spread symmetrically and feed one parabolic stage", async ({
  page,
}) => {
  await page.goto(shared());
  const results = await page.evaluate(async () => {
    const { createVoice } = await import("/src/audio.js");
    const { defaults, noteFrequency } = await import("/src/settings.js");
    const results = [];
    for (const unisonVoices of [1, 2, 3, 4, 5]) {
      const context = new OfflineAudioContext(2, 22050, 44100),
        sources = [],
        shapers = [];
      const makeOsc = context.createOscillator.bind(context),
        makeShaper = context.createWaveShaper.bind(context);
      context.createOscillator = () => {
        const osc = makeOsc();
        sources.push(osc);
        return osc;
      };
      context.createWaveShaper = () => {
        const node = makeShaper();
        shapers.push(node);
        return node;
      };
      createVoice(
        context,
        { ...defaults, unisonVoices, unisonDetune: 75, drive: 25 },
        { start: 0, duration: 0.4 },
      );
      results.push({
        count: unisonVoices,
        types: sources
          .filter((osc) => osc.type === "sawtooth")
          .map((osc) => osc.type),
        frequencies: sources
          .filter((osc) => osc.type === "sawtooth")
          .map((osc) => osc.frequency.value),
        detunes: sources
          .filter((osc) => osc.type === "sawtooth")
          .map((osc) => osc.detune.value),
        curve: [
          shapers[0].curve[4096],
          shapers[0].curve[8192],
          shapers[0].curve[12288],
        ],
        oversample: shapers[0].oversample,
        frequency: noteFrequency(defaults.note),
      });
      await context.startRendering();
    }
    return results;
  });
  for (const result of results) {
    expect(result.types).toEqual(Array(result.count).fill("sawtooth"));
    expect(result.curve[0]).toBeCloseTo(-0.75, 5);
    expect(result.curve[1]).toBe(0);
    expect(result.curve[2]).toBeCloseTo(0.75, 5);
    expect(result.oversample).toBe("4x");
    result.frequencies.forEach((f) =>
      expect(f).toBeCloseTo(result.frequency, 4),
    );
    if (result.count === 1) expect(result.detunes).toEqual([0]);
    else {
      expect(result.detunes[0]).toBe(-75);
      expect(result.detunes.at(-1)).toBe(75);
      expect(result.detunes.reduce((sum, d) => sum + d, 0)).toBeCloseTo(0, 4);
    }
  }
});

test("one through five unison voices render bounded audible stereo at extreme settings", async ({
  page,
}) => {
  await page.goto(shared());
  const results = await page.evaluate(async () => {
    const { renderSound } = await import("/src/audio.js"),
      { defaults } = await import("/src/settings.js");
    const results = [];
    for (let unisonVoices = 1; unisonVoices <= 5; unisonVoices++)
      for (const note of [12, 84]) {
        const buffer = await renderSound({
          ...defaults,
          unisonVoices,
          unisonDetune: 75,
          note,
          noiseLevel: 20,
          cutoff: 10000,
          resonance: 100,
          drive: 25,
        });
        const left = buffer.getChannelData(0),
          right = buffer.getChannelData(1);
        let peak = 0,
          sum = 0,
          finite = true,
          difference = 0,
          endPeak = 0;
        for (let i = 0; i < left.length; i++) {
          finite &&= Number.isFinite(left[i]) && Number.isFinite(right[i]);
          peak = Math.max(peak, Math.abs(left[i]));
          sum += left[i] ** 2;
          difference = Math.max(difference, Math.abs(left[i] - right[i]));
          if (i > left.length - 100)
            endPeak = Math.max(endPeak, Math.abs(left[i]));
        }
        results.push({
          unisonVoices,
          peak,
          rms: Math.sqrt(sum / left.length),
          finite,
          difference,
          endPeak,
        });
      }
    return results;
  });
  for (const result of results) {
    expect(result.finite).toBe(true);
    expect(result.peak).toBeLessThanOrEqual(0.25001);
    expect(result.rms).toBeGreaterThan(0.01);
    if (result.unisonVoices === 1) expect(result.difference).toBe(0);
    else expect(result.difference).toBeGreaterThan(0.001);
    expect(result.endPeak).toBeLessThan(0.01);
  }
});

test("white noise has a live level control and is included in offline output", async ({
  page,
}) => {
  await page.goto(shared());
  const result = await page.evaluate(async () => {
    const { createVoice, renderSound } = await import("/src/audio.js");
    const { defaults } = await import("/src/settings.js");
    const settings = { ...defaults, cutoff: 10000, unisonDetune: 0, drive: 10 };
    const context = new OfflineAudioContext(2, 44100, 44100);
    const sources = [];
    const makeSource = context.createBufferSource.bind(context);
    context.createBufferSource = () => {
      const source = makeSource();
      sources.push(source);
      return source;
    };
    const voice = createVoice(context, settings, { start: 0, duration: 0.9 });
    const initialNoiseSources = sources.length;
    const suspended = context.suspend(0.3);
    const rendering = context.startRendering();
    await suspended;
    voice.update({ ...settings, noiseLevel: 20 });
    voice.update(settings);
    voice.update({ ...settings, noiseLevel: 20 });
    await context.resume();
    const live = await rendering;
    const quiet = await renderSound(settings);
    const noisy = await renderSound({ ...settings, noiseLevel: 20 });
    function difference(a, b, start, end) {
      let sum = 0;
      for (let i = start; i < end; i++) sum += (a[i] - b[i]) ** 2;
      return Math.sqrt(sum / (end - start));
    }
    const raw = sources[0].buffer.getChannelData(0);
    let mean = 0,
      variance = 0,
      correlation = 0;
    for (let i = 1; i < raw.length; i++) {
      mean += raw[i];
      variance += raw[i] ** 2;
      correlation += raw[i] * raw[i - 1];
    }
    return {
      initialNoiseSources,
      noiseChannels: sources[0].buffer.numberOfChannels,
      sources: sources.filter((source) => source.buffer.duration === 4).length,
      mean: mean / raw.length,
      variance: variance / raw.length,
      correlation: correlation / variance,
      before: difference(
        live.getChannelData(0),
        quiet.getChannelData(0),
        4410,
        8820,
      ),
      after: difference(
        live.getChannelData(0),
        quiet.getChannelData(0),
        22050,
        30870,
      ),
      exported: difference(
        noisy.getChannelData(0),
        quiet.getChannelData(0),
        22050,
        30870,
      ),
    };
  });
  expect(result.initialNoiseSources).toBe(0);
  expect(result.noiseChannels).toBe(1);
  expect(result.sources).toBe(1);
  expect(Math.abs(result.mean)).toBeLessThan(0.001);
  expect(result.variance).toBeGreaterThan(0.32);
  expect(result.variance).toBeLessThan(0.35);
  expect(Math.abs(result.correlation)).toBeLessThan(0.01);
  expect(result.before).toBeLessThan(0.00001);
  expect(result.after).toBeGreaterThan(0.005);
  expect(result.exported).toBeGreaterThan(0.005);
  const level = page.getByRole("slider", { name: "Noise level", exact: true });
  await level.fill("20");
  await expect(level).toHaveValue("20");
  await expect(level).toHaveAttribute("max", "20");
});

test("unison is filtered before drive while noise bypasses low pass; retired effects stay removed", async ({
  page,
}) => {
  await page.goto(shared());
  const result = await page.evaluate(async () => {
    const { createVoice, cutoffLfoEnabled } = await import("/src/audio.js"),
      { defaults } = await import("/src/settings.js");
    const context = new OfflineAudioContext(2, 22050, 44100),
      noiseSources = [],
      filters = [],
      shapers = [],
      edges = [];
    let delays = 0,
      oscillators = 0;
    const makeSource = context.createBufferSource.bind(context);
    context.createBufferSource = () => {
      const node = makeSource(); noiseSources.push(node); return node;
    };
    const makeFilter = context.createBiquadFilter.bind(context),
      makeShaper = context.createWaveShaper.bind(context),
      makeDelay = context.createDelay.bind(context),
      makeOsc = context.createOscillator.bind(context),
      connect = AudioNode.prototype.connect;
    context.createBiquadFilter = () => {
      const node = makeFilter();
      filters.push(node);
      return node;
    };
    context.createWaveShaper = () => {
      const node = makeShaper();
      shapers.push(node);
      return node;
    };
    context.createDelay = (...args) => {
      delays++;
      return makeDelay(...args);
    };
    context.createOscillator = () => {
      oscillators++;
      return makeOsc();
    };
    AudioNode.prototype.connect = function (destination, ...args) {
      edges.push([this, destination]);
      return connect.call(this, destination, ...args);
    };
    try {
      createVoice(
        context,
        {
          ...defaults,
          unisonVoices: 1,
          noiseLevel: 20,
          resonance: 100,
          cutoffLfoRate: 20,
          cutoffLfoDepth: 4,
        },
        { start: 0, duration: 0.4 },
      );
    } finally {
      AudioNode.prototype.connect = connect;
    }
    function reaches(source, target, seen = new Set()) {
      if (source === target) return true;
      if (seen.has(source)) return false;
      seen.add(source);
      return edges.some(([from, to]) => from === source && reaches(to, target, seen));
    }
    const filterBeforeDrive = reaches(filters[0], shapers[0]);
    const response = new Float32Array(1);
    filters[0].getFrequencyResponse(
      Float32Array.of(defaults.cutoff),
      response,
      new Float32Array(1),
    );
    await context.startRendering();
    return {
      filterBeforeDrive,
      noiseReachesDrive: reaches(noiseSources[0], shapers[0]),
      noiseReachesFilter: reaches(noiseSources[0], filters[0]),
      filterTypes: filters.map((f) => f.type),
      cutoffLfoEnabled,
      delays,
      oscillators,
      resonance: response[0],
    };
  });
  expect(result.filterBeforeDrive).toBe(true);
  expect(result.noiseReachesDrive).toBe(true);
  expect(result.noiseReachesFilter).toBe(false);
  expect(result.filterTypes).toEqual(["lowpass"]);
  expect(result.cutoffLfoEnabled).toBe(false);
  expect(result.delays).toBe(0);
  expect(result.oscillators).toBe(1);
  expect(result.resonance).toBeCloseTo(20, 3);
  const group = page
    .locator(".control-group")
    .filter({ has: page.getByRole("button", { name: /^Chain/ }) });
  expect(
    await group
      .locator("input[type=range]")
      .evaluateAll((inputs) => inputs.map((input) => input.id)),
  ).toEqual(["range-unisonVoices", "range-unisonDetune", "range-unisonWidth", "range-cutoff", "range-resonance", "range-noiseLevel", "range-drive"]);
  await expect(page.locator(".synth-card .control-group")).toHaveCount(1);
  await expect(page.getByRole("slider", { name: /LFO/ })).toHaveCount(0);
  await expect(page.getByRole("slider", { name: /Chorus/i })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Square", exact: true }),
  ).toHaveCount(0);
});

test("unison count updates live without restarting; one voice ignores detune", async ({
  page,
}) => {
  await page.goto(shared());
  const result = await page.evaluate(async () => {
    const { createVoice, renderSound } = await import("/src/audio.js"),
      { defaults } = await import("/src/settings.js");
    const context = new OfflineAudioContext(2, 44100, 44100),
      sources = [],
      levels = [];
    const makeOsc = context.createOscillator.bind(context);
    context.createOscillator = () => {
      const osc = makeOsc(),
        connect = osc.connect.bind(osc);
      osc.connect = (destination, ...args) => {
        if (osc.type === "sawtooth") levels.push(destination);
        return connect(destination, ...args);
      };
      sources.push(osc);
      return osc;
    };
    const patch = { ...defaults, unisonVoices: 1, unisonDetune: 75 };
    const voice = createVoice(context, patch, { start: 0, duration: 0.8 });
    const p1 = context.suspend(0.2),
      p2 = context.suspend(0.35),
      p3 = context.suspend(0.55);
    const rendering = context.startRendering();
    await p1;
    voice.update({ ...patch, unisonVoices: 5 });
    await context.resume();
    await p2;
    const expanded = {
      detunes: sources
        .filter((osc) => osc.type === "sawtooth")
        .map((osc) => osc.detune.value),
      levels: levels.map((level) => level.gain.value),
    };
    voice.update(patch);
    await context.resume();
    await p3;
    const collapsed = levels.map((level) => level.gain.value);
    voice.update({ ...patch, unisonVoices: 5 });
    await context.resume();
    await rendering;
    const one = await renderSound({
        ...defaults,
        unisonVoices: 1,
        unisonDetune: 0,
      }),
      oneDetuned = await renderSound(patch),
      five = await renderSound({
        ...defaults,
        unisonVoices: 5,
        unisonWidth: 0,
        unisonDetune: 0,
      });
    let oneDifference = 0,
      normalizedDifference = 0;
    for (let i = 0; i < one.length; i++) {
      oneDifference = Math.max(
        oneDifference,
        Math.abs(one.getChannelData(0)[i] - oneDetuned.getChannelData(0)[i]),
      );
      normalizedDifference = Math.max(
        normalizedDifference,
        Math.abs(one.getChannelData(0)[i] - five.getChannelData(0)[i]),
      );
    }
    return {
      expanded,
      collapsed,
      created: sources.filter((osc) => osc.type === "sawtooth").length,
      oneDifference,
      normalizedDifference,
    };
  });
  expect(result.created).toBe(5);
  result.expanded.detunes.forEach((value, index) =>
    expect(
      Math.abs(value - [-75, -37.5, 0, 37.5, 75][index]),
    ).toBeLessThan(0.02),
  );
  result.expanded.levels.forEach((value) =>
    expect(value).toBeCloseTo(1 / 5, 3),
  );
  expect(result.collapsed[0]).toBeGreaterThan(0.999);
  result.collapsed
    .slice(1)
    .forEach((value) => expect(value).toBeLessThan(0.00001));
  expect(result.oneDifference).toBe(0);
  expect(result.normalizedDifference).toBeLessThan(0.00001);
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await page
    .getByRole("slider", { name: "Unison voices", exact: true })
    .fill("5");
  await page
    .getByRole("slider", { name: "Unison voices", exact: true })
    .fill("1");
  await expect(
    page.getByRole("button", { name: "Stop", exact: true }),
  ).toBeVisible();
});

test("WAV and static fish downloads contain valid artifacts", async ({
  page,
}) => {
  await page.goto(shared());
  const wavPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download WAV (3s)", exact: true })
    .click();
  const wavDownload = await wavPromise,
    wav = await readFile(await wavDownload.path());
  expect(wavDownload.suggestedFilename()).toBe("bassifier-tone.wav");
  expect(wav.toString("ascii", 0, 4)).toBe("RIFF");
  expect(wav.toString("ascii", 8, 12)).toBe("WAVE");
  expect(wav.readUInt16LE(22)).toBe(2);
  expect(wav.readUInt32LE(24)).toBe(44100);
  expect(wav.readUInt32LE(40)).toBe(wav.length - 44);
  expect(wav.readUInt32LE(40) / (44100 * 2 * 2)).toBe(3);
  const longPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download WAV (30s)", exact: true }).click();
  const longDownload = await longPromise;
  const longWav = await readFile(await longDownload.path());
  expect(longDownload.suggestedFilename()).toBe("bassifier-tone-30s.wav");
  expect(longWav.toString("ascii", 0, 4)).toBe("RIFF");
  expect(longWav.toString("ascii", 8, 12)).toBe("WAVE");
  expect(longWav.readUInt16LE(22)).toBe(2);
  expect(longWav.readUInt32LE(24)).toBe(44100);
  expect(longWav.readUInt32LE(40)).toBe(longWav.length - 44);
  expect(longWav.readUInt32LE(40) / (44100 * 2 * 2)).toBe(30);
  // The same sound must retain separate cached renders for each duration.
  const buffers = await page.evaluate(async () => {
    const { renderSound } = await import('/src/audio.js');
    const { defaults } = await import('/src/settings.js');
    const short = await renderSound(defaults), long = await renderSound(defaults, 30);
    const tail = long.getChannelData(0).subarray(29 * 44100, 29.5 * 44100);
    return { short: short.duration, long: long.duration,
      cached: await renderSound(defaults, 30) === long,
      latePeak: Math.max(...tail.map(Math.abs)) };
  });
  expect(buffers.short).toBe(3);
  expect(buffers.long).toBe(30);
  expect(buffers.cached).toBe(true);
  expect(buffers.latePeak).toBeGreaterThan(0.01);
  const svgPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download bass (SVG)", exact: true })
    .click();
  const svgDownload = await svgPromise,
    svg = await readFile(await svgDownload.path(), "utf8");
  expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
  expect(svg).toContain("<circle");
  expect(svg).not.toContain("class=");
  expect(svg).not.toContain("singing");
  await expect(
    page.getByRole("button", { name: "Play", exact: true }),
  ).toBeVisible();
});

test("MIDI timestamps resolve ties, releases restore held notes, and disconnect stops", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const input = {
      id: "test-port",
      name: "Test bass keys",
      state: "connected",
      onmidimessage: null,
    };
    const access = {
      inputs: new Map([["test-port", input]]),
      onstatechange: null,
    };
    Object.defineProperty(navigator, "requestMIDIAccess", {
      value: async () => access,
    });
    window.sendMidi = (data, timeStamp = performance.now()) =>
      input.onmidimessage?.({ data, target: input, timeStamp });
    window.disconnectMidi = () => {
      input.state = "disconnected";
      access.onstatechange?.();
    };
  });
  await page.goto(shared());
  await page
    .getByRole("button", { name: "Connect MIDI", exact: false })
    .click();
  await expect(
    page.getByRole("button", { name: "Test bass keys", exact: false }),
  ).toBeVisible();
  await page.evaluate(() => window.sendMidi([0x91, 38, 100]));
  await expect(page.locator(".selected-tone strong")).toHaveText("D2");
  await expect(
    page.getByRole("button", { name: "Stop", exact: true }),
  ).toBeVisible();
  await page.evaluate(() => window.sendMidi([0xb1, 64, 127]));
  await page.evaluate(() => window.sendMidi([0x91, 38, 0]));
  await expect(
    page.getByRole("button", { name: "Play", exact: true }),
  ).toBeVisible();
  await page.evaluate(() => window.sendMidi([0xb1, 64, 0]));
  await expect(
    page.getByRole("button", { name: "Play", exact: true }),
  ).toBeVisible();
  await page.evaluate(() => {
    window.sendMidi([0x90, 48, 100], 1000);
    window.sendMidi([0x90, 36, 100], 1000);
  });
  await expect(page.locator(".selected-tone strong")).toHaveText("C2");
  await page.evaluate(() => window.sendMidi([0x80, 48, 0]));
  await expect(
    page.getByRole("button", { name: "Stop", exact: true }),
  ).toBeVisible();
  await page.evaluate(() => {
    window.sendMidi([0x90, 36, 100], 2000);
    window.sendMidi([0x90, 48, 100], 2000);
  });
  await expect(page.locator(".selected-tone strong")).toHaveText("C2");
  await page.evaluate(() => window.sendMidi([0x90, 43, 100], 2001));
  await expect(page.locator(".selected-tone strong")).toHaveText("G2");
  await page.evaluate(() => window.sendMidi([0x80, 43, 0]));
  await expect(page.locator(".selected-tone strong")).toHaveText("C2");
  await page.evaluate(() => window.sendMidi([0x90, 43, 60], 2002));
  await page.evaluate(() => window.sendMidi([0x80, 36, 0]));
  await expect(
    page.getByRole("button", { name: "Stop", exact: true }),
  ).toBeVisible();
  await page.evaluate(() => {
    window.sendMidi([0x90, 48, 100], 3000);
    window.sendMidi([0x80, 48, 0], 3001);
  });
  await page.waitForTimeout(100);
  await expect(
    page.getByRole("button", { name: "Stop", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".selected-tone strong")).toHaveText("G2");
  await page.evaluate(() => window.sendMidi([0x80, 43, 0]));
  await expect(page.getByRole("button", { name: "Play", exact: true })).toBeVisible();
  await page.evaluate(() => window.sendMidi([0x90, 45, 60]));
  await page.evaluate(() => window.disconnectMidi());
  await expect(
    page.getByRole("button", { name: "Play", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "MIDI ready", exact: false }),
  ).toBeVisible();
});

test("pitch glides linearly for 300 ms, retargets continuously, and release cuts all audio", async ({
  page,
}) => {
  await page.goto(shared());
  const result = await page.evaluate(async () => {
    const { createVoice, BassEngine, glideDuration } =
      await import("/src/audio.js");
    const { defaults, noteFrequency } = await import("/src/settings.js");
    const context = new OfflineAudioContext(2, 44100, 44100);
    const oscillators = [];
    const makeOsc = context.createOscillator.bind(context);
    context.createOscillator = () => {
      const osc = makeOsc();
      oscillators.push(osc);
      return osc;
    };
    const settings = { ...defaults, unisonVoices: 5 };
    const voice = createVoice(context, settings, { start: 0 });
    const times = [0.1, 0.15, 0.2, 0.25, 0.51, 0.55];
    const pauses = times.map((time) => context.suspend(time));
    const rendering = context.startRendering();
    await pauses[0];
    const firstStart = context.currentTime,
      firstFrom = voice.frequency,
      firstTo = noteFrequency(48);
    voice.update({ ...settings, note: 48 });
    await context.resume();
    await pauses[1];
    const firstActual = oscillators.filter((osc) => osc.type === "sawtooth")[0]
      .frequency.value;
    const firstExpected =
      firstFrom +
      ((firstTo - firstFrom) *
        (context.currentTime - 1 / context.sampleRate - firstStart)) /
        glideDuration;
    await context.resume();
    await pauses[2];
    const secondStart = context.currentTime,
      secondFrom = voice.frequency,
      before = oscillators.filter((osc) => osc.type === "sawtooth")[0].frequency
        .value,
      secondTo = noteFrequency(43);
    voice.update({ ...settings, note: 43 });
    const after = oscillators.filter((osc) => osc.type === "sawtooth")[0]
      .frequency.value;
    await context.resume();
    await pauses[3];
    const secondActual = oscillators.filter((osc) => osc.type === "sawtooth")[1]
      .frequency.value;
    const secondExpected =
      secondFrom +
      ((secondTo - secondFrom) *
        (context.currentTime - 1 / context.sampleRate - secondStart)) /
        glideDuration;
    await context.resume();
    await pauses[4];
    const endFrequency = oscillators.filter((osc) => osc.type === "sawtooth")[0]
      .frequency.value;
    await context.resume();
    await pauses[5];
    const stopTime = context.currentTime;
    voice.release();
    await context.resume();
    const buffer = await rendering;
    let beforePeak = 0,
      afterPeak = 0;
    for (let channel = 0; channel < 2; channel++) {
      const samples = buffer.getChannelData(channel);
      for (let i = 4410; i < Math.floor(stopTime * 44100) - 128; i++)
        beforePeak = Math.max(beforePeak, Math.abs(samples[i]));
      for (let i = Math.ceil(stopTime * 44100) + 128; i < samples.length; i++)
        afterPeak = Math.max(afterPeak, Math.abs(samples[i]));
    }
    const engine = new BassEngine();
    let reused, separateGlide, separateFrequency;
    try {
      const first = await engine.play(settings);
      const next = await engine.play({ ...settings, note: 48 });
      reused = first === next;
      engine.stop();
      const separate = await engine.play({ ...settings, note: 60 });
      separateGlide = separate.gliding;
      separateFrequency = separate.frequency;
    } finally {
      await engine.close();
    }
    return {
      firstActual,
      firstExpected,
      before,
      after,
      glideDuration,
      secondActual,
      secondExpected,
      endFrequency,
      secondTo,
      beforePeak,
      afterPeak,
      reused,
      separateGlide,
      separateFrequency,
    };
  });
  expect(result.firstActual).toBeCloseTo(result.firstExpected, 3);
  // A suspended context exposes the previous sample's AudioParam value.
  expect(result.after).toBeCloseTo(result.before, 3);
  expect(result.glideDuration).toBe(0.3);
  expect(result.secondActual).toBeCloseTo(result.secondExpected, 3);
  expect(result.endFrequency).toBeCloseTo(result.secondTo, 3);
  expect(result.beforePeak).toBeGreaterThan(0.03);
  expect(result.afterPeak).toBe(0);
  expect(result.reused).toBe(true);
  expect(result.separateGlide).toBe(true);
  expect(result.separateFrequency).toBeLessThan(261);
});

test("sharing restores sound without autoplay; malformed URLs fall back safely", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "share", { value: undefined });
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: async (url) => {
          window.copiedUrl = url;
        },
      },
    });
  });
  await page.goto(
    shared(
      {
        ...defaults,
        unisonVoices: 5,
        note: 40,
        drive: 12.5,
        unisonDetune: 32,
      },
      true,
    ),
  );
  await page
    .getByRole("button", { name: "Share your bass", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Copied!", exact: true }),
  ).toBeVisible();
  const url = await page.evaluate(() => window.copiedUrl);
  expect(new URL(url).searchParams.get("p")).toMatch(/^1,/);
  await page.goto(url);
  await expect(page.locator(".selected-tone strong")).toHaveText("E2");
  await expect(page.getByRole("slider", { name: "Noise width", exact: true })).toHaveCount(0);
  await expect(
    page.getByRole("slider", { name: "Drive", exact: true }),
  ).toHaveValue("12.5");
  await expect(
    page.getByRole("button", { name: "Play", exact: true }),
  ).toBeVisible();
  await page.goto("/?p=broken");
  await expect(
    page.getByRole("slider", { name: "Drive", exact: true }),
  ).toHaveValue("25");
  await expect(
    page.getByRole("slider", { name: "Unison voices", exact: true }),
  ).toHaveValue("2");
  await expect(
    page.getByRole("button", { name: "Play", exact: true }),
  ).toBeVisible();
});

test("sustained playback, removed controls, range keys and theme persistence", async ({
  page,
}) => {
  await page.goto(shared());
  await expect(
    page.getByRole("button", { name: "Repeat", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole("slider")).toHaveCount(9);
  await expect(
    page.getByRole("slider", { name: "Amplitude", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("slider", { name: "Unison detune", exact: true }),
  ).toHaveAttribute("max", "75");
  await expect(
    page.getByText(
      /A little fish|FOLLOW THE CURRENT|THE FISH, OF COURSE|little sound exploration/,
    ),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await page.waitForTimeout(2200);
  await expect(
    page.getByRole("button", { name: "Stop", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  const range = page.getByRole("slider", {
    name: "Unison detune",
    exact: true,
  });
  await range.focus();
  await page.keyboard.press("ArrowRight");
  await expect(range).toHaveValue("10");
  await expect(
    page.getByRole("button", { name: "Play", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Switch to .* appearance/ }).click();
  const theme = await page.locator("html").getAttribute("data-theme");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await page.waitForTimeout(500);
  await expect(
    page.getByRole("button", { name: "Play", exact: true }),
  ).toBeVisible();
});

test.describe("fish interaction", () => {
  test.use({ hasTouch: true });
  test("fish stays above the mobile player and leaves a fading bubble trail", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 850 });
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.clock.install();
    await page.clock.pauseAt(new Date(Date.now() + 1000));
    await page.goto(shared());
    const point = await page.locator(".fish-heading").evaluate((element) => {
      const p = new DOMPoint(150, 135).matrixTransform(element.getScreenCTM());
      return { x: p.x, y: p.y };
    });
    const player = await page.locator(".playback-card").boundingBox();
    await page.mouse.move(point.x, point.y);
    await page.mouse.down();
    await page.mouse.move(point.x, player.y + 25);
    await expect(page.locator(".fish-draggable")).toHaveClass(/dragging/);
    expect(await page.evaluate(({ x, y }) =>
      Boolean(document.elementFromPoint(x, y)?.closest(".fish-draggable")),
    { x: point.x, y: player.y + 25 })).toBe(true);
    await page.mouse.up();
    await expect(page.locator(".fish-draggable")).toHaveClass(/returning/);
    await page.clock.runFor(250);
    expect(await page.locator(".swim-bubble").count()).toBeGreaterThan(1);
    await expect(page.locator(".fish-trail")).toHaveCSS("pointer-events", "none");
    await page.clock.runFor(2500);
    await expect(page.locator(".swim-bubble")).toHaveCount(0);
    await expect(page.locator(".fish-draggable")).not.toHaveClass(/dragging|returning/);
  });

  test("mouse and touch drags turn the body and face toward the fixed grab point", async ({
    page,
  }) => {
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(shared());
    const fish = page.locator(".fish-draggable");
    const pupil = page.locator(".fish-pupil").last();
    const start = await page.locator(".fish-face").evaluate((element) => {
      const point = new DOMPoint(88, 128).matrixTransform(
        element.getScreenCTM(),
      );
      return { x: point.x, y: point.y };
    });
    const facingAnchor = () =>
      page.locator(".fish-heading").evaluate((element, anchor) => {
        const matrix = element.getScreenCTM();
        const center = new DOMPoint(150, 135).matrixTransform(matrix);
        const nose = new DOMPoint(90, 135).matrixTransform(matrix);
        const forward = { x: nose.x - center.x, y: nose.y - center.y };
        const target = { x: anchor.x - center.x, y: anchor.y - center.y };
        return (
          (forward.x * target.x + forward.y * target.y) /
          (Math.hypot(forward.x, forward.y) * Math.hypot(target.x, target.y))
        );
      }, start);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x + 80, start.y);
    expect(Number(await pupil.getAttribute("cx"))).toBeLessThan(95);
    expect(await facingAnchor()).toBeGreaterThan(0.98);
    await page.mouse.move(start.x - 80, start.y);
    await expect(page.locator(".fish-heading")).toHaveAttribute(
      "style",
      /scaleX\(-1\)/,
    );
    expect(await facingAnchor()).toBeGreaterThan(0.98);
    await page.mouse.move(start.x, start.y - 80);
    expect(await facingAnchor()).toBeGreaterThan(0.98);
    await page.mouse.up();
    await expect(fish).not.toHaveClass(/dragging/);
    await expect(page.locator(".fish-face")).not.toHaveAttribute("transform");
    await expect(pupil).toHaveAttribute("cx", "93.35");
    const session = await page.context().newCDPSession(page);
    await session.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ ...start, id: 1 }],
    });
    await session.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: start.x + 80, y: start.y, id: 1 }],
    });
    expect(Number(await pupil.getAttribute("cx"))).toBeLessThan(95);
    expect(await facingAnchor()).toBeGreaterThan(0.98);
    await session.send("Input.dispatchTouchEvent", {
      type: "touchCancel",
      touchPoints: [],
    });
    await expect(fish).not.toHaveClass(/dragging/);
    await expect(pupil).toHaveAttribute("cx", "93.35");
    expect(errors).toEqual([]);
  });

  test("randomize bursts particles, swaps the fish, and restarts cleanly on rapid clicks", async ({
    page,
  }) => {
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.clock.install();
    await page.clock.pauseAt(new Date(Date.now() + 1000));
    await page.goto(shared());
    const fish = page.locator(".fish-draggable");
    const randomize = page.getByRole("button", {
      name: "Randomize",
      exact: true,
    });
    const oldTail = await page.locator(".fish-tail-shape").getAttribute("d");
    // Lock deterministic new dimensions so the visual swap is observable.
    await page
      .getByRole("slider", { name: "Unison voices", exact: true })
      .fill("5");
    await page
      .getByRole("button", { name: "Lock Unison voices", exact: true })
      .click();
    // Tail geometry is independent of the audio sample rate initialized on first play.
    const before = await page.locator(".fish-tail-shape").getAttribute("d");
    await randomize.click();
    await expect(fish).toHaveClass(/popping-out/);
    await expect(page.locator(".fish-particle")).toHaveCount(20);
    await expect(page.locator(".fish-tail-shape")).toHaveAttribute("d", before);
    await page.clock.runFor(130);
    await expect(fish).toHaveClass(/popping-in/);
    await expect(page.locator(".fish-tail-shape")).not.toHaveAttribute(
      "d",
      oldTail,
    );
    await randomize.click();
    await expect(fish).toHaveClass(/popping-out/);
    await expect(page.locator(".fish-particle")).toHaveCount(20);
    await page.clock.runFor(800);
    await expect(fish).not.toHaveClass(/popping/);
    await expect(page.locator(".fish-particle")).toHaveCount(0);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await randomize.click();
    await expect(fish).not.toHaveClass(/popping/);
    await expect(page.locator(".fish-particle")).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test("released fish turns and swims home, and can be caught during its return", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.clock.install();
    await page.clock.pauseAt(new Date(Date.now() + 1000));
    await page.goto(shared());
    const fish = page.locator(".fish-draggable");
    const point = () =>
      page.locator(".fish-face").evaluate((element) => {
        const p = new DOMPoint(88, 128).matrixTransform(element.getScreenCTM());
        return { x: p.x, y: p.y };
      });
    const position = () =>
      fish.evaluate((element) => {
        const matrix = new DOMMatrix(getComputedStyle(element).transform);
        return { x: matrix.m41, y: matrix.m42 };
      });
    const start = await point();
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x - 90, start.y + 50);
    await page.mouse.up();
    await expect(fish).toHaveClass(/returning/);
    await expect(page.locator(".fish-heading")).toHaveAttribute(
      "style",
      /scaleX\(-1\)/,
    );
    await expect(page.locator(".fish-tail")).toHaveCSS(
      "animation-name",
      "none",
    );
    const released = await position();
    await page.clock.runFor(250);
    const partial = await position();
    await expect(page.locator(".fish-tail")).not.toHaveCSS(
      "transform",
      "matrix(1, 0, 0, 1, 0, 0)",
    );
    await expect(page.locator(".fish-propulsion")).not.toHaveCSS(
      "transform",
      "matrix(1, 0, 0, 1, 0, 0)",
    );
    expect(Math.hypot(partial.x, partial.y)).toBeLessThan(
      Math.hypot(released.x, released.y),
    );
    expect(Math.hypot(partial.x, partial.y)).toBeGreaterThan(1);
    const catchPoint = await point();
    await page.mouse.move(catchPoint.x, catchPoint.y);
    await page.mouse.down();
    await expect(fish).toHaveClass(/dragging/);
    await expect(fish).not.toHaveClass(/returning/);
    const caught = await position();
    expect(caught.x).toBeCloseTo(partial.x, 1);
    expect(caught.y).toBeCloseTo(partial.y, 1);
    await page.clock.runFor(300);
    expect(await position()).toEqual(caught);
    await page.mouse.up();
    await expect(fish).toHaveClass(/returning/);
    await page.clock.runFor(1600);
    await expect(fish).not.toHaveClass(/returning|dragging/);
    expect(await position()).toEqual({ x: 0, y: 0 });
    await expect(page.locator(".fish-heading")).toHaveAttribute(
      "style",
      /scaleX\(1\)/,
    );
    await expect(page.locator(".fish-pupil").last()).toHaveAttribute(
      "cx",
      "93.35",
    );
  });
});

test("notes cycle the fish through the rainbow and drive changes hair and decorative speckles", async ({ page }) => {
  await page.goto(shared({ ...defaults, drive: 10 }));
  const color = page.locator(".fish-body");
  for (let semitone = 0; semitone <= 12; semitone++) {
    await page.locator(`.piano-key[data-note="${24 + semitone}"]`).click();
    await expect(color).toHaveAttribute("fill", `hsl(${semitone % 12 * 30} 38% 54%)`);
  }
  const withoutHair = () => page.locator(".fish-svg").evaluate((element) => {
    const clone = element.cloneNode(true);
    clone.querySelector(".fish-hair").removeAttribute("d");
    clone.querySelector(".fish-speckles").remove();
    clone.querySelector(".fish-centering").removeAttribute("transform");
    return clone.outerHTML;
  });
  const before = await withoutHair();
  const hair = await page.locator(".fish-hair").getAttribute("d");
  const vibration = await page.locator(".fish-draggable").getAttribute("style");
  await page.getByRole("slider", { name: "Drive", exact: true }).fill("25");
  await expect(page.locator(".fish-hair")).not.toHaveAttribute("d", hair);
  expect(await withoutHair()).toBe(before);
  await expect(page.locator(".fish-draggable")).toHaveAttribute("style", vibration);
});

test("fish vibration grows with noise, stops on release, and respects reduced motion", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto(shared({ ...defaults, drive: 10, noiseLevel: 0 }));
  const layer = page.locator(".fish-vibration");
  await expect(layer).toHaveCSS("animation-name", "none");
  await page.keyboard.down("a");
  await expect(layer).toHaveCSS("animation-name", "fish-vibrate");
  await expect(page.locator(".fish-mouth")).toHaveClass(/mouth-beating/);
  const quiet = await page.locator(".fish-draggable").evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      strength: parseFloat(style.getPropertyValue("--vibration-strength")),
      duration: parseFloat(style.getPropertyValue("--vibration-duration")),
    };
  });
  await page.getByRole("slider", { name: "Drive", exact: true }).fill("25");
  await page
    .getByRole("slider", { name: "Noise level", exact: true })
    .fill("20");
  const loud = await page.locator(".fish-draggable").evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      strength: parseFloat(style.getPropertyValue("--vibration-strength")),
      duration: parseFloat(style.getPropertyValue("--vibration-duration")),
    };
  });
  expect(loud.strength).toBeGreaterThan(quiet.strength * 3);
  expect(loud.strength).toBeLessThanOrEqual(1);
  expect(loud.duration).toBeGreaterThanOrEqual(0.16);
  expect(loud.duration).toBeLessThan(quiet.duration);
  const jitter = await layer.evaluate((element) => {
    const animation = element.getAnimations()[0];
    animation.pause();
    animation.currentTime =
      Number(animation.effect.getTiming().duration) * 0.16;
    return getComputedStyle(element).transform;
  });
  expect(jitter).not.toBe("none");
  expect(jitter).not.toBe("matrix(1, 0, 0, 1, 0, 0)");
  await page.keyboard.up("a");
  await expect(layer).toHaveCSS("animation-name", "none");
  await expect(layer).toHaveCSS("transform", "none");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(layer).toHaveCSS("animation-name", "fish-vibrate");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(layer).toHaveCSS("animation-name", "none");
  await page.getByRole("button", { name: "Stop", exact: true }).click();
});

test("fish eyes and dramatic hair and tail morphs follow their parameters", async ({
  page,
}) => {
  await page.goto(
    shared({
      ...defaults,
      drive: 10,
      cutoff: 10000,
      unisonVoices: 1,
      unisonDetune: 0,
    }),
  );
  await expect(page.locator(".fish-eye circle")).toHaveCount(1);
  await expect(page.locator(".fish-eye ellipse")).toHaveCount(1);
  const eyeRadii = () =>
    page
      .locator(".fish-eye circle, .fish-eye ellipse")
      .evaluateAll((circles) =>
        circles.flatMap((element) => element.tagName === "ellipse"
          ? [Number(element.getAttribute("rx")), Number(element.getAttribute("ry"))]
          : [Number(element.getAttribute("r"))]),
      );
  const quietEyes = await eyeRadii();
  await page
    .getByRole("slider", { name: "Noise level", exact: true })
    .fill("12");
  const mediumEyes = await eyeRadii();
  await page
    .getByRole("slider", { name: "Noise level", exact: true })
    .fill("20");
  const loudEyes = await eyeRadii();
  quietEyes.forEach((radius, index) => {
    expect(mediumEyes[index]).toBeGreaterThan(radius);
    expect(loudEyes[index]).toBeGreaterThan(mediumEyes[index]);
    expect(loudEyes[index]).toBeCloseTo(radius * 2.35, 5);
  });
  await page
    .getByRole("slider", { name: "Noise level", exact: true })
    .fill("0");
  expect(await eyeRadii()).toEqual(quietEyes);
  const bounds = (selector) =>
    page.locator(selector).evaluate((element) => {
      const box = element.getBBox();
      return { x: box.x, y: box.y, width: box.width, height: box.height };
    });
  const hairProfile = () =>
    page.locator(".fish-hair").evaluate((element) => {
      const points = [
        ...element.getAttribute("d").matchAll(/L([\d.]+),([\d.]+)/g),
      ].slice(0, 257);
      return (
        points.reduce((sum, point) => sum + Number(point[2]), 0) / points.length
      );
    });
  const shortHair = await bounds(".fish-hair");
  await page.getByRole("slider", { name: "Drive", exact: true }).fill("25");
  const tallHair = await bounds(".fish-hair");
  expect(tallHair.height).toBeGreaterThan(shortHair.height + 40);
  const openHair = await hairProfile();
  await page.getByRole("slider", { name: "Low pass", exact: true }).fill("0");
  expect(await hairProfile()).toBeGreaterThan(openHair + 15);
  await page.getByRole("slider", { name: "Drive", exact: true }).fill("15");
  await page.getByRole("slider", { name: "Low pass", exact: true }).fill("500");
  const smoothHair = await bounds(".fish-hair");
  await page
    .getByRole("slider", { name: "Resonance", exact: true })
    .fill("100");
  const resonantHair = await bounds(".fish-hair");
  expect(resonantHair.height).toBeGreaterThan(smoothHair.height + 10);
  await page.getByRole("slider", { name: "Unison width", exact: true }).fill("0");
  const shortBody = await page.locator(".fish-body").boundingBox();
  const beakBeforeWidth = await bounds(".fish-muzzle");
  await page.getByRole("slider", { name: "Unison width", exact: true }).fill("100");
  const longBody = await page.locator(".fish-body").boundingBox();
  expect(longBody.width).toBeGreaterThan(shortBody.width * 2.2);
  expect(await bounds(".fish-muzzle")).toEqual(beakBeforeWidth);
  await expect(page.locator(".fish-pelvic-fin")).toHaveCount(0);
  const smallFin = await bounds(".fish-fin");
  expect(smallFin.width).toBeGreaterThanOrEqual(66);
  const smallTail = await bounds(".fish-tail-shape");
  const smallMouth = await bounds(".fish-muzzle");
  await page
    .getByRole("slider", { name: "Unison voices", exact: true })
    .fill("5");
  const bigTail = await bounds(".fish-tail-shape");
  const bigMouth = await bounds(".fish-muzzle");
  expect(bigMouth.width).toBeGreaterThan(smallMouth.width * 2.2);
  expect(bigMouth.height).toBeGreaterThan(smallMouth.height * 2.2);
  expect(bigTail).toEqual(smallTail);
  await page
    .getByRole("slider", { name: "Unison detune", exact: true })
    .fill("75");
  const spreadTail = await bounds(".fish-tail-shape");
  const largeFin = await bounds(".fish-fin");
  expect(largeFin.width).toBeCloseTo(smallFin.width, 3);
  expect(largeFin.height).toBeGreaterThan(smallFin.height * 2.5);
  expect(await bounds(".fish-muzzle")).toEqual(bigMouth);
  expect(spreadTail.width).toBeCloseTo(bigTail.width, 3);
  expect(spreadTail.height).toBeGreaterThan(bigTail.height * 4);
  await page.getByRole("slider", { name: "Drive", exact: true }).fill("25");
  for (const selector of [".fish-hair", ".fish-tail-shape", ".fish-mouth"]) {
    const box = await bounds(selector);
    expect(box.x).toBeGreaterThan(0);
    expect(box.y).toBeGreaterThan(0);
    expect(box.x + box.width).toBeLessThan(300);
    expect(box.y + box.height).toBeLessThan(230);
  }
  await page
    .getByRole("slider", { name: "Unison voices", exact: true })
    .fill("1");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  const smallOpenMouth = await bounds(".fish-mouth");
  await page
    .getByRole("slider", { name: "Unison voices", exact: true })
    .fill("5");
  const bigOpenMouth = await bounds(".fish-mouth");
  expect(bigOpenMouth.width).toBeGreaterThan(smallOpenMouth.width * 1.5);
  expect(bigOpenMouth.height).toBeGreaterThan(smallOpenMouth.height * 1.5);
  await expect(page.locator(".fish-mouth")).toHaveClass(/mouth-beating/);
  await page.getByRole("button", { name: "Stop", exact: true }).click();
});

for (const width of [320, 375, 560, 768, 1024, 1280]) {
  test(`layout fits ${width}px, fish morphs preserve layout, player stays usable`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 850 });
    await page.goto(shared());
    const info = await page.evaluate(() => ({
      documentWidth: document.documentElement.scrollWidth,
      viewport: innerWidth,
      height: document.querySelector(".fish-card").getBoundingClientRect()
        .height,
      actionsBottom: document.querySelector(".action-row").getBoundingClientRect().bottom,
      workspaceTop: document.querySelector(".workspace").getBoundingClientRect().top,
      helpInCard: Boolean(document.querySelector(".locks-help").closest(".card")),
    }));
    expect(info.documentWidth).toBeLessThanOrEqual(width);
    const longButton = page.getByRole('button', {name:'Download WAV (30s)', exact:true});
    await expect(longButton).toBeVisible();
    const longBounds = await longButton.boundingBox();
    expect(longBounds.x + longBounds.width).toBeLessThanOrEqual(width);
    const statusBounds = await page.locator('.play-status').boundingBox();
    expect(statusBounds.x).toBeGreaterThanOrEqual(longBounds.x + longBounds.width);

    expect(info.actionsBottom).toBeLessThanOrEqual(info.workspaceTop);
    expect(info.helpInCard).toBe(false);
    await page.getByRole("slider", { name: "Drive", exact: true }).fill("24");
    const after = await page.locator(".fish-card").boundingBox();
    expect(after.height).toBeCloseTo(info.height, 0);
    if (width < 1024) {
      await page
        .getByRole("slider", { name: "Drive", exact: true })
        .scrollIntoViewIfNeeded();
      await expect(
        page.getByRole("button", { name: "Play", exact: true }),
      ).toBeInViewport();
      const control = await page
        .getByRole("slider", { name: "Drive", exact: true })
        .boundingBox();
      const player = await page.locator(".playback-card").boundingBox();
      expect(control.y + control.height).toBeLessThan(player.y);
    }
  });
}


test("stereo width pans voices and produces stereo while zero width stays mono", async ({ page }) => {
  await page.goto(shared());
  const results = await page.evaluate(async () => {
    const {createVoice} = await import('/src/audio.js');
    const {defaults} = await import('/src/settings.js');
    const results = [];
    for (const [count, width] of [[3,0],[3,100],[1,100]]) {
      const context = new OfflineAudioContext(2, 22050, 44100);
      const panners = [], make = context.createStereoPanner.bind(context);
      context.createStereoPanner = () => { const node = make(); panners.push(node); return node; };
      createVoice(context, {...defaults, unisonVoices: count, unisonWidth: width}, {start:0, duration:0.4});
      const pans = panners.map(node => node.pan.value);
      const buffer = await context.startRendering();
      const left = buffer.getChannelData(0), right = buffer.getChannelData(1);
      results.push({pans, difference: left.reduce((sum, value, i) => sum + Math.abs(value-right[i]), 0)});
    }
    return results;
  });
  expect(results[0].pans).toEqual([0,0,0]);
  expect(results[0].difference).toBe(0);
  expect(results[1].pans).toEqual([-1,0,1]);
  expect(results[1].difference).toBeGreaterThan(1);
  expect(results[2].pans).toEqual([0]);
  expect(results[2].difference).toBe(0);
});

test("mobile sharing opens native share and octave shortcuts highlight their buttons", async ({page}) => {
  await page.setViewportSize({width:375,height:850});
  await page.addInitScript(() => Object.defineProperty(navigator, 'share', {value: async data => {window.nativeShare = data;}}));
  await page.goto(shared());
  await page.getByRole('button', {name:'Share your bass', exact:true}).click();
  expect(new URL(await page.evaluate(() => window.nativeShare.url)).searchParams.get('p')).toMatch(/^1,/);
  for (const [key, name] of [['z','Lower octave'],['x','Higher octave']]) {
    await page.keyboard.down(key);
    await expect(page.getByRole('button', {name,exact:true})).toHaveClass(/keyboard-pressed/);
    await page.keyboard.up(key);
    await expect(page.getByRole('button', {name,exact:true})).not.toHaveClass(/keyboard-pressed/);
  }
});


test("unison wheel edits voices without scrolling and lines reflect stereo width", async ({ page }) => {
  await page.goto(shared({ ...defaults, unisonVoices: 3, unisonWidth: 50 }));
  const pad = page.getByRole("group", { name: "Unison visual control" });
  const width = page.getByRole("slider", { name: "Unison width", exact: true });
  const voices = page.getByRole("slider", { name: "Unison voices", exact: true });
  await pad.scrollIntoViewIfNeeded();
  await pad.hover();
  const scroll = await page.evaluate(() => window.scrollY);
  await page.mouse.wheel(0, -100);
  await expect(voices).toHaveValue("4");
  await expect(width).toHaveValue("50");
  const tilts = () => pad.locator(".unison-voice").evaluateAll(nodes => nodes.map(node =>
    Number(node.getAttribute("x1")) - Number(node.getAttribute("x2"))));
  const initial = await tilts();
  expect(initial[0]).toBeLessThan(0);
  expect(initial.at(-1)).toBeGreaterThan(0);
  await page.mouse.wheel(0, -10000);
  await expect(voices).toHaveValue("5");
  await page.mouse.wheel(0, -100);
  await expect(voices).toHaveValue("5");
  await page.mouse.wheel(0, 10000);
  await expect(voices).toHaveValue("1");
  expect(await tilts()).toEqual([0]);
  await page.mouse.wheel(0, 100);
  await expect(voices).toHaveValue("1");
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => window.scrollY)).toBe(scroll);
  await voices.fill("3");
  await width.fill("100");
  expect((await tilts())[0]).toBeLessThan(initial[0]);
  const angles = await pad.locator('.unison-voice').evaluateAll(lines => lines.map(line => {
    const dx = Number(line.getAttribute('x1')) - Number(line.getAttribute('x2'));
    const dy = Number(line.getAttribute('y2')) - Number(line.getAttribute('y1'));
    const bounds = line.ownerSVGElement.getBoundingClientRect();
    return Math.atan2(dx * bounds.width / 400, dy * bounds.height / 80) * 180 / Math.PI;
  }));
  expect(angles[0]).toBeCloseTo(-45, 5);
  expect(angles[1]).toBeCloseTo(0, 5);
  expect(angles[2]).toBeCloseTo(45, 5);
  for (const viewport of [{width:375,height:850},{width:1280,height:1000}]) {
    await page.setViewportSize(viewport);
    await pad.scrollIntoViewIfNeeded();
    for (const panWidth of [0, 25, 50, 100]) {
      await width.fill(String(panWidth));
      await expect.poll(() => pad.locator('.unison-voice').evaluateAll(lines => lines.map(line => {
        const bounds = line.ownerSVGElement.getBoundingClientRect();
        const dx = (Number(line.getAttribute('x1')) - Number(line.getAttribute('x2'))) * bounds.width / 400;
        const dy = (Number(line.getAttribute('y2')) - Number(line.getAttribute('y1'))) * bounds.height / 80;
        return Math.round(Math.atan2(dx,dy) * 180 / Math.PI * 100) / 100;
      }))).toEqual([-45 * panWidth / 100 || 0, 0, 45 * panWidth / 100]);
    }
  }


});


test("external link icons and UI labels retain correct encoding", async ({page}) => {
  await page.goto(shared());
  const author = page.locator('a.author-link');
  await expect(author).toHaveAttribute('href', 'https://teuncm.nl/');
  await expect(author).toHaveAttribute('target', '_blank');
  await expect(author.locator('span')).toHaveText('\u2197');
  await expect(page.locator('.workspace-footer a')).toContainText('\u2197');
  expect(await page.locator('body').innerText()).not.toMatch(/[\u00c2\u00c3\ufffd]|\u00e2[\u2020\u20ac\u02c6]/);
});


test("lock help stays below and aligned with main cards on large displays", async ({ page }) => {
  await page.setViewportSize({ width: 2560, height: 1440 });
  await page.goto(shared());
  const main = await page.locator('.main-column').boundingBox();
  const help = await page.locator('.locks-help').boundingBox();
  expect(help.x).toBeCloseTo(main.x, 0);
  expect(help.y).toBeGreaterThanOrEqual(main.y + main.height);
});


test("Spectrum renders on the GPU below the waveform on desktop and mobile", async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await trackGpuTraces(page);
  await page.goto(shared());
  const fft = page.getByRole('region', {name:'Spectrum',exact:true});
  await expect(fft).toHaveCount(1);
  await expect(page.locator('.playback-card .fft-card')).toHaveCount(1);
  const waveform = await page.locator('.waveform').boundingBox();
  expect((await fft.boundingBox()).y).toBeGreaterThanOrEqual(waveform.y + waveform.height);
  const spectrum = fft.locator('.fft-trace');
  await expect(spectrum).toHaveAttribute('data-state', 'silent');
  await expect(spectrum).toHaveAttribute('data-renderer', 'webgl');
  expect(await page.evaluate(() => window.gpuTraces['fft-trace'].lit)).toBeGreaterThan(0);
  await page.getByRole('button', {name:'Play',exact:true}).click();
  await expect(spectrum).toHaveAttribute('data-state', 'live');
  const first = await page.evaluate(() => window.gpuTraces['fft-trace'].hash);
  await page.getByRole('slider', {name:'Low pass',exact:true}).fill('1000');
  await expect.poll(() => page.evaluate(() => window.gpuTraces['fft-trace'].hash)).not.toBe(first);
  await page.setViewportSize({width:375,height:850});
  await expect(page.locator('.main-column > .fft-card')).toHaveCount(0);
  await expect(page.locator('.playback-card .fft-card')).toHaveCount(1);
  const mobileWave = await page.locator('.waveform').boundingBox();
  const mobileSpectrum = await page.locator('.fft-display').boundingBox();
  expect(mobileSpectrum.y).toBeGreaterThanOrEqual(mobileWave.y + mobileWave.height);
  const controls = await page.locator('.player-controls').boundingBox();
  expect(controls.y).toBeGreaterThanOrEqual(mobileSpectrum.y + mobileSpectrum.height);
  expect(controls.y + controls.height).toBeLessThanOrEqual(850);
  await expect(spectrum).toHaveAttribute('data-state', 'live');
  await page.getByRole('button', {name:'Stop',exact:true}).click();
  await expect(spectrum).toHaveAttribute('data-state', 'silent');
  await page.setViewportSize({width:2560,height:1440});
  await expect(page.locator('.playback-card .fft-card')).toHaveCount(1);
  expect(errors).toEqual([]);
});


test("fish speckles change with every sound parameter and restore deterministically", async ({page}) => {
  await page.goto(shared());
  const pattern = () => page.locator('.fish-speckles').innerHTML();
  const original = await pattern();
  expect(await page.locator('.fish-speckles circle').count()).toBeGreaterThanOrEqual(14);
  for (const [name, value] of [['Unison voices','5'], ['Unison detune','30'], ['Unison width','0'],
    ['Noise level','10'], ['Low pass','1000'], ['Resonance','50'], ['Drive','10']]) {
    const slider = page.getByRole('slider', {name, exact:true});
    const previous = await slider.inputValue();
    await slider.fill(value);
    await expect.poll(pattern).not.toBe(original);
    if (name === 'Low pass') await page.reload();
    else await slider.fill(previous);
    await expect.poll(pattern).toBe(original);
  }
  await page.locator('.piano-key[data-note="37"]').click();
  await expect.poll(pattern).not.toBe(original);
  await page.reload();
  await expect.poll(pattern).toBe(original);
});


test("shared outer notes are visible and reset returns to the default octave", async ({page}) => {
  for (const note of [12,84]) {
    await page.goto(shared({...defaults,note}));
    await expect(page.locator(`.piano-key.chosen-note[data-note="${note}"]`)).toBeVisible();
    await page.getByRole('button',{name:'Reset',exact:true}).click();
    await expect(page.locator('.octave-value')).toHaveText('1');
    await expect(page.locator('.piano-key.chosen-note[data-note="36"]')).toBeVisible();
  }
});

test("SVG export removes temporary drag, gaze and singing pose", async ({page}) => {
  await page.goto(shared());
  await page.getByRole('button',{name:'Play',exact:true}).click();
  const fish = await page.locator('.fish-svg').boundingBox();
  await page.mouse.move(fish.x + fish.width * 0.4, fish.y + fish.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(fish.x + fish.width * 0.6, fish.y + fish.height * 0.3);
  await expect(page.locator('.fish-face')).toHaveAttribute('transform',/rotate/);
  const download = page.waitForEvent('download');
  await page.getByRole('button',{name:'Download bass (SVG)',exact:true}).dispatchEvent('click');
  const svg = await readFile(await (await download).path(),'utf8');
  expect(svg).not.toContain('rotate(');
  const exported = await page.evaluate(svg => {
    const doc = new DOMParser().parseFromString(svg,'image/svg+xml');
    const pupil = [...doc.querySelectorAll('circle')].at(-1);
    const mouth = [...doc.querySelectorAll('path')].at(-1);
    return {cx:Number(pupil.getAttribute('cx')), cy:Number(pupil.getAttribute('cy')), mouthFill:mouth.getAttribute('fill')};
  },svg);
  expect(exported).toEqual({cx:93.35,cy:132.55,mouthFill:'none'});
  await page.mouse.up();
});


test("fish closes its eye while silent and opens it for held notes and playback", async ({page}) => {
  await page.goto(shared());
  const eye=page.locator('.fish-eye-open'), lid=page.locator('.fish-eyelid');
  await expect(eye).toBeHidden(); await expect(lid).toBeVisible();
  await page.keyboard.down('a');
  await expect(eye).toBeVisible(); await expect(lid).toBeHidden();
  await page.keyboard.up('a');
  await expect(eye).toBeHidden(); await expect(lid).toBeVisible();
  await page.getByRole('button',{name:'Play',exact:true}).click();
  await expect(eye).toBeVisible();
  await page.getByRole('button',{name:'Stop',exact:true}).click();
  await expect(lid).toBeVisible();
  await page.getByRole('button',{name:'Randomize',exact:true}).click();
  await expect(eye).toBeVisible();
  await expect(eye).toBeHidden({timeout:4000});
  await expect(lid).toBeVisible();
});


test("fish stays centered across compact and long bodies and extreme morphs", async ({page}) => {
  for (const width of [375,1280]) {
    await page.setViewportSize({width,height:1000});
    await page.goto(shared());
    for (const [unisonWidth,voices,detune,noise,drive,cutoff] of [
      [0,1,0,0,10,0], [0,5,75,20,25,1000], [100,1,0,0,10,0], [100,5,75,20,25,1000], [50,4,35,10,15,650],
    ]) {
      for (const [name,value] of [['Unison width',unisonWidth],['Unison voices',voices],['Unison detune',detune],['Noise level',noise],['Drive',drive],['Low pass',cutoff]])
        await page.getByRole('slider',{name,exact:true}).fill(String(value));
      await expect.poll(() => page.evaluate(() => {
        const fish=document.querySelector('.fish-body-parts').getBoundingClientRect();
        const pond=document.querySelector('.pond').getBoundingClientRect();
        return Math.max(Math.abs(fish.x+fish.width/2-pond.x-pond.width/2),Math.abs(fish.y+fish.height/2-pond.y-pond.height/2));
      })).toBeLessThan(1);
    }
  }
});





test("GPU traces restore after context loss and follow theme changes", async ({page}) => {
  await trackGpuTraces(page);
  await page.goto(shared());
  const trace = page.locator('.waveform-trace');
  const original = await page.evaluate(() => window.gpuTraces['waveform-trace'].hash);
  await page.getByRole('button', {name: /Switch to .* appearance/}).click();
  await expect.poll(() => page.evaluate(() => window.gpuTraces['waveform-trace'].hash)).not.toBe(original);
  await trace.evaluate(canvas => {
    window.traceRestored = false;
    canvas.addEventListener('webglcontextrestored', () => { window.traceRestored = true; }, {once: true});
    window.loseTrace = canvas.getContext('webgl').getExtension('WEBGL_lose_context');
    window.loseTrace.loseContext();
  });
  await expect.poll(() => trace.evaluate(canvas => canvas.getContext('webgl').isContextLost())).toBe(true);
  await page.evaluate(() => window.loseTrace.restoreContext());
  await expect.poll(() => page.evaluate(() => window.traceRestored)).toBe(true);
  expect(await page.evaluate(() => window.gpuTraces['waveform-trace'].lit)).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.gpuTraces['waveform-trace'].error)).toBe(0);
  await page.getByRole('button', {name:'Play',exact:true}).click();
  await expect(trace).toHaveAttribute('data-state', 'live');
});

test("traces fall back to canvas when WebGL is unavailable", async ({page}) => {
  await page.addInitScript(() => {
    const context = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      return type === 'webgl' ? null : context.call(this, type, ...args);
    };
  });
  await page.goto(shared());
  for (const name of ['.waveform-trace', '.fft-trace']) {
    await expect(page.locator(name)).toHaveAttribute('data-renderer', 'canvas2d');
    expect(await page.locator(name).evaluate(canvas =>
      canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data.some(value => value > 0))).toBe(true);
  }
  await page.getByRole('button', {name:'Play',exact:true}).click();
  await expect(page.locator('.waveform-trace')).toHaveAttribute('data-state', 'live');
  await expect(page.locator('.fft-trace')).toHaveAttribute('data-state', 'live');
});


for (const width of [375, 1280]) {
  test(`offscreen fish preview follows edits and clears on return or inactivity at ${width}px`, async ({page}) => {
    await page.setViewportSize({width, height: 650});
    await page.clock.install();
    await page.goto(shared());
    const bubble = page.locator('.fish-ghost-bubble');
    const drive = page.getByRole('slider', {name:'Drive', exact:true});
    await expect(bubble).toHaveCount(0);
    await drive.scrollIntoViewIfNeeded();
    await drive.fill('10');
    await expect(bubble).toBeVisible();
    await expect(bubble).toHaveCSS('pointer-events', 'none');
    const reference = await bubble.locator('use').getAttribute('href');
    expect(reference).toMatch(/^#fish-preview-/);
    const source = page.locator(`[id="${reference.slice(1)}"]`);
    const initialHair = await source.locator('.fish-hair').getAttribute('d');
    await page.clock.runFor(1500);
    await drive.fill('20');
    await expect(source.locator('.fish-hair')).not.toHaveAttribute('d', initialHair);
    await page.clock.runFor(1500);
    await expect(bubble).toBeVisible();
    const bounds = await bubble.boundingBox();
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
    if (width < 1024) {
      const player = await page.locator('.playback-card').boundingBox();
      expect(bounds.y + bounds.height).toBeLessThan(player.y);
    }
    await page.clock.runFor(600);
    await expect(bubble).toHaveCount(0);
    await drive.fill('15');
    await expect(bubble).toBeVisible();
    await page.locator('.fish-card').scrollIntoViewIfNeeded();
    await expect(bubble).toHaveCount(0);
    await page.evaluate(() => window.scrollTo(0, 0));
    // Editing an in-view fish must not produce a duplicate preview.
    await page.evaluate(() => {
      const input = document.querySelector('#range-drive');
      input.value = '12';
      input.dispatchEvent(new Event('input', {bubbles:true}));
    });
    await expect(bubble).toHaveCount(0);
  });
}


test.describe('mobile app interactions', () => {
  test.use({viewport:{width:375,height:850}, isMobile:true, hasTouch:true});
  test('prevents selection and zoom while retaining scrolling and playback', async ({page}) => {
    await page.goto(shared());
    const behavior = await page.evaluate(() => {
      const title = document.querySelector('h1');
      const root = getComputedStyle(document.documentElement);
      const canceled = ['selectstart', 'contextmenu', 'dragstart', 'gesturestart', 'gesturechange', 'dblclick'].map(type =>
        !title.dispatchEvent(new Event(type, {bubbles:true,cancelable:true})));
      const zoomWheel = new WheelEvent('wheel', {bubbles:true,cancelable:true,ctrlKey:true,deltaY:-100});
      const normalWheel = new WheelEvent('wheel', {bubbles:true,cancelable:true,deltaY:100});
      title.dispatchEvent(zoomWheel); title.dispatchEvent(normalWheel);
      const shortcuts = ['+', '-', '0'].map(key => {
        const event = new KeyboardEvent('keydown', {key,ctrlKey:true,bubbles:true,cancelable:true});
        title.dispatchEvent(event); return event.defaultPrevented;
      });
      return {canceled,shortcuts,zoomWheel:zoomWheel.defaultPrevented,normalWheel:normalWheel.defaultPrevented,
        selection:getComputedStyle(title).userSelect,pan:root.touchAction,overscroll:root.overscrollBehavior};
    });
    expect(behavior).toEqual({canceled:[true,true,true,true,true,true],shortcuts:[true,true,true],
      zoomWheel:true,normalWheel:false,selection:'none',pan:'pan-y',overscroll:'none'});
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.synthesizePinchGesture', {x:180,y:110,scaleFactor:1.7,relativeSpeed:800,gestureSourceType:'touch'});
    expect(await page.evaluate(() => visualViewport.scale)).toBe(1);
    await page.getByRole('heading', {name:'Your bass',exact:true}).dblclick();
    expect(await page.evaluate(() => window.getSelection().toString())).toBe('');
    await page.mouse.move(5, 250);
    await page.mouse.wheel(0, 400);
    await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(0);
    await page.getByRole('button', {name:'Play',exact:true}).tap();
    await expect(page.getByRole('button', {name:'Stop',exact:true})).toBeVisible();
    await page.getByRole('button', {name:'Stop',exact:true}).tap();
  });

  test('share fallback copies without leaving selectable text or focusing the URL', async ({page}) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'share', {value:undefined});
      Object.defineProperty(navigator, 'clipboard', {value:{writeText:async () => {throw new Error('Denied');}}});
      document.execCommand = command => {
        const input = document.querySelector('#share-url');
        window.fallbackCopy = {command, text:input.value.slice(input.selectionStart,input.selectionEnd)};
        return true;
      };
    });
    await page.goto(shared());
    await page.getByRole('button', {name:'Share your bass',exact:true}).tap();
    const input = page.locator('#share-url');
    await expect(input).toBeVisible();
    await expect(input).toHaveCSS('user-select','none');
    await expect(input).toHaveCSS('font-size','16px');
    await input.tap();
    expect(await input.evaluate(el => document.activeElement === el)).toBe(false);
    const url = await input.inputValue();
    await page.getByRole('button', {name:'Copy link',exact:true}).tap();
    await expect(page.getByRole('button', {name:'Copied!',exact:true})).toBeVisible();
    expect(await page.evaluate(() => window.fallbackCopy)).toEqual({command:'copy',text:url});
    expect(await input.evaluate(el => el.selectionStart === el.selectionEnd && document.activeElement !== el)).toBe(true);
  });
});


test('randomizing a swimming fish pops in place before continuing home', async ({page}) => {
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  await page.goto(shared());
  const fish = page.locator('.fish-draggable');
  const box = await fish.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 - 250, box.y + box.height / 2 + 160);
  await page.mouse.up();
  await expect(fish).toHaveClass(/returning/);
  await page.clock.runFor(160);
  const position = await fish.evaluate(el => el.style.transform);
  const randomize = page.getByRole('button', {name:'Randomize',exact:true});
  await randomize.click();
  await expect(fish).toHaveClass(/popping-out/);
  await page.clock.runFor(130);
  await expect(fish).toHaveClass(/popping-in/);
  await expect(fish).toHaveClass(/returning/);
  expect(await fish.evaluate(el => el.style.transform)).toBe(position);
  await expect(page.locator('.fish-particle')).toHaveCount(20);
  // Restarting the pop also preserves the same swimming position.
  await randomize.click();
  await page.clock.runFor(500);
  expect(await fish.evaluate(el => el.style.transform)).toBe(position);
  await page.clock.runFor(250);
  expect(await fish.evaluate(el => el.style.transform)).not.toBe(position);
  await page.clock.runFor(1800);
  await expect(fish).not.toHaveClass(/returning|popping/);
  expect(await fish.evaluate(el => el.style.transform)).toBe('translate(0px, 0px)');
});


test.describe('mobile player viewport stability', () => {
  test.use({viewport:{width:375,height:812},isMobile:true,hasTouch:true});
  test('stays anchored while scrolling, resizing, rotating and attempting zoom during playback', async ({page}) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(shared());
    await page.getByRole('button', {name:'Play',exact:true}).tap();
    const cdp = await page.context().newCDPSession(page);
    for (const size of [{width:375,height:680},{width:375,height:812},{width:844,height:390},{width:320,height:568}]) {
      await page.setViewportSize(size);
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await cdp.send('Input.synthesizePinchGesture', {x:160,y:100,scaleFactor:1.6,relativeSpeed:800,gestureSourceType:'touch'});
      await expect.poll(() => page.evaluate(() => {
        const bounds = document.querySelector('.playback-card').getBoundingClientRect();
        return Math.abs(bounds.bottom - (visualViewport.offsetTop + visualViewport.height));
      })).toBeLessThan(1);
      const state = await page.evaluate(() => {
        const player = document.querySelector('.playback-card').getBoundingClientRect();
        const buttons = [...document.querySelectorAll('.player-buttons button')].map(button => {
          const rect = button.getBoundingClientRect();
          const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
          return button.contains(hit);
        });
        const canvases = [...document.querySelectorAll('.playback-card canvas')].map(canvas => {
          const rect = canvas.getBoundingClientRect(), gl = canvas.getContext('webgl');
          return {width:canvas.width, expected:Math.round(rect.width * Math.min(devicePixelRatio,2)), lost:gl.isContextLost()};
        });
        return {scale:visualViewport.scale,left:player.left,right:player.right,width:innerWidth,buttons,canvases};
      });
      expect(state.scale).toBe(1);
      expect(state.left).toBe(0);
      expect(state.right).toBe(state.width);
      const graphEdges = await page.locator('.playback-card canvas').evaluateAll(canvases => canvases.map(canvas => {
        const bounds = canvas.getBoundingClientRect();
        return {left:bounds.left,right:bounds.right};
      }));
      for (const edge of graphEdges) { expect(edge.left).toBe(0); expect(edge.right).toBe(state.width); }

      expect(state.buttons).toEqual([true,true,true]);
      for (const canvas of state.canvases) { expect(canvas.width).toBe(canvas.expected); expect(canvas.lost).toBe(false); }
      await expect(page.locator('.waveform-trace')).toHaveAttribute('data-state','live');
      await expect(page.locator('.fft-trace')).toHaveAttribute('data-state','live');
      await page.evaluate(() => window.scrollTo(0,0));
    }
    await page.getByRole('button', {name:'Stop',exact:true}).tap();
    expect(errors).toEqual([]);
  });
});


test('WAV worker preserves samples and cached audio, with a synchronous fallback', async ({page}) => {
  await page.goto(shared());
  const result = await page.evaluate(async () => {
    const { renderSound, encodeWav } = await import('/src/audio.js');
    const { encodeWavAsync } = await import('/src/wav-encoder.js');
    const { defaults } = await import('/src/settings.js');
    const audio = await renderSound(defaults), samples = audio.getChannelData(0);
    const original = samples.slice(), expected = new Uint8Array(await encodeWav(audio).arrayBuffer());
    const actual = new Uint8Array(await (await encodeWavAsync(audio)).arrayBuffer());
    const intact = samples.length === original.length && samples.every((value,index) => value === original[index]);
    const Worker = window.Worker;
    try {
      window.Worker = undefined;
      const fallback = new Uint8Array(await (await encodeWavAsync(audio)).arrayBuffer());
      return {intact, workerMatches:actual.every((value,index) => value === expected[index]),
        sameLength:actual.length === expected.length,
        fallbackMatches:fallback.length === expected.length && fallback.every((value,index) => value === expected[index])};
    } finally { window.Worker = Worker; }
  });
  expect(result).toEqual({intact:true,workerMatches:true,sameLength:true,fallbackMatches:true});
});

test('GPU traces fall back to non-instanced WebGL when the extension is unavailable', async ({page}) => {
  await page.addInitScript(() => {
    const extension = WebGLRenderingContext.prototype.getExtension;
    WebGLRenderingContext.prototype.getExtension = function(name) {
      return name === 'ANGLE_instanced_arrays' ? null : extension.call(this,name);
    };
  });
  await trackGpuTraces(page);
  await page.goto(shared());
  await page.getByRole('button',{name:'Play',exact:true}).click();
  for (const name of ['waveform-trace','fft-trace']) {
    await expect.poll(() => page.evaluate(name => window.gpuTraces[name]?.lit??0,name)).toBeGreaterThan(0);
    expect(await page.evaluate(name => window.gpuTraces[name].error,name)).toBe(0);
  }
});


test('live edits reuse the shaper and upload compact GPU point buffers', async ({page}) => {
  await page.addInitScript(() => {
    window.audioCurveWrites = 0; window.traceUploads = [];
    const curve = Object.getOwnPropertyDescriptor(WaveShaperNode.prototype,'curve');
    Object.defineProperty(WaveShaperNode.prototype,'curve',{...curve,set(value){window.audioCurveWrites++;curve.set.call(this,value);}});
    const upload = WebGLRenderingContext.prototype.bufferSubData;
    WebGLRenderingContext.prototype.bufferSubData = function(...args) {
      window.traceUploads.push(args[2].byteLength); return upload.apply(this,args);
    };
  });
  await page.goto(shared());
  await page.getByRole('button',{name:'Play',exact:true}).click();
  await expect(page.locator('.waveform-trace')).toHaveAttribute('data-state','live');
  await page.evaluate(() => {window.audioCurveWrites=0;window.traceUploads=[];});
  const drive = page.getByRole('slider',{name:'Drive',exact:true});
  await drive.fill('10'); await drive.fill('15'); await drive.fill('20');
  await page.getByRole('slider',{name:'Noise level',exact:true}).fill('20');
  await expect.poll(() => page.evaluate(() => window.traceUploads.length)).toBeGreaterThan(4);
  const result = await page.evaluate(() => ({writes:window.audioCurveWrites,maxUpload:Math.max(...window.traceUploads)}));
  expect(result.writes).toBe(0);
  expect(result.maxUpload).toBeLessThan(6000);
  await expect(page.locator('.noise-display canvas')).toHaveCount(1);
  await expect(page.locator('.noise-display span')).toHaveCount(0);
});


test.describe('visual work budgets', () => {
  test.use({viewport:{width:375,height:812},isMobile:true,hasTouch:true});
  test('caps graph polling/drawing and freezes offscreen decorations', async ({page}) => {
    await page.emulateMedia({reducedMotion:'no-preference'});
    await page.addInitScript(() => {
      window.workCounts={frequency:0,draws:0};
      const read=AnalyserNode.prototype.getFloatFrequencyData;
      AnalyserNode.prototype.getFloatFrequencyData=function(...args){window.workCounts.frequency++;return read.apply(this,args);};
      const extension=WebGLRenderingContext.prototype.getExtension,wrapped=new WeakSet();
      WebGLRenderingContext.prototype.getExtension=function(name){
        const ext=extension.call(this,name);
        if(name==='ANGLE_instanced_arrays'&&ext&&!wrapped.has(ext)){
          wrapped.add(ext);const draw=ext.drawArraysInstancedANGLE.bind(ext);
          ext.drawArraysInstancedANGLE=(...args)=>{window.workCounts.draws++;return draw(...args);};
        }
        return ext;
      };
    });
    await page.goto(shared({...defaults,noiseLevel:20}));
    await page.getByRole('button',{name:'Play',exact:true}).tap();
    await expect(page.locator('.fft-trace')).toHaveAttribute('data-state','live');
    await page.evaluate(()=>{window.workCounts={frequency:0,draws:0};});
    await page.waitForTimeout(600);
    const work=await page.evaluate(()=>window.workCounts);
    expect(work.frequency).toBeGreaterThan(8); expect(work.frequency).toBeLessThanOrEqual(22);
    expect(work.draws).toBeGreaterThan(8); expect(work.draws).toBeLessThanOrEqual(62);
    await page.getByRole('slider',{name:'Drive',exact:true}).scrollIntoViewIfNeeded();
    await page.waitForTimeout(120);
    const frozen=await page.locator('.pond').evaluate(root=>{
      window.frozenAnimations=root.getAnimations({subtree:true}).filter(a=>a.effect.getTiming().iterations===Infinity);
      return window.frozenAnimations.map(a=>a.currentTime);
    });
    expect(frozen.length).toBeGreaterThan(0);
    await page.waitForTimeout(180);
    expect(await page.evaluate(()=>window.frozenAnimations.map(a=>a.currentTime))).toEqual(frozen);
    await page.evaluate(times=>window.freezeTimes=times,frozen);
    await page.locator('.fish-card').scrollIntoViewIfNeeded();
    await expect.poll(()=>page.evaluate(()=>window.frozenAnimations.some((a,i)=>a.currentTime>window.freezeTimes[i])),{timeout:1000}).toBeTruthy();
    await page.getByRole('button',{name:'Stop',exact:true}).tap();
    await page.waitForTimeout(80);
    const stopped=await page.evaluate(()=>({...window.workCounts}));
    await page.waitForTimeout(160);
    expect(await page.evaluate(()=>window.workCounts)).toEqual(stopped);
  });
});


test('social cards and SEO metadata are available in the initial HTML with valid assets', async ({page,request}) => {
  const response=await request.get(shared());
  expect(response.status()).toBe(200);
  const metadata=await page.evaluate(source=>{
    const doc=new DOMParser().parseFromString(source,'text/html');
    const content=key=>doc.querySelector(`meta[property="${key}"],meta[name="${key}"]`)?.content;
    return {title:doc.title,description:content('description'),canonical:doc.querySelector('link[rel="canonical"]')?.getAttribute('href'),
      ogUrl:content('og:url'),image:content('og:image'),width:content('og:image:width'),height:content('og:image:height'),
      imageAlt:content('og:image:alt'),card:content('twitter:card'),twitterImage:content('twitter:image'),robots:content('robots'),
      schema:JSON.parse(doc.querySelector('script[type="application/ld+json"]').textContent),fallback:doc.querySelector('#app').textContent};
  },await response.text());
  expect(metadata.title).toBe('Bassifier — Free Online Bass Synthesizer');
  expect(metadata.description.length).toBeGreaterThan(100);
  expect(metadata.description.length).toBeLessThanOrEqual(160);
  expect(metadata.canonical).toBe('https://teuncm.nl/bassifier/');
  expect(metadata.ogUrl).toBe(metadata.canonical);
  expect(metadata.image).toBe('https://teuncm.nl/bassifier/social-card.png');
  expect(metadata.twitterImage).toBe(metadata.image);
  expect(metadata.imageAlt).toContain('cartoon bass fish');
  expect(metadata.card).toBe('summary_large_image');
  expect(metadata.robots).toContain('max-image-preview:large');
  expect(metadata.schema['@type']).toBe('WebApplication');
  expect(metadata.schema.url).toBe(metadata.canonical);
  expect(metadata.schema.offers.price).toBe('0');
  expect(metadata.schema.isAccessibleForFree).toBe(true);
  expect(metadata.fallback).toContain('five sawtooth voices');
  expect(metadata.fallback).toContain('30-second stereo WAV');
  const image=await request.get('/social-card.png'), png=await image.body();
  expect(image.headers()['content-type']).toContain('image/png');
  expect(png.readUInt32BE(16)).toBe(Number(metadata.width));
  expect(png.readUInt32BE(20)).toBe(Number(metadata.height));
  expect(png.length).toBeLessThan(300000);
  const touch=await (await request.get('/apple-touch-icon.png')).body();
  expect(touch.readUInt32BE(16)).toBe(180);expect(touch.readUInt32BE(20)).toBe(180);
  const sitemap=await request.get('/sitemap.xml');
  const urls=await page.evaluate(source=>[...new DOMParser().parseFromString(source,'application/xml').querySelectorAll('loc')].map(node=>node.textContent),await sitemap.text());
  expect(urls).toEqual([metadata.canonical]);
});


test('visitors without JavaScript receive useful accessible synth information', async ({browser},testInfo) => {
  const context=await browser.newContext({baseURL:testInfo.project.use.baseURL,javaScriptEnabled:false});
  try {
    const page=await context.newPage();await page.goto('/');
    await expect(page.getByRole('heading',{level:1})).toHaveText('Bassifier — free online bass synthesizer');
    await expect(page.getByRole('main')).toContainText('five sawtooth voices');
    await expect(page.getByRole('main')).toContainText('Enable JavaScript to play');
    await expect(page.getByRole('link',{name:'Teun M.'})).toHaveAttribute('href','https://teuncm.nl/');
  }finally{await context.close();}
});
