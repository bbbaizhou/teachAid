<script setup>
import { computed } from 'vue';
import { renderMath } from '../utils/math.js';

const props = defineProps({
  text: { type: String, default: '' },
  clamp: { type: Number, default: 0 } // >0 时截断行数
});
const html = computed(() => renderMath(props.text));
</script>

<template>
  <span class="math-text" :class="{ clamp: clamp > 0 }" :style="clamp > 0 ? { '-webkit-line-clamp': clamp } : {}"
        v-html="html"></span>
</template>

<style scoped>
.math-text.clamp {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.math-text :deep(.katex-display) { margin: 0.3em 0; }
</style>
