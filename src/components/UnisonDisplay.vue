<script setup>
import { computed, ref, onUnmounted } from "vue";
import { parameters, unisonDetunes } from "../settings.js";

const props = defineProps({ voices: Number, detune: Number, width: { type: Number, default: 0 } });
const emit = defineEmits(["update:voices", "update:detune", "update:width"]);
const dragging = ref(false);
let gesture = null;
const wheeling = ref(false);
let wheelTimer;
onUnmounted(() => clearTimeout(wheelTimer));
const offsets = computed(() => unisonDetunes(props.voices, props.detune));

function update(name, value) {
  const parameter =
    parameters[{ voices: "unisonVoices", detune: "unisonDetune", width: "unisonWidth" }[name]];
  emit(
    `update:${name}`,
    Math.max(parameter.min, Math.min(parameter.max, Math.round(value))),
  );
}
function wheel(event) {
  if (!event.deltaY) return;
  const pixels = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 80 : 1);
  update("width", props.width - Math.sign(pixels) * Math.max(1, Math.round(Math.abs(pixels) / 10)));
  wheeling.value = true;
  clearTimeout(wheelTimer);
  wheelTimer = setTimeout(() => { wheeling.value = false; }, 180);
}
function tilt(index) {
  const pan = props.voices === 1 ? 0 : (2 * index / (props.voices - 1) - 1) * props.width / 100;
  return pan * Math.PI / 6;
}
function down(event) {
  if (event.button !== 0 || gesture) return;
  event.preventDefault();
  const element = event.currentTarget;
  const bounds = element.getBoundingClientRect();
  gesture = {
    id: event.pointerId,
    x: event.clientX,
    y: event.clientY,
    voices: props.voices,
    detune: props.detune,
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
    "voices",
    gesture.voices + ((gesture.y - event.clientY) / gesture.height) * 6,
  );
  update(
    "detune",
    gesture.detune + ((event.clientX - gesture.x) / gesture.width) * 75,
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
    ArrowUp: ["voices", props.voices + 1],
    ArrowDown: ["voices", props.voices - 1],
    ArrowRight: ["detune", props.detune + 1],
    ArrowLeft: ["detune", props.detune - 1],
  };
  if (!changes[event.key]) return;
  event.preventDefault();
  event.stopPropagation();
  update(...changes[event.key]);
}
</script>

<template>
  <div
    class="unison-display parameter-visual"
    :class="{ dragging: dragging || wheeling }"
    tabindex="0"
    role="group"
    aria-label="Unison visual control"
    aria-describedby="unison-gesture-help"
    @pointerdown="down"
    @pointermove="move"
    @pointerup="release"
    @pointercancel="release"
    @lostpointercapture="release"
    @keydown="keydown"
    @wheel.prevent.stop="wheel"
  >
    <svg viewBox="0 0 400 80" preserveAspectRatio="none" aria-hidden="true">
      <line
        v-for="(offset, index) in offsets"
        :key="index"
        class="unison-voice visual-line"
        :x1="200 + (offset / 75) * 178 + Math.sin(tilt(index)) * 36"
        :x2="200 + (offset / 75) * 178 - Math.sin(tilt(index)) * 36"
        :y1="40 - Math.cos(tilt(index)) * 36"
        :y2="40 + Math.cos(tilt(index)) * 36"
      />
    </svg>
    <span id="unison-gesture-help" class="sr-only"
      >Drag up or down for voices, right or left for detune. Arrow keys also
      adjust these values. Scroll up for more stereo width, down for less.</span
    >
  </div>
</template>

<style scoped>
.unison-display {
  margin-bottom: 12px;
  cursor: grab;
}
.unison-display.dragging {
  cursor: grabbing;
}
svg {
  display: block;
  width: 100%;
  height: 80px;
  overflow: visible;
}
</style>
