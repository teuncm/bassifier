<script setup>
import { computed, ref } from "vue";
import { parameters, seededRandom } from "../settings.js";

const props = defineProps({ level: { type: Number, default: 0 } });
const emit = defineEmits(["update:level"]);
const range = parameters.noiseLevel;
const dragging = ref(false);
let gesture = null;
const random = seededRandom(0x5015);
const particles = Array.from({ length: 200 }, () => ({
  x: 3 + random() * 94,
  y: 4 + random() * 92,
  size: 1.5 + random() * 2,
  opacity: 0.35 + random() * 0.55,
}));
const amount = computed(() => Math.max(0, Math.min(1, props.level / range.max)));
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
    <span v-for="(particle, index) in particles" :key="index" class="noise-particle" aria-hidden="true"
      :style="{
        left: `${particle.x}%`,
        top: `${particle.y}%`,
        width: `${particle.size}px`, height: `${particle.size}px`,
        opacity: Math.max(0, Math.min(1, amount * particles.length - index)) * particle.opacity,
      }" />
  </div>
</template>

<style scoped>
.noise-display { position: relative; width: 100%; height: 85px; overflow: hidden; cursor: ns-resize; }
.noise-particle {
  position: absolute; border-radius: 50%; background: var(--visual-signal);
  transform: translate(-50%, -50%); pointer-events: none;
  transition: opacity 100ms, background 100ms;
}
.dragging .noise-particle { background: var(--interaction); }
</style>
