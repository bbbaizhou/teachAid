import { createRouter, createWebHashHistory } from 'vue-router';

const routes = [
  { path: '/', name: 'home', component: () => import('../views/HomeView.vue'), meta: { title: '首页仪表盘' } },
  { path: '/progress', name: 'progress', component: () => import('../views/ProgressView.vue'), meta: { title: '教学进度' } },
  { path: '/schedule', name: 'schedule', component: () => import('../views/ScheduleView.vue'), meta: { title: '我的课程表' } },
  { path: '/intro', name: 'intro', component: () => import('../views/IntroGenView.vue'), meta: { title: 'AI 课程导入' } },
  { path: '/exercises', name: 'exercises', component: () => import('../views/ExerciseGenView.vue'), meta: { title: '习题生成' } },
  { path: '/prep', name: 'prep', component: () => import('../views/PrepView.vue'), meta: { title: '备课整理' } },
  { path: '/bank', name: 'bank', component: () => import('../views/BankView.vue'), meta: { title: '本地题库' } },
  { path: '/settings', name: 'settings', component: () => import('../views/SettingsView.vue'), meta: { title: '设置' } }
];

export default createRouter({
  history: createWebHashHistory(),
  routes
});
