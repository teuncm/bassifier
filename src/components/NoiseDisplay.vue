<script setup>
import { computed, ref, watch, onMounted, onBeforeUnmount } from "vue";
import { parameters, seededRandom } from "../settings.js";

const props = defineProps({ level: { type: Number, default: 0 } });
const emit = defineEmits(["update:level"]);
const range = parameters.noiseLevel;
const dragging = ref(false);
let gesture = null;
const random = seededRandom(0x5015);
const canvas = ref(null);
const particles = new Float32Array(400);
let context, sizeObserver, themeObserver, width = 1, height = 85;
const amount = computed(() => Math.max(0, Math.min(1, props.level / range.max)));
function shuffle() {
  for (let i = 0; i < particles.length; i += 2) {
    particles[i] = 0.03 + random() * 0.94;
    particles[i + 1] = 0.04 + random() * 0.92;
  }
}
function paint() {
  if (!context) return;
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.round(width * ratio), h = Math.round(height * ratio);
  if (canvas.value.width !== w || canvas.value.height !== h) {
    canvas.value.width = w; canvas.value.height = h;
  }
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, width, height);
  context.fillStyle = getComputedStyle(canvas.value).color;
  context.beginPath();
  const count = Math.round(amount.value * 200);
  for (let i = 0; i < count; i++) {
    const x = particles[i * 2] * width, y = particles[i * 2 + 1] * height;
    context.moveTo(x + 1.5, y);
    context.arc(x, y, 1.5, 0, Math.PI * 2);
  }
  context.fill();
}
shuffle();
watch(() => props.level, () => { shuffle(); paint(); }, { flush: "post" });
watch(dragging, paint, { flush: "post" });
onMounted(() => {
  context = canvas.value.getContext("2d");
  sizeObserver = new ResizeObserver(([entry]) => {
    if (entry.contentRect.width && entry.contentRect.height) {
      width = entry.contentRect.width; height = entry.contentRect.height; paint();
    }
  });
  sizeObserver.observe(canvas.value);
  themeObserver = new MutationObserver(paint);
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
});
onBeforeUnmount(() => { sizeObserver?.disconnect(); themeObserver?.disconnect(); });
function update(value) {
  emit("update:level", Math.max(range.min, Math.min(range.max,
    Math.round(value / range.step) * range.step)));
}
function down(event) {
  if (event.button !== 0 || gesture) return;
  event.preventDefault();
  const element = event.currentTarget;
  gesture = { id: event.pointerId, y: event.clientY, level: props.level, height: element.getBoundingClientRect().height };
  element.focus({ preventScroll: true });
  element.setPointerCapture(event.pointerId);
  dragging.value = true;
}
function move(event) {
  if (gesture?.id !== event.pointerId) return;
  update(gesture.level + (gesture.y - event.clientY) / gesture.height * (range.max - range.min));
}
function release(event) {
  if (gesture?.id !== event.pointerId) return;
  gesture = null;
  dragging.value = false;
  if (event.currentTarget.hasPointerCapture(event.pointerId))
    event.currentTarget.releasePointerCapture(event.pointerId);
}
function keydown(event) {
  const next = {
    ArrowUp: props.level + range.step, ArrowRight: props.level + range.step,
    ArrowDown: props.level - range.step, ArrowLeft: props.level - range.step,
    Home: range.min, End: range.max,
  }[event.key];
  if (next === undefined) return;
  event.preventDefault(); event.stopPropagation(); update(next);
}
</script>

<template>
  <div class="noise-display parameter-visual" :class="{ dragging }" tabindex="0"
    role="slider" aria-label="Noise visual control" aria-orientation="vertical"
    aria-description="Drag up to increase noise, down to decrease. Arrow keys, Home and End also adjust noise."
    :aria-valuemin="range.min" :aria-valuemax="range.max" :aria-valuenow="level" :aria-valuetext="`${level}%`"
    @pointerdown="down" @pointermove="move" @pointerup="release" @pointercancel="release"
    @lostpointercapture="release" @keydown="keydown">
    <canvas ref="canvas" class="noise-particles" aria-hidden="true" />
  </div>
</template>

<style scoped>
.noise-display { position: relative; width: 100%; height: 85px; overflow: hidden; cursor: ns-resize; }
.noise-particles { display: block; width: 100%; height: 100%; color: var(--visual-signal); pointer-events: none; }
</style>
