<script setup>
import AppIcon from "./AppIcon.vue";
defineProps({ title: String, summary: String, expanded: Boolean });
defineEmits(["toggle"]);
</script>
<template>
  <section class="control-group" :class="{ collapsed: !expanded }">
    <button
      class="group-header"
      :aria-expanded="expanded"
      @click="$emit('toggle')"
    >
      <span>{{ title }}</span
      ><span class="group-summary">{{ summary }}</span
      ><AppIcon name="chevronDown" :size="15" :class="{ rotated: !expanded }" />
    </button>
    <div v-show="expanded" class="group-body"><slot /></div>
  </section>
</template>
