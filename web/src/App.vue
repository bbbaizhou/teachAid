<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { useIsMobile } from './composables/useIsMobile.js';
import { getMode } from './api/index.js';

const route = useRoute();
const { isMobile } = useIsMobile();
const drawer = ref(false);
const mode = ref('');

const menus = [
  { path: '/', title: '首页仪表盘', icon: 'HomeFilled' },
  { path: '/progress', title: '教学进度', icon: 'DataLine' },
  { path: '/schedule', title: '我的课程表', icon: 'Calendar' },
  { path: '/intro', title: 'AI 课程导入', icon: 'MagicStick' },
  { path: '/exercises', title: '习题生成', icon: 'EditPen' },
  { path: '/prep', title: '备课整理', icon: 'FolderOpened' },
  { path: '/bank', title: '本地题库', icon: 'Collection' },
  { path: '/settings', title: '设置', icon: 'Setting' }
];

const activeMenu = computed(() => route.path);
const today = new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });

function onSelect() {
  drawer.value = false;
}

onMounted(() => {
  mode.value = getMode();
});
</script>

<template>
  <el-container class="layout">
    <!-- 桌面端侧边栏 -->
    <el-aside v-if="!isMobile" width="200px" class="aside">
      <div class="logo">🎓 高数教学辅助</div>
      <el-menu :default-active="activeMenu" router class="menu">
        <el-menu-item v-for="m in menus" :key="m.path" :index="m.path">
          <el-icon><component :is="m.icon" /></el-icon>
          <span>{{ m.title }}</span>
        </el-menu-item>
      </el-menu>
    </el-aside>

    <el-container>
      <el-header class="header">
        <el-button v-if="isMobile" class="hamburger" text circle @click="drawer = true" aria-label="打开菜单">
          <el-icon :size="20"><Menu /></el-icon>
        </el-button>
        <span class="header-title">{{ route.meta.title }}</span>
        <el-tag v-if="mode === 'local'" size="small" type="warning" class="mode-tag">浏览器模式·数据存本机浏览器</el-tag>
        <el-tag v-else-if="mode === 'http'" size="small" type="success" class="mode-tag">服务模式</el-tag>
        <span class="header-date">{{ today }}</span>
      </el-header>
      <el-main class="main">
        <router-view />
      </el-main>
    </el-container>
  </el-container>

  <!-- 移动端抽屉导航 -->
  <el-drawer v-model="drawer" direction="ltr" size="240px" :with-header="false" class="mobile-drawer">
    <div class="logo">🎓 高数教学辅助</div>
    <el-menu :default-active="activeMenu" router class="menu" @select="onSelect">
      <el-menu-item v-for="m in menus" :key="m.path" :index="m.path">
        <el-icon><component :is="m.icon" /></el-icon>
        <span>{{ m.title }}</span>
      </el-menu-item>
    </el-menu>
    <div class="drawer-foot muted">数据保存在本机 · 单人使用</div>
  </el-drawer>
</template>

<style scoped>
.layout { height: 100%; }
.aside { background: #fff; border-right: 1px solid #e4e7ed; display: flex; flex-direction: column; }
.logo { font-size: 16px; font-weight: 700; padding: 18px 16px; color: #409eff; border-bottom: 1px solid #f0f0f0; }
.menu { border-right: none; flex: 1; }
.header {
  background: #fff; border-bottom: 1px solid #e4e7ed;
  display: flex; align-items: center; gap: 6px;
}
.header-title { font-size: 16px; font-weight: 600; flex: 1; }
.header-date { color: #909399; font-size: 13px; white-space: nowrap; }
.hamburger { margin-left: -8px; }
.mode-tag { margin-right: 8px; }
.main { padding: 16px; overflow: auto; }
.mobile-drawer :deep(.el-drawer__body) { padding: 0; }
.drawer-foot { padding: 16px; text-align: center; }
</style>
