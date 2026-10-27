<script setup>
import { computed, ref } from "vue";
import AppIcon from "./AppIcon.vue";
const props = defineProps({
  parameter: Object,
  modelValue: Number,
  locked: Boolean,
  name: String,
  prefix: { type: String, default: "" },
});
const interacting = ref(false);
const emit = defineEmits(["update:modelValue", "toggle-lock"]);
const position = computed(() =>
  props.parameter.log
    ? (Math.log(props.modelValue / props.parameter.min) /
        Math.log(props.parameter.max / props.parameter.min)) *
      1000
    : props.modelValue,
);
const percent = computed(() =>
  props.parameter.log
    ? position.value / 10
    : ((props.modelValue - props.parameter.min) /
        (props.parameter.max - props.parameter.min)) *
      100,
);
const numberFormat = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });
const readout = computed(
  () =>
    `${props.prefix}${numberFormat.format(props.modelValue)} ${props.parameter.unit || ""}`,
);
function update(event) {
  const value = Number(event.target.value),
    p = props.parameter;
  const next = p.log
    ? Math.round((p.min * (p.max / p.min) ** (value / 1000)) / p.step) * p.step
    : value;
  emit(
    "update:modelValue",
    Number(Math.max(p.min, Math.min(p.max, next)).toFixed(4)),
  );
}
</script>

<template>
  <div class="range-control" :class="{ locked, interacting }">
    <div class="control-label">
      <label :for="`range-${name}`">{{ parameter.label }}</label>
      <div class="control-value">
        <output :for="`range-${name}`">{{ readout }}</output
        ><button
          class="lock-button"
          :class="{ selected: locked }"
          :aria-label="`${locked ? 'Unlock' : 'Lock'} ${parameter.label}`"
          :aria-pressed="locked"
          :title="`${locked ? 'Unlock' : 'Lock'} ${parameter.label} for randomization`"
          @click="emit('toggle-lock')"
        >
          <AppIcon :name="locked ? 'lock' : 'unlock'" :size="13" />
        </button>
      </div>
    </div>
    <input
      :id="`range-${name}`"
      type="range"
      :min="parameter.log ? 0 : parameter.min"
      :max="parameter.log ? 1000 : parameter.max"
      :step="parameter.log ? 1 : parameter.step"
      :value="position"
      :aria-valuetext="readout"
      :style="{ '--fill': `${percent}%` }"
      :class="{ interacting }"
      @pointerdown="interacting = true; $event.target.setPointerCapture($event.pointerId)"
      @pointerup="interacting = false"
      @pointercancel="interacting = false"
      @lostpointercapture="interacting = false"
      @blur="interacting = false"
      @input="update"
    />
  </div>
</template>
