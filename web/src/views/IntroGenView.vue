<script setup>
import { ref, computed, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import {
  getCourses, getCourseDetail, getSettings, generateIntro, getAiRecords, getAiRecord, saveRecordToPrep
} from '../api/index.js';
import MathText from '../components/MathText.vue';

const courses = ref([]);
const courseId = ref(null);
const chapters = ref([]);
const majors = ref([]);
const chapterId = ref(null);
const customTitle = ref('');
const major = ref('');
const style = ref('major');
const extra = ref('');
const generating = ref(false);
const result = ref(null); // {id, content}
const history = ref([]);
const loadHistoryId = ref(0);

const styles = [
  { key: 'life', label: '生活案例导入', icon: '🍎', desc: '从日常生活现象切入，自然引出数学概念' },
  { key: 'major', label: '专业应用导入', icon: '⚙️', desc: '结合学生专业场景，说明本章知识的用武之地' },
  { key: 'question', label: '问题悬念导入', icon: '❓', desc: '用一个有悬念的问题开场，制造认知冲突' }
];

async function loadCourses() {
  courses.value = await getCourses();
  const set = await getSettings();
  majors.value = set.majors || [];
  if (courses.value.length) {
    courseId.value = courses.value[0].id;
    await loadChapters();
  }
  loadHistory();
}

async function loadChapters() {
  if (!courseId.value) { chapters.value = []; return; }
  const d = await getCourseDetail(courseId.value);
  chapters.value = d.chapters;
  if (chapters.value.length && !chapters.value.some((c) => c.id === chapterId.value)) {
    chapterId.value = chapters.value[0].id;
  }
}

async function loadHistory() {
  loadHistoryId.value++;
  history.value = (await getAiRecords('intro')).slice(0, 10);
}

async function generate() {
  if (!chapterId.value && !customTitle.value) return ElMessage.warning('请选择章节或填写章节名称');
  generating.value = true;
  result.value = null;
  try {
    const r = await generateIntro({
      chapter_id: chapterId.value || null,
      title: chapterId.value ? undefined : customTitle.value,
      major: major.value,
      style: style.value,
      extra: extra.value
    });
    result.value = r;
    ElMessage.success('生成完成');
    loadHistory();
  } catch (e) {
    ElMessage.error(e.message);
  } finally {
    generating.value = false;
  }
}

async function viewRecord(id) {
  const r = await getAiRecord(id);
  result.value = { id: r.id, content: r.content };
  if (r.chapter_id) { chapterId.value = r.chapter_id; }
  if (r.major) major.value = r.major;
  if (r.style) style.value = r.style;
}

async function copyText() {
  if (!result.value) return;
  try {
    await navigator.clipboard.writeText(result.value.content);
    ElMessage.success('已复制到剪贴板');
  } catch {
    ElMessage.warning('复制失败，请手动选择文本复制');
  }
}

// 保存到备课
const saveDialog = ref(false);
const saveForm = ref({ chapter_id: null, title: '', tags: '导入文案' });

function openSave() {
  saveForm.value = {
    chapter_id: chapterId.value,
    title: `课堂导入：${chapterId.value ? chapters.value.find((c) => c.id === chapterId.value)?.title : customTitle.value || '自定义章节'}`,
    tags: '导入文案'
  };
  saveDialog.value = true;
}

async function doSave() {
  await saveRecordToPrep(result.value.id, saveForm.value);
  ElMessage.success('已保存到备课资料');
  saveDialog.value = false;
}

const currentChapterTitle = computed(() => {
  if (chapterId.value) return chapters.value.find((c) => c.id === chapterId.value)?.title;
  return customTitle.value || '';
});

onMounted(loadCourses);
</script>

<template>
  <el-row :gutter="14">
    <el-col :span="9">
      <!-- 生成配置 -->
      <div class="page-card">
        <h3 class="page-title">⚙️ 生成配置</h3>
        <el-form label-width="80px">
          <el-form-item label="课程">
            <el-select v-model="courseId" style="width: 100%" filterable @change="loadChapters">
              <el-option v-for="c in courses" :key="c.id" :value="c.id" :label="c.name" />
            </el-select>
          </el-form-item>
          <el-form-item label="章节">
            <el-select v-model="chapterId" style="width: 100%" filterable clearable placeholder="选择章节">
              <el-option v-for="ch in chapters" :key="ch.id" :value="ch.id" :label="ch.title" />
            </el-select>
          </el-form-item>
          <el-form-item v-if="!chapterId" label="或自定义">
            <el-input v-model="customTitle" placeholder="如：第十三章 常微分方程的应用" />
          </el-form-item>
          <el-form-item label="授课专业">
            <el-select v-model="major" style="width: 100%" filterable allow-create default-first-option placeholder="选择或输入专业">
              <el-option v-for="m in majors" :key="m" :value="m" :label="m" />
            </el-select>
          </el-form-item>
          <el-form-item label="导入风格">
            <div class="style-list">
              <div v-for="s in styles" :key="s.key" class="style-item pointer" :class="{ active: style === s.key }" @click="style = s.key">
                <b>{{ s.icon }} {{ s.label }}</b>
                <span class="muted">{{ s.desc }}</span>
              </div>
            </div>
          </el-form-item>
          <el-form-item label="补充要求">
            <el-input v-model="extra" type="textarea" :rows="2" placeholder="可选，如：多结合 Python 数据处理案例；控制在 200 字以内" />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" size="large" style="width: 100%" :loading="generating" @click="generate">
              🪄 AI 生成课程导入文案
            </el-button>
          </el-form-item>
        </el-form>
      </div>
    </el-col>

    <el-col :span="15">
      <!-- 生成结果 -->
      <div class="page-card" style="margin-bottom: 14px;">
        <div class="toolbar">
          <h3 class="page-title" style="margin:0">📝 生成结果</h3>
          <div class="spacer"></div>
          <el-button v-if="result" @click="copyText">复制全文</el-button>
          <el-button v-if="result" type="primary" @click="openSave">存入备课资料</el-button>
          <el-button v-if="result" @click="generate">🔄 重新生成</el-button>
        </div>
        <el-empty v-if="!result && !generating" description="配置左侧参数后点击生成，AI 将结合学生专业生成课堂导入文案" />
        <div v-loading="generating" class="result-box">
          <div v-if="result" class="result-content">
            <div class="result-meta muted">
              <template v-if="currentChapterTitle">章节：{{ currentChapterTitle }} · </template>
              专业：{{ major || '未指定' }} · 风格：{{ styles.find((s) => s.key === style)?.label }}
            </div>
            <MathText :text="result.content" />
          </div>
        </div>
      </div>

      <!-- 历史记录 -->
      <div class="page-card">
        <h3 class="page-title">🕘 最近生成记录</h3>
        <el-table :data="history" size="small" @row-click="viewRecord" class="pointer">
          <el-table-column label="章节" min-width="160">
            <template #default="{ row }">{{ row.chapter_title || '自定义章节' }}</template>
          </el-table-column>
          <el-table-column prop="major" label="专业" width="140" />
          <el-table-column label="风格" width="130">
            <template #default="{ row }">{{ styles.find((s) => s.key === row.style)?.label || row.style }}</template>
          </el-table-column>
          <el-table-column prop="created_at" label="时间" width="150" />
          <el-table-column label="操作" width="80">
            <template #default="{ row }"><el-link type="primary" @click.stop="viewRecord(row.id)">查看</el-link></template>
          </el-table-column>
        </el-table>
      </div>
    </el-col>
  </el-row>

  <!-- 保存到备课 -->
  <el-dialog v-model="saveDialog" title="存入备课资料" width="480px">
    <el-form label-width="90px">
      <el-form-item label="所属章节">
        <el-select v-model="saveForm.chapter_id" style="width: 100%" filterable clearable>
          <el-option v-for="ch in chapters" :key="ch.id" :value="ch.id" :label="ch.title" />
        </el-select>
      </el-form-item>
      <el-form-item label="标题"><el-input v-model="saveForm.title" /></el-form-item>
      <el-form-item label="标签"><el-input v-model="saveForm.tags" placeholder="逗号分隔，如：导入文案,重点" /></el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="saveDialog = false">取消</el-button>
      <el-button type="primary" @click="doSave">保存</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.style-list { width: 100%; display: flex; flex-direction: column; gap: 6px; }
.style-item {
  border: 1px solid #e4e7ed; border-radius: 6px; padding: 8px 10px;
  display: flex; flex-direction: column; gap: 2px;
}
.style-item.active { border-color: #409eff; background: #ecf5ff; }
.result-box { min-height: 220px; }
.result-content { line-height: 1.9; font-size: 14px; white-space: pre-wrap; }
.result-meta { margin-bottom: 8px; }
</style>
