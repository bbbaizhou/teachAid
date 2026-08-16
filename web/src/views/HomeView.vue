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
      <el-col :span="4" v-for="m in [
        { path: '/progress', title: '登记教学进度', icon: 'DataLine', color: '#409eff' },
        { path: '/schedule', title: '查看我的课表', icon: 'Calendar', color: '#67c23a' },
        { path: '/intro', title: '生成课程导入', icon: 'MagicStick', color: '#e6a23c' },
        { path: '/exercises', title: '生成练习题', icon: 'EditPen', color: '#f56c6c' },
        { path: '/prep', title: '整理备课资料', icon: 'FolderOpened', color: '#909399' }
      ]" :key="m.path">
        <div class="quick-card pointer" @click="router.push(m.path)">
          <el-icon :size="26" :color="m.color"><component :is="m.icon" /></el-icon>
          <span>{{ m.title }}</span>
        </div>
      </el-col>
    </el-row>

    <!-- 统计卡片 -->
    <el-row :gutter="14">
      <el-col :span="6">
        <el-card shadow="hover"><div class="stat">
          <div class="num">{{ courses.length }}</div>
          <div class="label">课程数</div>
        </div></el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="hover"><div class="stat">
          <div class="num">{{ totalClasses }}</div>
          <div class="label">授课班级</div>
        </div></el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="hover"><div class="stat">
          <div class="num">{{ today.entries.length }}</div>
          <div class="label">今日课程</div>
        </div></el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="hover">
          <div class="stat">
            <div class="num" :class="{ warn: !aiOk }">{{ aiOk === null ? '—' : (aiOk ? '已就绪' : '未配置') }}</div>
            <div class="label">AI 能力 <el-link type="primary" :underline="false" @click="router.push('/settings')">去配置</el-link></div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="14" style="margin-top: 14px;">
      <!-- 今日课程 -->
      <el-col :span="14">
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
      <el-col :span="10">
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
.quick-row { margin-bottom: 14px; }
.quick-card {
  background: #fff; border-radius: 8px; padding: 18px 10px;
  display: flex; flex-direction: column; align-items: center; gap: 8px;
  box-shadow: 0 1px 4px rgba(0,0,0,.06); transition: transform .15s;
}
.quick-card:hover { transform: translateY(-3px); }
.stat { text-align: center; padding: 6px 0; }
.stat .num { font-size: 26px; font-weight: 700; color: #303133; }
.stat .num.warn { color: #e6a23c; font-size: 16px; }
.stat .label { color: #909399; margin-top: 4px; font-size: 13px; }
.today-item { display: flex; align-items: center; gap: 10px; padding: 9px 0; border-bottom: 1px dashed #f0f0f0; }
.today-item .time { color: #606266; font-size: 13px; white-space: nowrap; }
.today-item .note { color: #e6a23c; font-size: 12px; }
.course-item { display: flex; align-items: center; gap: 10px; padding: 9px 0; border-bottom: 1px dashed #f0f0f0; }
.course-item b { min-width: 160px; }
</style>
