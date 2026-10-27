<script setup>
import { computed, onBeforeUnmount, ref } from "vue";
import { noteName } from "../settings.js";
const props = defineProps({ octave: Number, selected: Number, held: Array, previewPlaying: Boolean });
const emit = defineEmits(["note-on", "note-off"]);
const piano = ref(null);
const pointers = new Map();
const shortcuts = [
  "A",
  "W",
  "S",
  "E",
  "D",
  "F",
  "T",
  "G",
  "Y",
  "H",
  "U",
  "J",
  "K",
  "O",
  "L",
  "P",
  ";",
  "'",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
];
const keys = computed(() => {
  let white = 0;
  return Array.from({ length: 25 }, (_, index) => {
    const note = (props.octave + 1) * 12 + index;
    const black = [1, 3, 6, 8, 10].includes(note % 12);
    const position = black ? white - 0.31 : white++;
    return { note, black, position, shortcut: shortcuts[index] };
  });
});
function down(event, note) {
  if (event.button !== 0) return;
  event.preventDefault();
  pointers.set(event.pointerId, note);
  piano.value.setPointerCapture(event.pointerId);
  emit("note-on", `pointer-${event.pointerId}`, note, 1, event.timeStamp);
}
function move(event) {
  if (!pointers.has(event.pointerId)) return;
  if (event.pointerType === "mouse" && !(event.buttons & 1)) {
    release(event);
    return;
  }
  const key = document
    .elementFromPoint(event.clientX, event.clientY)
    ?.closest(".piano-key");
  const note =
    key && piano.value.contains(key) ? Number(key.dataset.note) : null;
  if (pointers.get(event.pointerId) === note) return;
  pointers.set(event.pointerId, note);
  if (note === null) emit("note-off", `pointer-${event.pointerId}`);
  else emit("note-on", `pointer-${event.pointerId}`, note, 1, event.timeStamp);
}
function release(event) {
  if (!pointers.has(event.pointerId)) return;
  pointers.delete(event.pointerId);
  emit("note-off", `pointer-${event.pointerId}`);
  if (piano.value.hasPointerCapture(event.pointerId))
    piano.value.releasePointerCapture(event.pointerId);
}
onBeforeUnmount(() => pointers.clear());
</script>
<template>
  <div
    ref="piano"
    class="piano"
    role="group"
    aria-label="Two-octave piano. Hold a key to play."
    @pointermove="move"
    @pointerup="release"
    @pointercancel="release"
    @lostpointercapture="release"
  >
    <button
      v-for="key in keys"
      :key="key.note"
      :data-note="key.note"
      class="piano-key"
      :class="{
        black: key.black,
        white: !key.black,
        active: held.includes(key.note),
        'chosen-note': selected === key.note,
        'preview-playing': previewPlaying && selected === key.note,
      }"
      :style="{
        left: `${(key.position / 15) * 100}%`,
        width: `${((key.black ? 0.62 : 1) / 15) * 100}%`,
      }"
      :aria-label="`Play ${noteName(key.note)}`"
      :aria-pressed="held.includes(key.note)"
      @pointerdown="down($event, key.note)"
      @keydown.enter.prevent="
        !$event.repeat &&
        emit('note-on', `focus-${key.note}`, key.note, 1, $event.timeStamp)
      "
      @keyup.enter.prevent="emit('note-off', `focus-${key.note}`)"
      @keydown.space.prevent="
        !$event.repeat &&
        emit('note-on', `focus-${key.note}`, key.note, 1, $event.timeStamp)
      "
      @keyup.space.prevent="emit('note-off', `focus-${key.note}`)"
      @blur="emit('note-off', `focus-${key.note}`)"
    >
      <span v-if="key.note % 12 === 0" class="key-octave" aria-hidden="true">{{ Math.floor(key.note / 12) - 1 }}</span>
      <span class="key-shortcut">{{ key.shortcut }}</span>
    </button>
  </div>
</template>
