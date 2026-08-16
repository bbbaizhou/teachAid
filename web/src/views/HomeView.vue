<script setup>
import { ref, onMounted, computed } from 'vue';
import { useRouter } from 'vue-router';
import { getCourses, getTodaySchedule, getSectionTimes, getAiStatus, getSettings } from '../api/index.js';

const router = useRouter();
const courses = ref([]);
const today = ref({ entries: [], today: '' });
const sectionTimes = ref([]);
const aiOk = ref(null);
const settings = ref({ ai: {}, majors: [] });
const loading = ref(true);

const totalClasses = computed(() => courses.value.reduce((s, c) => s + (c.class_count || 0), 0));

function timeOfSection(section) {
  const t = sectionTimes.value.find((x) => String(x[0]) === String(section));
  return t ? t[1] : '';
}

onMounted(async () => {
  try {
    const [c, t, st, status, set] = await Promise.all([
      getCourses(), getTodaySchedule(), getSectionTimes(), getAiStatus(), getSettings()
    ]);
    courses.value = c;
    today.value = t;
    sectionTimes.value = st;
    aiOk.value = status.hasKey;
    settings.value = set;
  } catch (e) {
    console.error(e);
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <div v-loading="loading">
    <!-- 顶部快捷入口 -->
    <el-row :gutter="14" class="quick-row">
      <el-col :xs="12" :sm="8" :md="4" v-for="m in [
        { path: '/progress', title: '登记教学进度', icon: 'DataLine', color: '#3b82f6' },
        { path: '/schedule', title: '查看我的课表', icon: 'Calendar', color: '#22c55e' },
        { path: '/ai?tab=intro', title: '生成课程导入', icon: 'MagicStick', color: '#f59e0b' },
        { path: '/ai?tab=exercises', title: '生成练习题', icon: 'EditPen', color: '#ef4444' },
        { path: '/ai?tab=sizheng', title: '课程思政设计', icon: 'Collection', color: '#8b5cf6' },
        { path: '/prep', title: '整理备课资料', icon: 'FolderOpened', color: '#64748b' }
      ]" :key="m.path">
        <div class="quick-card pointer" @click="router.push(m.path)">
          <span class="quick-icon" :style="{ background: m.color + '1a', color: m.color }">
            <el-icon :size="22"><component :is="m.icon" /></el-icon>
          </span>
          <span class="quick-title">{{ m.title }}</span>
        </div>
      </el-col>
    </el-row>

    <!-- 统计卡片 -->
    <el-row :gutter="10">
      <el-col :xs="12" :sm="12" :md="6">
        <el-card shadow="hover" body-class="stat-card"><div class="stat">
          <div class="num">{{ courses.length }}</div>
          <div class="label">课程数</div>
        </div></el-card>
      </el-col>
      <el-col :xs="12" :sm="12" :md="6">
        <el-card shadow="hover" body-class="stat-card"><div class="stat">
          <div class="num">{{ totalClasses }}</div>
          <div class="label">授课班级</div>
        </div></el-card>
      </el-col>
      <el-col :xs="12" :sm="12" :md="6">
        <el-card shadow="hover" body-class="stat-card"><div class="stat">
          <div class="num">{{ today.entries.length }}</div>
          <div class="label">今日课程</div>
        </div></el-card>
      </el-col>
      <el-col :xs="12" :sm="12" :md="6">
        <el-card shadow="hover" body-class="stat-card">
          <div class="stat">
            <div class="num" :class="{ warn: !aiOk }">{{ aiOk === null ? '—' : (aiOk ? '已就绪' : '未配置') }}</div>
            <div class="label">AI 能力 <el-link type="primary" :underline="false" @click="router.push('/settings')">去配置</el-link></div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="14" style="margin-top: 14px;">
      <!-- 今日课程 -->
      <el-col :xs="24" :md="14">
        <el-card shadow="never">
          <template #header><b>📅 今日课程（{{ today.today }}）</b></template>
          <el-empty v-if="!today.entries.length" description="今天没有课，好好休息～" :image-size="60" />
          <div v-for="e in today.entries" :key="e.id" class="today-item">
            <el-tag :type="e.status === 'cancelled' ? 'danger' : e.status === 'adjusted' ? 'warning' : 'primary'" size="small">
              {{ e.status === 'cancelled' ? '停课' : e.status === 'adjusted' ? '调课' : '正常' }}
            </el-tag>
            <span class="time">{{ e.start_section }}-{{ e.end_section }}节 ({{ timeOfSection(e.start_section) }})</span>
            <b>{{ e.class_name }}</b>
            <span class="muted">{{ e.course_name }} · {{ e.location || '地点未填' }} · 第{{ e.weeks || '?' }}周</span>
            <span v-if="e.note" class="note">{{ e.note }}</span>
          </div>
        </el-card>
      </el-col>
      <!-- 我的课程 -->
      <el-col :xs="24" :md="10">
        <el-card shadow="never">
          <template #header><b>📚 我的课程</b></template>
          <el-empty v-if="!courses.length" description="还没有课程，去「教学进度」页新建吧" :image-size="60" />
          <div v-for="c in courses" :key="c.id" class="course-item">
            <b>{{ c.name }}</b>
            <span class="muted">{{ c.semester }} · {{ c.class_count }} 个班级 · {{ c.chapter_count }} 个章节</span>
            <el-button size="small" text type="primary" @click="router.push('/progress')">查看进度</el-button>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-alert style="margin-top: 14px;" type="info" :closable="false"
      title="小贴士：数据全部保存在本机，无需联网即可使用全部非 AI 功能；AI 生成需要先在「设置」中填写 DeepSeek API Key。" />
  </div>
</template>

<style scoped>
.quick-row { margin-bottom: 6px; }
.quick-card {
  background: var(--ta-surface); border-radius: 18px; padding: 18px 8px 14px;
  display: flex; flex-direction: column; align-items: center; gap: 10px;
  box-shadow: var(--ta-sh-1); border: 1px solid var(--ta-border);
  transition: transform .18s ease, box-shadow .25s ease;
}
.quick-card:hover { transform: translateY(-3px); box-shadow: var(--ta-sh-2); }
.quick-icon {
  width: 46px; height: 46px; border-radius: 15px;
  display: flex; align-items: center; justify-content: center;
  box-shadow: inset 0 0 0 1px rgba(255,255,255,.4);
}
.quick-title { font-size: 12.5px; color: var(--ta-text); text-align: center; line-height: 1.35; font-weight: 500; }
.stat-card :deep(.el-card__body) { padding: 16px 10px; }
.stat { text-align: center; }
.stat .num { font-size: 25px; font-weight: 700; color: var(--ta-text); letter-spacing: .3px; }
.stat .num.warn { color: var(--ta-warning); font-size: 15px; }
.stat .label { color: var(--ta-text-3); margin-top: 5px; font-size: 12.5px; }
.today-item { display: flex; align-items: center; gap: 10px; padding: 12px 4px; border-bottom: 1px dashed var(--ta-border); flex-wrap: wrap; }
.today-item:last-child { border-bottom: none; }
.today-item .time { color: var(--ta-text-2); font-size: 13px; white-space: nowrap; font-weight: 500; }
.today-item .note { color: var(--ta-warning); font-size: 12px; }
.course-item { display: flex; align-items: center; gap: 10px; padding: 12px 4px; border-bottom: 1px dashed var(--ta-border); }
.course-item:last-child { border-bottom: none; }
.course-item b { min-width: 150px; color: var(--ta-text); }

@media (max-width: 767px) {
  .quick-card { padding: 16px 6px 12px; border-radius: 20px; }
  .today-item { gap: 7px; padding: 13px 2px; }
  .course-item { padding: 13px 2px; }
}
</style>
