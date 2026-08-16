<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useIsMobile } from './composables/useIsMobile.js';
import { getMode } from './api/index.js';

const route = useRoute();
const router = useRouter();
const { isMobile } = useIsMobile();
const drawer = ref(false);
const mode = ref('');

const menus = [
  { path: '/', title: '首页仪表盘', icon: 'HomeFilled' },
  { path: '/progress', title: '教学进度', icon: 'DataLine' },
  { path: '/schedule', title: '我的课程表', icon: 'Calendar' },
  { path: '/ai', title: 'AI 应用', icon: 'MagicStick' },
  { path: '/prep', title: '备课整理', icon: 'FolderOpened' },
  { path: '/bank', title: '本地题库', icon: 'Collection' },
  { path: '/settings', title: '设置', icon: 'Setting' }
];

// 底部标签栏（移动端）
const tabs = [
  { path: '/', title: '首页', icon: 'HomeFilled' },
  { path: '/progress', title: '进度', icon: 'DataLine' },
  { path: '/schedule', title: '课表', icon: 'Calendar' },
  { path: '/ai', title: 'AI', icon: 'MagicStick' }
];

const activeMenu = computed(() => route.path);
const activeTab = computed(() => tabs.some((t) => t.path === route.path) ? route.path : '');

const today = new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });

function onSelect() {
  drawer.value = false;
}

function onTab(path) {
  if (path === 'more') { drawer.value = true; return; }
  router.push(path);
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
        <span class="header-title">{{ route.meta.title }}</span>
        <el-tag v-if="mode === 'local' && !isMobile" size="small" type="warning" class="mode-tag">浏览器模式·数据存本机浏览器</el-tag>
        <el-tag v-else-if="mode === 'http' && !isMobile" size="small" type="success" class="mode-tag">服务模式</el-tag>
        <span v-if="mode" class="mode-dot" :class="mode" :title="mode === 'local' ? '浏览器模式·数据存本机浏览器' : '服务模式'"></span>
        <span class="header-date">{{ today }}</span>
      </el-header>
      <el-main class="main">
        <router-view />
      </el-main>
    </el-container>

    <!-- 移动端底部标签栏 -->
    <nav v-if="isMobile" class="bottom-nav">
      <div v-for="t in tabs" :key="t.path" class="tab" :class="{ active: activeTab === t.path }" @click="onTab(t.path)">
        <el-icon :size="20"><component :is="t.icon" /></el-icon>
        <span>{{ t.title }}</span>
      </div>
      <div class="tab" :class="{ active: drawer }" @click="onTab('more')">
        <el-icon :size="20"><Menu /></el-icon>
        <span>更多</span>
      </div>
    </nav>
  </el-container>

  <!-- 移动端抽屉导航（更多） -->
  <el-drawer v-model="drawer" direction="ltr" size="240px" :with-header="false" class="mobile-drawer">
    <div class="logo">🎓 高数教学辅助</div>
    <el-menu :default-active="activeMenu" router class="menu" @select="onSelect">
      <el-menu-item v-for="m in menus" :key="m.path" :index="m.path">
        <el-icon><component :is="m.icon" /></el-icon>
        <span>{{ m.title }}</span>
      </el-menu-item>
    </el-menu>
    <div class="drawer-foot muted">{{ mode === 'local' ? '浏览器模式 · 数据存在本浏览器' : '服务模式 · 数据存本机' }}</div>
  </el-drawer>
</template>

<style scoped>
.layout { height: 100%; }
.aside { background: #fff; border-right: 1px solid #e4e7ed; display: flex; flex-direction: column; }
.logo { font-size: 16px; font-weight: 700; padding: 18px 16px; color: #409eff; border-bottom: 1px solid #f0f0f0; }
.menu { border-right: none; flex: 1; }
.header {
  background: rgba(255, 255, 255, .92);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  border-bottom: 1px solid var(--ta-border);
  display: flex; align-items: center; gap: 8px;
  position: sticky; top: 0; z-index: 50;
}
.header-title { font-size: 16px; font-weight: 700; flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; letter-spacing: .2px; }
.header-date { color: #909399; font-size: 13px; white-space: nowrap; }
.mode-tag { margin-right: 8px; }
.mode-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.mode-dot.http { background: #67c23a; }
.mode-dot.local { background: #e6a23c; }
.main { padding: 16px; overflow: auto; }

/* 底部标签栏（玻璃拟态 + 活性药丸） */
.bottom-nav {
  position: fixed; left: 0; right: 0; bottom: 0; z-index: 100;
  background: rgba(255, 255, 255, .88);
  backdrop-filter: blur(18px) saturate(1.4);
  -webkit-backdrop-filter: blur(18px) saturate(1.4);
  border-top: 1px solid rgba(238, 240, 244, .9);
  display: flex;
  padding-bottom: env(safe-area-inset-bottom);
}
.tab {
  flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;
  padding: 8px 0 7px; color: var(--ta-text-3); font-size: 11px; gap: 2px;
  position: relative; transition: color .2s ease;
}
.tab .el-icon { transition: transform .2s ease; }
.tab.active { color: var(--ta-primary); font-weight: 600; }
.tab.active .el-icon { transform: translateY(-1px) scale(1.08); }
.tab.active::before {
  content: ''; position: absolute; top: 5px; left: 50%; transform: translateX(-50%);
  width: 44px; height: 26px; border-radius: 13px;
  background: var(--el-color-primary-light-9);
  z-index: -1;
}
.tab:active .el-icon { transform: scale(.9); }

.mobile-drawer :deep(.el-drawer__body) { padding: 0; }
.drawer-foot { padding: 16px; text-align: center; }
</style>
