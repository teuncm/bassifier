<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { oscillationSamples, smoothTrace, tracePath } from "../oscilloscope.js";

const props = defineProps({
  analyser: Object,
  voice: Object,
  context: Object,
  playing: Boolean,
});
const root = ref(null), trace = ref(null), glow = ref(null);
let frame = 0, visible = true, observer, samples, target, display,
  lastDraw = -Infinity, lastFrame = null;
function setTrace(path) {
  trace.value.setAttribute("d", path);
  glow.value.setAttribute("d", path);
}
function draw(timestamp = performance.now()) {
  cancelAnimationFrame(frame);
  if (!trace.value) return;
  if (!props.playing || !props.voice || !props.analyser || !props.context) {
    setTrace("M0,42 L720,42");
    root.value.removeAttribute("data-window-seconds");
    lastDraw = -Infinity;
    target = display = null;
    lastFrame = null;
    return;
  }
  if (!visible || document.hidden) {
    lastFrame = null;
    return;
  }
  const frequency = props.voice.frequency;
  const windowSeconds = 2 / frequency;
  const now = props.context.currentTime;
  // Refresh at half the note frequency, limited by the display's frame rate.
  if (now - lastDraw >= windowSeconds) {
    const size = props.analyser.fftSize;
    if (samples?.length !== size) samples = new Float32Array(size);
    props.analyser.getFloatTimeDomainData(samples);
    target = oscillationSamples(samples, props.context.sampleRate, frequency, props.voice.phase, 512, target ?? undefined);
    if (!display) display = target.slice();
    root.value.setAttribute("data-window-seconds", windowSeconds);
    lastDraw = now;
  }
  if (target) {
    smoothTrace(display, target, lastFrame === null ? 0 : (timestamp - lastFrame) / 1000);
    setTrace(tracePath(display));
  }
  lastFrame = timestamp;
  frame = requestAnimationFrame(draw);
}
watch(() => [props.voice, props.playing, props.analyser], () => {
  lastDraw = -Infinity;
  target = display = null;
  lastFrame = null;
  draw();
}, { flush: "post" });
onMounted(() => {
  observer = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible) draw();
    else cancelAnimationFrame(frame);
  });
  observer.observe(root.value);
});
onBeforeUnmount(() => {
  cancelAnimationFrame(frame);
  observer?.disconnect();
});
</script>
<template>
  <div ref="root" class="waveform" role="img" aria-label="Live oscillation of the current bass sound">
    <svg viewBox="0 0 720 84" preserveAspectRatio="none" aria-hidden="true">
      <path ref="glow" d="M0,42 L720,42" class="waveform-glow" />
      <path ref="trace" d="M0,42 L720,42" class="waveform-trace" />
    </svg>
  </div>
</template>
