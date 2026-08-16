<script setup>
import { ref } from 'vue';
import { useRoute } from 'vue-router';

const route = useRoute();
const activeMenu = ref(route.path);
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
</script>

<template>
  <el-container class="layout">
    <el-aside width="200px" class="aside">
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
        <span class="header-date">{{ new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }) }}</span>
      </el-header>
      <el-main class="main">
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<style scoped>
.layout { height: 100%; }
.aside { background: #fff; border-right: 1px solid #e4e7ed; display: flex; flex-direction: column; }
.logo { font-size: 16px; font-weight: 700; padding: 18px 16px; color: #409eff; border-bottom: 1px solid #f0f0f0; }
.menu { border-right: none; flex: 1; }
.header {
  background: #fff; border-bottom: 1px solid #e4e7ed;
  display: flex; align-items: center; justify-content: space-between;
}
.header-title { font-size: 16px; font-weight: 600; }
.header-date { color: #909399; font-size: 13px; }
.main { padding: 16px; overflow: auto; }
</style>
