<script setup>
defineProps({
  body: String, dark: String, light: String,
  eyes: Object, mouth: Object, dorsal: String, tail: Object,
  bodyLength: Number, fins: Object, speckles: Array,
  dragging: Boolean, gaze: Object, playing: Boolean, beatFrequency: Number,
  returning: Boolean, returnStroke: Object,
});
</script>

<template>
  <g class="fish-body-parts">
    <g class="fish-trunk" :transform="`translate(${83 * (1 - bodyLength)} 0) scale(${bodyLength} 1)`">
    <g class="fish-tail" :style="{
      transformOrigin: '218px 140px',
      transform: returning ? `rotate(${returnStroke.tail}deg)` : undefined,
    }">
      <path class="fish-tail-shape" :d="tail.path" :fill="body" />
      <path class="fish-tail-rays" :d="tail.ribs" :stroke="light" stroke-width="1.5" fill="none" opacity=".6" />
    </g>

    <rect class="fish-tail-root" x="196" y="132" width="30" height="16" :fill="dark" />
    <path class="fish-hair" :d="dorsal" :fill="dark" />
    <ellipse class="fish-body" cx="137" cy="145" rx="82" ry="43" :fill="body" />
    <ellipse class="fish-belly" cx="131" cy="163" rx="61" ry="18" :fill="light" />
    <g class="fish-speckles" :fill="dark" opacity=".35">
      <circle v-for="(speckle, index) in speckles" :key="index"
        :cx="speckle.x" :cy="speckle.y" :r="speckle.r" />
    </g>
    <line class="fish-gill" x1="115" y1="136" x2="115" y2="166"
      :stroke="dark" stroke-width="2" stroke-linecap="round" opacity=".5" />

    <g class="fish-fin" :style="{
      transformOrigin: '130px 145px',
      transform: returning ? `rotate(${returnStroke.fin}deg)` : undefined,
    }">
      <g class="fish-fin-fan">
        <path :d="fins.side" :fill="dark" />
        <path :d="fins.rays"
          :stroke="light" stroke-width="1.3" fill="none" stroke-linecap="round" opacity=".6" />
      </g>
    </g>

    </g>

    <g class="fish-face" :transform="dragging
      ? `translate(${gaze.x * 0.7} ${gaze.y * 0.7}) rotate(${gaze.y * 1.4} 88 128)`
      : undefined">
      <path class="fish-muzzle" :d="mouth.body" :fill="light" />
      <g class="fish-eye">
        <g v-show="playing" class="fish-eye-open">
        <ellipse :cx="eyes.x" :cy="eyes.y" :rx="eyes.radius" :ry="eyes.radius * 0.95" :fill="light" :stroke="dark" stroke-width="2" />
        <circle class="fish-pupil" :cx="eyes.x + gaze.x * 0.55"
          :cy="eyes.y + gaze.y * 0.55" :r="eyes.pupil * 1.2" :fill="dark" />
        </g>
        <path v-show="!playing" class="fish-eyelid"
          :d="`M${eyes.x - eyes.radius} ${eyes.y} Q${eyes.x} ${eyes.y + eyes.radius * 0.7} ${eyes.x + eyes.radius} ${eyes.y}`"
          fill="none" :stroke="dark" stroke-width="2.5" stroke-linecap="round" />
      </g>
      <path class="fish-mouth" :class="{ 'mouth-beating': playing && beatFrequency > 0 }"
        :d="playing ? mouth.open : mouth.closed" :fill="playing ? dark : 'none'"
        :stroke="dark" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
    </g>
  </g>
</template>
