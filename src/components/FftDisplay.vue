<script setup>
import { onMounted, onBeforeUnmount, ref, watch } from "vue";

import { spectrumFftSize, spectrumPoints } from "../spectrum.js";

import { createFrameLoop } from "../frame-loop.js";
import { createGpuTrace } from "../gpu-trace.js";

const props = defineProps({ analyser: Object, context: Object, playing: Boolean });
const root = ref(null), trace = ref(null);
const mobile = window.matchMedia("(max-width: 1023px)");
const loop = createFrameLoop(draw, () => mobile.matches ? 30 : 60);
let observer, samples, source, analyser, points, renderer, visible = true, lastAudioTime = -Infinity;
const flatline = Float32Array.of(0, 90, 720, 90);
function disconnect() {
  if (source && analyser) source.disconnect(analyser);
  analyser?.disconnect();
  source = analyser = null; lastAudioTime = -Infinity;
}
function draw() {
  if (!renderer) return;
  if (!props.playing || !props.analyser || !props.context) {
    loop.stop();
    disconnect();
    renderer.draw(flatline);
    trace.value.dataset.state = "silent";
    return;
  }
  if (!visible || document.hidden) { loop.stop(); return; }
  if (source !== props.analyser) {
    disconnect();
    source = props.analyser;
    analyser = props.context.createAnalyser();
    analyser.fftSize = spectrumFftSize;
    analyser.smoothingTimeConstant = 0;
    source.connect(analyser);
    samples = new Float32Array(analyser.frequencyBinCount);
  }
  if (props.context.currentTime === lastAudioTime) return;
  lastAudioTime = props.context.currentTime;
  analyser.getFloatFrequencyData(samples);
  const columns = Math.max(128, Math.min(720, Math.ceil(renderer.width)));
  points = spectrumPoints(samples, props.context.sampleRate, points, columns);
  renderer.draw(points);
  if (trace.value.dataset.state !== "live") trace.value.dataset.state = "live";
}
function resume() {
  draw();
  if (props.playing && props.analyser && visible && !document.hidden) loop.start();
}
watch(() => [props.analyser, props.context, props.playing], () => {
  resume();
}, { flush: "post" });
onMounted(() => {
  renderer = createGpuTrace(trace.value, 94);
  draw();
  observer = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible) resume();
    else loop.stop();
  });
  observer.observe(root.value);
  document.addEventListener("visibilitychange", resume);
});
onBeforeUnmount(() => {
  loop.stop();
  renderer?.dispose();
  observer?.disconnect();
  disconnect();
  document.removeEventListener("visibilitychange", resume);
});
</script>

<template>
  <div ref="root" class="fft-display" role="img" aria-label="Live frequency spectrum, logarithmic frequency scale">
    <canvas ref="trace" class="fft-trace" aria-hidden="true" />
  </div>
</template>
