<script setup>
import { ref, computed, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import {
  getCourses, getCourseDetail, getSettings, generateSizheng, getAiRecords, getAiRecord, saveRecordToPrep
} from '../api/index.js';
import MarkdownView from '../components/MarkdownView.vue';

const courses = ref([]);
const courseId = ref(null);
const chapters = ref([]);
const majors = ref([]);
const chapterId = ref(null);
const customTitle = ref('');
const major = ref('');
const theme = ref('comprehensive');
const withScript = ref(true);
const extra = ref('');
const generating = ref(false);
const result = ref(null);
const history = ref([]);

const themes = [
  { key: 'comprehensive', label: '综合融入', desc: '多维度自然融汇' },
  { key: 'patriotic', label: '家国情怀·科技报国', desc: '结合中国科技成就' },
  { key: 'science', label: '科学精神·严谨求实', desc: '数学严密性与求真' },
  { key: 'dialectic', label: '辩证思维·哲学思辨', desc: '概念哲学内涵' },
  { key: 'culture', label: '文化自信·数学史', desc: '中国数学史贡献' },
  { key: 'craft', label: '工匠精神·精益求精', desc: '追求卓越与严谨' }
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
  history.value = (await getAiRecords('sz')).slice(0, 10);
}

async function generate() {
  if (!chapterId.value && !customTitle.value) return ElMessage.warning('请选择章节或填写章节名称');
  generating.value = true;
  result.value = null;
  try {
    const r = await generateSizheng({
      chapter_id: chapterId.value || null,
      title: chapterId.value ? undefined : customTitle.value,
      major: major.value,
      theme: theme.value,
      withScript: withScript.value,
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
  if (r.chapter_id) chapterId.value = r.chapter_id;
  if (r.major) major.value = r.major;
  if (r.style) theme.value = r.style;
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

const saveDialog = ref(false);
const saveForm = ref({ chapter_id: null, title: '', tags: '课程思政' });

function openSave() {
  saveForm.value = {
    chapter_id: chapterId.value,
    title: `课程思政设计：${chapterId.value ? chapters.value.find((c) => c.id === chapterId.value)?.title : customTitle.value || '自定义章节'}`,
    tags: '课程思政'
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
    <el-col :xs="24" :md="9">
      <div class="page-card">
        <h3 class="page-title">⚙️ 思政生成配置</h3>
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
          <el-form-item label="侧重主题">
            <div class="style-list">
              <div v-for="t in themes" :key="t.key" class="style-item pointer" :class="{ active: theme === t.key }" @click="theme = t.key">
                <b>{{ t.label }}</b>
                <span class="muted">{{ t.desc }}</span>
              </div>
            </div>
          </el-form-item>
          <el-form-item label="课堂话术">
            <el-switch v-model="withScript" active-text="附带可口播的思政导入话术" />
          </el-form-item>
          <el-form-item label="补充要求">
            <el-input v-model="extra" type="textarea" :rows="2" placeholder="可选，如：多结合本专业应用场景；控制篇幅" />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" size="large" style="width: 100%" :loading="generating" @click="generate">
              🪄 AI 生成课程思政融入方案
            </el-button>
          </el-form-item>
        </el-form>
      </div>
    </el-col>

    <el-col :xs="24" :md="15">
      <div class="page-card" style="margin-bottom: 14px;">
        <div class="toolbar">
          <h3 class="page-title" style="margin:0">📝 生成结果</h3>
          <div class="spacer"></div>
          <el-button v-if="result" @click="copyText">复制全文</el-button>
          <el-button v-if="result" type="primary" @click="openSave">存入备课资料</el-button>
          <el-button v-if="result" @click="generate">🔄 重新生成</el-button>
        </div>
        <el-empty v-if="!result && !generating" description="配置左侧参数后点击生成，AI 将为章节输出思政元素、案例素材、课堂融入设计与话术" />
        <div v-loading="generating" class="result-box">
          <div v-if="result" class="result-content">
            <div class="result-meta muted">
              <template v-if="currentChapterTitle">章节：{{ currentChapterTitle }} · </template>
              专业：{{ major || '未指定' }} · 主题：{{ themes.find((t) => t.key === theme)?.label }}
            </div>
            <MarkdownView :content="result.content" />
          </div>
        </div>
      </div>

      <div class="page-card">
        <h3 class="page-title">🕘 最近生成记录</h3>
        <el-table :data="history" size="small" @row-click="viewRecord" class="pointer">
          <el-table-column label="章节" min-width="160">
            <template #default="{ row }">{{ row.chapter_title || '自定义章节' }}</template>
          </el-table-column>
          <el-table-column prop="major" label="专业" width="120" />
          <el-table-column label="主题" width="130">
            <template #default="{ row }">{{ themes.find((t) => t.key === row.style)?.label || row.style }}</template>
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
      <el-form-item label="标签"><el-input v-model="saveForm.tags" placeholder="逗号分隔，如：课程思政,重点" /></el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="saveDialog = false">取消</el-button>
      <el-button type="primary" @click="doSave">保存</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.style-list { width: 100%; display: flex; flex-direction: column; gap: 8px; }
.style-item {
  border: 1px solid var(--ta-border); border-radius: 12px; padding: 10px 12px;
  display: flex; flex-direction: column; gap: 3px;
  background: var(--ta-surface); transition: all .2s ease;
}
.style-item.active { border-color: var(--ta-primary); background: var(--el-color-primary-light-9); box-shadow: 0 4px 12px rgba(59,130,246,.12); }
.result-box { min-height: 220px; }
.result-content { line-height: 1.9; font-size: 14px; }
.result-meta { margin-bottom: 10px; }
</style>
