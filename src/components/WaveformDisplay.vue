<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { oscillationSamples, smoothTrace } from "../oscilloscope.js";

import { createFrameLoop } from "../frame-loop.js";
import { createGpuTrace } from "../gpu-trace.js";

const props = defineProps({
  analyser: Object,
  voice: Object,
  context: Object,
  playing: Boolean,
});
const root = ref(null), trace = ref(null);
let renderer;
const flatline = Float32Array.of(0, 42, 720, 42);
let points, pointCount = 0;
const loop = createFrameLoop(draw);
let visible = true, observer, samples, target, display,
  lastDraw = -Infinity, lastFrame = null;
function draw(timestamp = performance.now()) {
  if (!renderer) return;
  if (!props.playing || !props.voice || !props.analyser || !props.context) {
    loop.stop();
    renderer.draw(flatline);
    trace.value.dataset.state = "silent";
    root.value.removeAttribute("data-window-seconds");
    lastDraw = -Infinity;
    target = display = null;
    lastFrame = null;
    return;
  }
  if (!visible || document.hidden) {
    loop.stop();
    lastFrame = null;
    return;
  }
  const count = Math.min(512, Math.max(128, Math.ceil(renderer.width)));
  if (count !== pointCount) {
    pointCount = count; points = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) points[i * 2] = i / (count - 1) * 720;
    target = display = null; lastDraw = -Infinity;
  }
  const frequency = props.voice.frequency;
  const windowSeconds = 2 / frequency;
  const now = props.context.currentTime;
  // Refresh at half the note frequency, limited by the display's frame rate.
  if (now - lastDraw >= windowSeconds) {
    const size = props.analyser.fftSize;
    if (samples?.length !== size) samples = new Float32Array(size);
    props.analyser.getFloatTimeDomainData(samples);
    target = oscillationSamples(samples, props.context.sampleRate, frequency, props.voice.phase, pointCount, target ?? undefined);
    if (!display) display = target.slice();
    if (root.value.dataset.windowSeconds !== String(windowSeconds))
      root.value.setAttribute("data-window-seconds", windowSeconds);
    lastDraw = now;
  }
  if (target) {
    smoothTrace(display, target, lastFrame === null ? 0 : (timestamp - lastFrame) / 1000);
    for (let i = 0; i < display.length; i++) points[i * 2 + 1] = 42 - display[i] * 152;
    renderer.draw(points);
    if (trace.value.dataset.state !== "live") trace.value.dataset.state = "live";
  }
  lastFrame = timestamp;
}
watch(() => [props.voice, props.playing, props.analyser], () => {
  lastDraw = -Infinity;
  target = display = null;
  lastFrame = null;
  resume();
}, { flush: "post" });
onMounted(() => {
  renderer = createGpuTrace(trace.value, 84, true);
  draw();
  document.addEventListener("visibilitychange", resume);
  observer = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible) resume();
    else loop.stop();
  });
  observer.observe(root.value);
});
function resume() {
  draw();
  if (props.playing && props.voice && visible && !document.hidden) loop.start();
}
onBeforeUnmount(() => {
  document.removeEventListener("visibilitychange", resume);
  loop.stop();
  renderer?.dispose();
  observer?.disconnect();
});
</script>
<template>
  <div ref="root" class="waveform" role="img" aria-label="Live oscillation of the current bass sound">
    <canvas ref="trace" class="waveform-trace" aria-hidden="true" />
  </div>
</template>
