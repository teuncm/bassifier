import { createServer } from "vite";
import { chromium } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

// Generate checked-in assets from the real fish component and audio engine.
// No browser or image tooling is required during the production build.
const root = fileURLToPath(new URL("../", import.meta.url));
const asset = name => new URL(`../public/${name}`, import.meta.url);
const server = await createServer({ root, server: { host: "127.0.0.1", port: 0 } });
await server.listen();
let browser;
try {
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await page.goto(server.resolvedUrls.local[0]);
  for (const [name, value] of [["Unison voices", 3], ["Unison detune", 24], ["Unison width", 90], ["Noise level", 8], ["Drive", 18]])
    await page.getByRole("slider", { name, exact: true }).fill(String(value));
  const fish = await page.locator(".fish-svg").evaluate(element => {
    const clone = element.cloneNode(true);
    clone.querySelector(".fish-eye-open").style.removeProperty("display");
    clone.querySelector(".fish-eyelid").style.display = "none";
    for (const selector of [".fish-heading", ".fish-propulsion", ".fish-tail", ".fish-fin"])
      clone.querySelector(selector)?.removeAttribute("style");
    clone.querySelectorAll("[class]").forEach(node => node.removeAttribute("class"));
    clone.removeAttribute("role"); clone.removeAttribute("aria-label");
    return clone.outerHTML;
  });
  const wave = await page.evaluate(async () => {
    const { renderSound } = await import("/src/audio.js");
    const { defaults, noteFrequency } = await import("/src/settings.js");
    const { oscillationPath } = await import("/src/oscilloscope.js");
    const settings = { ...defaults, unisonVoices: 3, unisonDetune: 24, unisonWidth: 90, noiseLevel: 8, drive: 18 };
    const audio = await renderSound(settings), start = Math.floor(audio.sampleRate * 0.75);
    const samples = audio.getChannelData(0).subarray(start, start + 16384);
    const frequency = noteFrequency(settings.note);
    return oscillationPath(samples, audio.sampleRate, frequency, (start + samples.length - 1) / audio.sampleRate * frequency);
  });
  const illustration = fish.replace(/<svg\b[^>]*>/, '<svg x="650" y="100" width="520" height="398" viewBox="0 0 300 230">');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" role="img" aria-labelledby="title description">
  <title id="title">Bassifier — free online bass synthesizer</title>
  <desc id="description">A red cartoon bass fish and a purple audio waveform. Big bass. Little fish. Play in your browser and download WAV samples.</desc>
  <rect width="1200" height="630" fill="#f7f0ee"/>
  <rect x="24" y="24" width="1152" height="582" rx="32" fill="#fffaf7" stroke="#e9dcd7" stroke-width="2"/>
  <circle cx="916" cy="312" r="223" fill="#f3e4dc"/>
  <g fill="none" stroke="#8952c2" stroke-width="2" opacity=".22">
    <circle cx="1120" cy="105" r="17"/><circle cx="1093" cy="139" r="7"/>
    <circle cx="692" cy="476" r="11"/><circle cx="714" cy="502" r="5"/>
  </g>
  <ellipse cx="916" cy="477" rx="170" ry="13" fill="#82332f" opacity=".07"/>
  ${illustration}
  <g font-family="Segoe UI, Arial, sans-serif" fill="#442c2c">
    <text x="72" y="105" font-size="14" font-weight="600" letter-spacing="2.4" fill="#8952c2">FREE ONLINE BASS SYNTH</text>
    <text x="66" y="222" font-size="96" font-weight="700" letter-spacing="-4">Bassifier</text>
    <text x="72" y="290" font-size="34" font-weight="600">Big bass. Little fish.</text>
    <text x="72" y="337" font-size="24" fill="#74666e">Unison, noise &amp; distortion.</text>
    <rect x="64" y="376" width="500" height="92" rx="16" fill="#f7f0ee"/>
    <g transform="translate(80 390) scale(.65 .74)"><path d="${wave}" fill="none" stroke="#8952c2" stroke-width="2" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></g>
    <rect x="72" y="492" width="246" height="42" rx="21" fill="#8952c2"/>
    <text x="195" y="518" font-size="14" font-weight="600" letter-spacing=".8" text-anchor="middle" fill="#fffaf7">PLAY IN YOUR BROWSER</text>
    <rect x="330" y="492" width="200" height="42" rx="21" fill="#f2dfd9"/>
    <text x="430" y="518" font-size="15" font-weight="600" text-anchor="middle" fill="#82332f">3s / 30s WAV</text>
    <text x="72" y="575" font-size="16" fill="#74666e">teuncm.nl/bassifier</text>
  </g>
</svg>`;
  await writeFile(asset("social-card.svg"), svg);
  const output = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await output.setContent(`<style>html,body{margin:0}svg{display:block}</style>${svg}`);
  await output.screenshot({ path: fileURLToPath(asset("social-card.png")) });

  const icon = await readFile(asset("favicon.svg"), "utf8");
  for (const [size, name] of [[180, "apple-touch-icon.png"], [32, "favicon-32.png"]]) {
    await output.setViewportSize({ width: size, height: size });
    await output.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${size === 180 ? icon.replace('rx="12"', '') : icon}`);
    await output.screenshot({ path: fileURLToPath(asset(name)), omitBackground: true });
  }
  const png = await readFile(asset("favicon-32.png")), header = Buffer.alloc(22);
  header.writeUInt16LE(1, 2); header.writeUInt16LE(1, 4);
  header[6] = 32; header[7] = 32;
  header.writeUInt16LE(1, 10); header.writeUInt16LE(32, 12);
  header.writeUInt32LE(png.length, 14); header.writeUInt32LE(22, 18);
  await writeFile(asset("favicon.ico"), Buffer.concat([header, png]));
  console.log("Generated social card (1200×630), touch icon, and favicons.");
} finally {
  await browser?.close();
  await server.close();
}
