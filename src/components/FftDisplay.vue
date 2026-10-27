<script setup>
import { onMounted, onBeforeUnmount, ref, watch } from "vue";

import { spectrumFftSize, spectrumPath } from "../spectrum.js";

const props = defineProps({ analyser: Object, context: Object, playing: Boolean });
const root = ref(null), trace = ref(null);
let frame, observer, samples, source, analyser, visible = true;
function disconnect() {
  if (source && analyser) source.disconnect(analyser);
  analyser?.disconnect();
  source = analyser = null;
}
function draw() {
  cancelAnimationFrame(frame);
  if (!trace.value) return;
  if (!props.playing || !props.analyser || !props.context) {
    disconnect();
    trace.value.setAttribute("d", "M0,90H720");
    return;
  }
  if (!visible || document.hidden) return;
  if (source !== props.analyser) {
    disconnect();
    source = props.analyser;
    analyser = props.context.createAnalyser();
    analyser.fftSize = spectrumFftSize;
    analyser.smoothingTimeConstant = 0;
    source.connect(analyser);
    samples = new Float32Array(analyser.frequencyBinCount);
  }
  analyser.getFloatFrequencyData(samples);
  trace.value.setAttribute("d", spectrumPath(samples, props.context.sampleRate));
  frame = requestAnimationFrame(draw);
}
function resume() { draw(); }
watch(() => [props.analyser, props.context, props.playing], () => {
  draw();
}, { flush: "post" });
onMounted(() => {
  observer = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible) draw();
    else cancelAnimationFrame(frame);
  });
  observer.observe(root.value);
  document.addEventListener("visibilitychange", resume);
});
onBeforeUnmount(() => {
  cancelAnimationFrame(frame);
  observer?.disconnect();
  disconnect();
  document.removeEventListener("visibilitychange", resume);
});
</script>

<template>
  <div ref="root" class="fft-display" role="img" aria-label="Live frequency spectrum, logarithmic frequency scale">
    <svg viewBox="0 0 720 94" preserveAspectRatio="none" aria-hidden="true">
      <path ref="trace" d="M0,90H720" class="fft-trace" />
    </svg>
  </div>
</template>
