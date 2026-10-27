<script setup>
import { computed, ref, onMounted, onUnmounted } from "vue";
import { parameters, unisonDetunes } from "../settings.js";

const props = defineProps({ voices: Number, detune: Number, width: { type: Number, default: 0 } });
const emit = defineEmits(["update:voices", "update:detune", "update:width"]);
const dragging = ref(false);
let gesture = null;
const pointers = new Map();
const wheeling = ref(false);
let wheelTimer, sizeObserver;
const graph = ref(null), tiltScale = ref(1);
onMounted(() => {
  sizeObserver = new ResizeObserver(([entry]) => {
    const { width, height } = entry.contentRect;
    if (width && height) tiltScale.value = (height / 80) / (width / 400);
  });
  sizeObserver.observe(graph.value);
});
onUnmounted(() => { clearTimeout(wheelTimer); sizeObserver?.disconnect(); });
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
  update("voices", props.voices - Math.sign(pixels) * Math.max(1, Math.round(Math.abs(pixels) / 100)));
  wheeling.value = true;
  clearTimeout(wheelTimer);
  wheelTimer = setTimeout(() => { wheeling.value = false; }, 180);
}
function tilt(index) {
  const pan = props.voices === 1 ? 0 : (2 * index / (props.voices - 1) - 1) * props.width / 100;
  return pan * Math.PI / 4;
}
function anchor(bounds) {
  const positions = [...pointers.values()];
  gesture = {
    x: positions.reduce((sum, point) => sum + point.x, 0) / positions.length,
    y: positions.reduce((sum, point) => sum + point.y, 0) / positions.length,
    voices: props.voices,
    unisonWidth: props.width,
    detune: props.detune,
    width: bounds.width,
    height: bounds.height,
    voiceGesture: positions.length === 2,
  };
}
function down(event) {
  if (event.button !== 0 || pointers.size >= 2 || (gesture && event.pointerType !== "touch")) return;
  event.preventDefault();
  const element = event.currentTarget;
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  anchor(element.getBoundingClientRect());
  element.focus({ preventScroll: true });
  element.setPointerCapture(event.pointerId);
  dragging.value = true;
}
function move(event) {
  if (!pointers.has(event.pointerId)) return;
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  const positions = [...pointers.values()];
  const x = positions.reduce((sum, point) => sum + point.x, 0) / positions.length;
  const y = positions.reduce((sum, point) => sum + point.y, 0) / positions.length;
  if (gesture.voiceGesture) {
    update("voices", gesture.voices + ((gesture.y - y) / gesture.height) * (parameters.unisonVoices.max - parameters.unisonVoices.min));
    return;
  }
  update("width", gesture.unisonWidth + ((gesture.y - y) / gesture.height) * 100);
  update("detune", gesture.detune + ((x - gesture.x) / gesture.width) * 75);
}
function release(event) {
  if (!pointers.delete(event.pointerId)) return;
  if (pointers.size) anchor(event.currentTarget.getBoundingClientRect());
  else { gesture = null; dragging.value = false; }
  if (event.currentTarget.hasPointerCapture(event.pointerId))
    event.currentTarget.releasePointerCapture(event.pointerId);
}
function keydown(event) {
  const changes = {
    ArrowUp: ["width", props.width + 1],
    ArrowDown: ["width", props.width - 1],
    PageUp: ["voices", props.voices + 1],
    PageDown: ["voices", props.voices - 1],
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
    <svg ref="graph" viewBox="0 0 400 80" preserveAspectRatio="none" aria-hidden="true">
      <line
        v-for="(offset, index) in offsets"
        :key="index"
        class="unison-voice visual-line"
        :x1="200 + (offset / 75) * 178 + Math.sin(tilt(index)) * 36 * tiltScale"
        :x2="200 + (offset / 75) * 178 - Math.sin(tilt(index)) * 36 * tiltScale"
        :y1="40 - Math.cos(tilt(index)) * 36"
        :y2="40 + Math.cos(tilt(index)) * 36"
      />
    </svg>
    <span id="unison-gesture-help" class="sr-only"
      >Drag up or down for stereo width, right or left for detune. Arrow keys also
      adjust these values. Scroll or drag with two fingers up for more voices, down for fewer. Page Up and Page Down also adjust voices.</span
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
