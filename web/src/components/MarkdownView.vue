<script setup>
import { computed } from 'vue';
import { renderMarkdown } from '../utils/math.js';

const props = defineProps({
  content: { type: String, default: '' }
});
const html = computed(() => renderMarkdown(props.content));
</script>

<template>
  <div class="markdown-view" v-html="html"></div>
</template>

<style scoped>
.markdown-view {
  line-height: 1.7;
  word-break: break-word;
}
.markdown-view :deep(h1), .markdown-view :deep(h2), .markdown-view :deep(h3) {
  margin: 0.6em 0 0.4em;
}
.markdown-view :deep(p) { margin: 0.4em 0; }
.markdown-view :deep(code) {
  background: #f4f4f5;
  padding: 1px 5px;
  border-radius: 3px;
  font-family: Consolas, monospace;
}
.markdown-view :deep(pre) {
  background: #f6f8fa;
  padding: 10px;
  border-radius: 6px;
  overflow: auto;
}
.markdown-view :deep(table) { border-collapse: collapse; }
.markdown-view :deep(td), .markdown-view :deep(th) {
  border: 1px solid #dcdfe6;
  padding: 4px 10px;
}
</style>
