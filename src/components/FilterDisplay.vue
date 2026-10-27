<script setup>
import { computed, ref } from "vue";
import { parameters } from "../settings.js";
import { filterResponse } from "../filter-response.js";

const props = defineProps({
  cutoff: Number,
  resonance: Number,
  sampleRate: { type: Number, default: 44100 },
});
const emit = defineEmits(["update:cutoff", "update:resonance"]);
const dragging = ref(false);
let gesture = null;
const range = parameters.cutoff;
const response = computed(() => {
  return filterResponse(props.cutoff, props.resonance, props.sampleRate)
    .map(
      ({ position, y }, index) =>
        `${index ? "L" : "M"}${(position * 400).toFixed(3)},${y.toFixed(3)}`,
    )
    .join(" ");
});
function update(name, value) {
  const p = parameters[name];
  emit(
    `update:${name}`,
    Math.max(p.min, Math.min(p.max, Math.round(value / p.step) * p.step)),
  );
}
function down(event) {
  if (event.button !== 0 || gesture) return;
  event.preventDefault();
  const element = event.currentTarget,
    bounds = element.getBoundingClientRect();
  gesture = {
    id: event.pointerId,
    x: event.clientX,
    y: event.clientY,
    cutoff: props.cutoff,
    resonance: props.resonance,
    width: bounds.width,
    height: bounds.height,
  };
  element.focus({ preventScroll: true });
  element.setPointerCapture(event.pointerId);
  dragging.value = true;
}
function move(event) {
  if (gesture?.id !== event.pointerId) return;
  update(
    "cutoff",
    gesture.cutoff *
      (range.max / range.min) ** ((event.clientX - gesture.x) / gesture.width),
  );
  update(
    "resonance",
    gesture.resonance + ((gesture.y - event.clientY) / gesture.height) * 100,
  );
}
function release(event) {
  if (gesture?.id !== event.pointerId) return;
  gesture = null;
  dragging.value = false;
  if (event.currentTarget.hasPointerCapture(event.pointerId))
    event.currentTarget.releasePointerCapture(event.pointerId);
}
function keydown(event) {
  const changes = {
    ArrowRight: ["cutoff", props.cutoff + range.step],
    ArrowLeft: ["cutoff", props.cutoff - range.step],
    ArrowUp: ["resonance", props.resonance + 1],
    ArrowDown: ["resonance", props.resonance - 1],
  };
  if (!changes[event.key]) return;
  event.preventDefault();
  event.stopPropagation();
  update(...changes[event.key]);
}
</script>

<template>
  <div
    class="filter-display parameter-visual"
    :class="{ dragging }"
    tabindex="0"
    role="group"
    aria-label="Low pass visual control"
    aria-description="Drag right or left for cutoff, up or down for resonance. Arrow keys also adjust these values."
    @pointerdown="down"
    @pointermove="move"
    @pointerup="release"
    @pointercancel="release"
    @lostpointercapture="release"
    @keydown="keydown"
  >
    <svg viewBox="0 0 400 80" preserveAspectRatio="none" aria-hidden="true">
      <path :d="`${response} L400,80 L0,80 Z`" class="filter-fill" />
      <path :d="response" class="filter-response visual-line" />
    </svg>
  </div>
</template>

<style scoped>
.filter-display {
  margin-bottom: 12px;
  overflow: hidden;
  cursor: grab;
}
.filter-display.dragging {
  cursor: grabbing;
}
svg {
  display: block;
  width: 100%;
  height: 80px;
}
.filter-fill {
  fill: var(--visual-signal);
  opacity: 0.07;
}
</style>
