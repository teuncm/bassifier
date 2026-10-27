<script setup>
defineProps({ name: String, size: { type: [Number, String], default: 20 } });
const paths = {
  play: "M7 4.5 17 10 7 15.5Z",
  stop: "M5 5h10v10H5Z",
  repeat:
    "m14 2 3 3-3 3M3 10V7a2 2 0 0 1 2-2h12M6 18l-3-3 3-3m11-2v3a2 2 0 0 1-2 2H3",
  download: "M10 2v11m-4-4 4 4 4-4M3 13v4a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-4",
  chevron: "m7 4 6 6-6 6",
  chevronDown: "m4 7 6 6 6-6",
  reset: "M3 8a7 7 0 1 1 1 7M3 3v5h5",
  dice: "M5 2h10a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3V5a3 3 0 0 1 3-3ZM6 6h.01M14 6h.01M10 10h.01M6 14h.01M14 14h.01",
  lock: "M6 9V6a4 4 0 0 1 8 0v3M5 9h10v9H5Zm5 4v2",
  unlock: "M6 9V6a4 4 0 0 1 7-2M5 9h10v9H5Zm5 4v2",
  sun: "M10 1v2m0 14v2M1 10h2m14 0h2M3.6 3.6 5 5m10 10 1.4 1.4M3.6 16.4 5 15M15 5l1.4-1.4M14 10a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z",
  moon: "M17.5 12.3A8 8 0 0 1 7.7 2.5 8 8 0 1 0 17.5 12.3Z",
  share: "M10 13V2m-4 4 4-4 4 4M5 9H3v9h14V9h-2",
  check: "m4 10 4 4 8-8",
  keyboard: "M2 4h16v12H2Zm4 0v7m4-7v7m4-7v7M6 11H3m7 0H8m6 0h-2",
  volume: "M3 8h3l4-4v12l-4-4H3Zm10-1a5 5 0 0 1 0 6m2-8a8 8 0 0 1 0 10",
  fish: "M15 10c-2-6-9-6-13 0 4 6 11 6 13 0Zm0 0 4-4v8Zm-9-2h.01M6 12c1 .7 2 .7 3 0M7 5l3-3 2 4",
  collapse: "m4 13 6-6 6 6",
  expand: "m4 7 6 6 6-6",
  close: "m5 5 10 10M5 15 15 5",
};
</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 20 20"
    fill="none"
    stroke="currentColor"
    stroke-width="1.5"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path
      :d="paths[name] || paths.fish"
      :fill="['play', 'stop'].includes(name) ? 'currentColor' : 'none'"
    />
  </svg>
</template>
