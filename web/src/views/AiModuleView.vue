<script setup>
import { ref, watch, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import IntroGenView from './IntroGenView.vue';
import ExerciseGenView from './ExerciseGenView.vue';
import SizhengGenView from './SizhengGenView.vue';

const route = useRoute();
const router = useRouter();
const activeTab = ref('intro');

const tabs = [
  { key: 'intro', label: '📖 课程导入', icon: 'MagicStick' },
  { key: 'exercises', label: '📝 习题生成', icon: 'EditPen' },
  { key: 'sizheng', label: '🏛️ 课程思政', icon: 'Collection' }
];

function syncFromQuery() {
  const t = String(route.query.tab || 'intro');
  if (tabs.some((x) => x.key === t)) activeTab.value = t;
}

function onTabChange(key) {
  router.replace({ path: '/ai', query: key === 'intro' ? {} : { tab: key } });
}

onMounted(syncFromQuery);
watch(() => route.query.tab, syncFromQuery);
</script>

<template>
  <div class="ai-module">
    <div class="module-head">
      <el-tabs v-model="activeTab" class="ai-tabs" @tab-change="onTabChange">
        <el-tab-pane v-for="t in tabs" :key="t.key" :name="t.key" :label="t.label" />
      </el-tabs>
    </div>

    <div v-show="activeTab === 'intro'"><IntroGenView /></div>
    <div v-show="activeTab === 'exercises'"><ExerciseGenView /></div>
    <div v-show="activeTab === 'sizheng'"><SizhengGenView /></div>
  </div>
</template>

<style scoped>
.module-head {
  position: sticky; top: 0; z-index: 20;
  background: var(--ta-bg);
  padding: 2px 0 0;
}
.ai-tabs :deep(.el-tabs__header) { margin: 0 0 12px; }
.ai-tabs :deep(.el-tabs__nav-wrap::after) { height: 1px; background-color: var(--ta-border); }
.ai-tabs :deep(.el-tabs__item) { font-size: 14.5px; font-weight: 600; }
.ai-tabs :deep(.el-tabs__item.is-active) { color: var(--ta-primary); }
.ai-tabs :deep(.el-tabs__active-bar) { background-color: var(--ta-primary); height: 3px; border-radius: 3px; }
</style>
