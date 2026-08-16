<script setup>
import { ref, computed, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import {
  getCourses, getCourseDetail, getSettings, generateExercises, getAiRecords, getAiRecord,
  importBankItems, exportExercises
} from '../api/index.js';
import MathText from '../components/MathText.vue';
import { DIFF_LABEL, DIFF_TYPE, TYPE_LABEL } from '../utils/math.js';

const courses = ref([]);
const courseId = ref(null);
const chapters = ref([]);
const chapterId = ref(null);
const customTitle = ref('');
const majors = ref([]);
const major = ref('');
const counts = ref({ basic: 3, intermediate: 2, advanced: 1 });
const types = ref(['choice', 'blank', 'calc', 'proof']);
const useMistakes = ref(false);
const extra = ref('');
const generating = ref(false);
const record = ref(null); // {id, items, chapter_title}
const history = ref([]);

const allTypes = [
  { key: 'choice', label: '选择题' },
  { key: 'blank', label: '填空题' },
  { key: 'calc', label: '计算题' },
  { key: 'proof', label: '证明题' }
];

const grouped = computed(() => {
  const g = { basic: [], intermediate: [], advanced: [] };
  for (const it of record.value?.items || []) {
    (g[it.difficulty] || (g[it.difficulty] = [])).push(it);
  }
  return g;
});

const totalCount = computed(() => Object.values(counts.value).reduce((s, n) => s + (Number(n) || 0), 0));

async function loadCourses() {
  courses.value = await getCourses();
  const set = await getSettings();
  majors.value = set.majors || [];
  major.value = majors.value?.[0] || '';
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
  history.value = (await getAiRecords('exercise')).slice(0, 10);
}

async function generate() {
  if (!chapterId.value && !customTitle.value) return ElMessage.warning('请选择章节或填写章节名称');
  if (totalCount.value < 1) return ElMessage.warning('请至少设置 1 道题');
  if (!types.value.length) return ElMessage.warning('请至少选择一种题型');
  generating.value = true;
  record.value = null;
  try {
    const r = await generateExercises({
      chapter_id: chapterId.value || null,
      title: chapterId.value ? undefined : customTitle.value,
      major: major.value,
      counts: counts.value,
      types: types.value,
      extra: extra.value,
      use_mistakes: useMistakes.value
    });
    record.value = r;
    ElMessage.success(`生成成功，共 ${r.items.length} 道题`);
    loadHistory();
  } catch (e) {
    ElMessage.error(e.message);
  } finally {
    generating.value = false;
  }
}

async function viewRecord(id) {
  const r = await getAiRecord(id);
  record.value = r;
  if (r.chapter_id) chapterId.value = r.chapter_id;
  try {
    const cfg = JSON.parse(r.config || '{}');
    if (cfg.counts) counts.value = { ...counts.value, ...cfg.counts };
    if (cfg.types) types.value = cfg.types;
  } catch { /* ignore */ }
}

async function copyQuestion(it, withAnswer) {
  const text = `【${TYPE_LABEL[it.type]}】${it.question}\n${withAnswer ? `答案：${it.answer}\n解析：${it.solution}` : ''}`;
  try {
    await navigator.clipboard.writeText(text);
    ElMessage.success('已复制');
  } catch {
    ElMessage.warning('复制失败，请手动选择');
  }
}

async function saveOne(it, isMistake) {
  await importBankItems([{
    chapter_id: chapterId.value || null,
    difficulty: it.difficulty, type: it.type,
    question: it.question, answer: it.answer, solution: it.solution,
    source: `AI生成·${record.value?.chapter_title || ''}`,
    is_mistake: isMistake ? 1 : 0
  }]);
  ElMessage.success(isMistake ? '已存入错题库（可在「本地题库」查看）' : '已存入本地题库');
}

async function saveAll() {
  const items = (record.value?.items || []).map((it) => ({
    chapter_id: chapterId.value || null,
    difficulty: it.difficulty, type: it.type,
    question: it.question, answer: it.answer, solution: it.solution,
    source: `AI生成·${record.value?.chapter_title || ''}`,
    is_mistake: 0
  }));
  if (!items.length) return;
  await importBankItems(items);
  ElMessage.success(`已全部存入本地题库（${items.length} 道）`);
}

onMounted(loadCourses);
</script>

<template>
  <el-row :gutter="14">
    <el-col :xs="24" :md="8">
      <div class="page-card">
        <h3 class="page-title">⚙️ 出题配置</h3>
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
            <el-input v-model="customTitle" placeholder="如：第十三章 常微分方程" />
          </el-form-item>
          <el-form-item label="学生专业">
            <el-select v-model="major" style="width: 100%" filterable allow-create default-first-option placeholder="可选">
              <el-option v-for="m in majors" :key="m" :value="m" :label="m" />
            </el-select>
          </el-form-item>
          <el-form-item label="题量配置">
            <div class="count-row" v-for="(label, key) in { basic: '基础级', intermediate: '进阶级', advanced: '提高级' }" :key="key">
              <span class="count-label">{{ label }}</span>
              <el-input-number v-model="counts[key]" :min="0" :max="10" size="small" />
              <el-tag size="small" :type="DIFF_TYPE[key]">{{ key === 'basic' ? '课后作业' : key === 'intermediate' ? '章节小测' : '拔高训练' }}</el-tag>
            </div>
          </el-form-item>
          <el-form-item label="题型">
            <el-checkbox-group v-model="types">
              <el-checkbox v-for="t in allTypes" :key="t.key" :value="t.key">{{ t.label }}</el-checkbox>
            </el-checkbox-group>
          </el-form-item>
          <el-form-item label="参考错题">
            <el-switch v-model="useMistakes" active-text="优先纳入本地高频易错题风格" />
          </el-form-item>
          <el-form-item label="补充要求">
            <el-input v-model="extra" type="textarea" :rows="2" placeholder="可选，如：难度贴近考研真题；多出证明题" />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" size="large" style="width: 100%" :loading="generating" @click="generate">
              📝 AI 一键生成 {{ totalCount }} 道练习题
            </el-button>
          </el-form-item>
        </el-form>
      </div>

      <div class="page-card" style="margin-top: 14px;">
        <h3 class="page-title">🕘 最近出题记录</h3>
        <el-table :data="history" size="small" @row-click="viewRecord" class="pointer">
          <el-table-column label="章节" min-width="150">
            <template #default="{ row }">{{ row.chapter_title || '自定义' }}</template>
          </el-table-column>
          <el-table-column prop="created_at" label="时间" width="150" />
          <el-table-column label="操作" width="70">
            <template #default="{ row }"><el-link type="primary" @click.stop="viewRecord(row.id)">查看</el-link></template>
          </el-table-column>
        </el-table>
      </div>
    </el-col>

    <el-col :xs="24" :md="16">
      <div class="page-card" v-loading="generating">
        <div class="toolbar">
          <h3 class="page-title" style="margin:0">📝 生成结果</h3>
          <div class="spacer"></div>
          <template v-if="record && record.items.length">
            <el-button @click="exportExercises(record.id, 'md')">导出 Markdown</el-button>
            <el-button type="success" @click="exportExercises(record.id, 'docx')">导出 Word</el-button>
            <el-button type="primary" @click="saveAll">全部存入题库</el-button>
          </template>
        </div>
        <el-empty v-if="!record && !generating" description="配置左侧参数点击生成，将按三级难度自动出题并附详细解析" />

        <template v-if="record && record.items.length">
          <div v-for="diff in ['basic', 'intermediate', 'advanced']" :key="diff">
            <div v-if="grouped[diff].length" class="diff-head">
              <el-tag :type="DIFF_TYPE[diff]" size="large">{{ DIFF_LABEL[diff] }}</el-tag>
              <span class="muted">{{ grouped[diff].length }} 题</span>
            </div>
            <el-card v-for="it in grouped[diff]" :key="it.id" shadow="hover" class="q-card" :class="diff">
              <div class="q-head">
                <el-tag size="small" type="info">{{ TYPE_LABEL[it.type] }}</el-tag>
                <span class="q-no">第 {{ it.id }} 题</span>
                <div class="spacer"></div>
                <el-dropdown @command="(c) => c === 'copy' ? copyQuestion(it, false) : copyQuestion(it, true)">
                  <el-button size="small" text type="primary">复制<el-icon><ArrowDown /></el-icon></el-button>
                  <template #dropdown>
                    <el-dropdown-menu>
                      <el-dropdown-item command="copy">仅题目</el-dropdown-item>
                      <el-dropdown-item command="copyAll">题目 + 答案解析</el-dropdown-item>
                    </el-dropdown-menu>
                  </template>
                </el-dropdown>
                <el-button size="small" text type="warning" @click="saveOne(it, true)">标记错题</el-button>
                <el-button size="small" text type="success" @click="saveOne(it, false)">存入题库</el-button>
              </div>
              <div class="q-body"><MathText :text="it.question" /></div>
              <el-collapse>
                <el-collapse-item>
                  <template #title><span style="color:#67c23a">💡 查看答案与解析</span></template>
                  <div class="q-answer"><b>答案：</b><MathText :text="it.answer" /></div>
                  <div class="q-answer"><b>解析：</b><MathText :text="it.solution" /></div>
                </el-collapse-item>
              </el-collapse>
            </el-card>
          </div>
        </template>
      </div>
    </el-col>
  </el-row>
</template>

<style scoped>
.count-row { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.count-label { width: 56px; font-size: 13px; }
.diff-head { display: flex; align-items: center; gap: 10px; margin: 18px 0 10px; }
.q-card { margin-bottom: 12px; border-left: 3px solid #e4e7ed; }
.q-card.basic { border-left-color: #409eff; }
.q-card.intermediate { border-left-color: #e6a23c; }
.q-card.advanced { border-left-color: #f56c6c; }
.q-head { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.q-no { color: #909399; font-size: 13px; }
.q-body { font-size: 14px; line-height: 1.8; }
.q-answer { margin-top: 6px; font-size: 13.5px; line-height: 1.8; }
</style>
