<script setup>
import { ref, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  getCourses, getCourseDetail, getBankItems, createBankItem, updateBankItem, deleteBankItem
} from '../api/index.js';
import MathText from '../components/MathText.vue';
import { DIFF_LABEL, DIFF_TYPE, TYPE_LABEL } from '../utils/math.js';

const courses = ref([]);
const courseId = ref(null);
const chapters = ref([]);
const chapterId = ref(null);
const difficulty = ref('');
const type = ref('');
const mistake = ref('');
const keyword = ref('');
const items = ref([]);
const loading = ref(false);

async function loadCourses() {
  courses.value = await getCourses();
  if (courses.value.length) {
    courseId.value = courses.value[0].id;
    await loadChapters();
  }
  await loadItems();
}

async function loadChapters() {
  if (!courseId.value) { chapters.value = []; return; }
  const d = await getCourseDetail(courseId.value);
  chapters.value = d.chapters;
}

async function loadItems() {
  loading.value = true;
  try {
    items.value = await getBankItems({
      course_id: courseId.value || undefined,
      chapter_id: chapterId.value || undefined,
      difficulty: difficulty.value || undefined,
      type: type.value || undefined,
      is_mistake: mistake.value === '' ? undefined : mistake.value,
      q: keyword.value || undefined
    });
  } finally {
    loading.value = false;
  }
}

// ---------- 新增/编辑 ----------
const dialog = ref(false);
const form = ref({ id: null, chapter_id: null, difficulty: 'basic', type: 'calc', question: '', answer: '', solution: '', source: '', is_mistake: 0 });

function openAdd() {
  form.value = { id: null, chapter_id: chapterId.value, difficulty: 'basic', type: 'calc', question: '', answer: '', solution: '', source: '', is_mistake: 1 };
  dialog.value = true;
}

function openEdit(row) {
  form.value = { ...row, chapter_id: row.chapter_id || null };
  dialog.value = true;
}

async function save() {
  if (!form.value.question) return ElMessage.warning('请填写题目内容');
  const payload = { ...form.value, chapter_id: form.value.chapter_id || null };
  if (form.value.id) await updateBankItem(form.value.id, payload);
  else await createBankItem(payload);
  ElMessage.success('已保存');
  dialog.value = false;
  await loadItems();
}

async function remove(row) {
  await ElMessageBox.confirm('确定删除这道题？', '提示', { type: 'warning' });
  await deleteBankItem(row.id);
  ElMessage.success('已删除');
  await loadItems();
}

async function copyOne(row) {
  const text = `【${TYPE_LABEL[row.type]}·${DIFF_LABEL[row.difficulty]}】${row.question}\n答案：${row.answer}\n解析：${row.solution}`;
  try {
    await navigator.clipboard.writeText(text);
    ElMessage.success('已复制');
  } catch {
    ElMessage.warning('复制失败，请手动选择');
  }
}

onMounted(loadCourses);
</script>

<template>
  <div class="page-card">
    <div class="toolbar">
      <el-select v-model="courseId" style="width: 180px" filterable @change="loadChapters">
        <el-option v-for="c in courses" :key="c.id" :value="c.id" :label="c.name" />
      </el-select>
      <el-select v-model="chapterId" style="width: 200px" filterable clearable placeholder="全部章节" @change="loadItems">
        <el-option v-for="ch in chapters" :key="ch.id" :value="ch.id" :label="ch.title" />
      </el-select>
      <el-select v-model="difficulty" style="width: 110px" clearable placeholder="难度" @change="loadItems">
        <el-option v-for="(l, k) in DIFF_LABEL" :key="k" :value="k" :label="l" />
      </el-select>
      <el-select v-model="type" style="width: 110px" clearable placeholder="题型" @change="loadItems">
        <el-option v-for="(l, k) in TYPE_LABEL" :key="k" :value="k" :label="l" />
      </el-select>
      <el-select v-model="mistake" style="width: 120px" clearable placeholder="错题筛选" @change="loadItems">
        <el-option value="1" label="仅看错题" />
        <el-option value="0" label="排除错题" />
      </el-select>
      <el-input v-model="keyword" placeholder="搜索题干/解析" clearable style="width: 200px" @keyup.enter="loadItems">
        <template #prefix><el-icon><Search /></el-icon></template>
      </el-input>
      <el-button type="primary" @click="loadItems">查询</el-button>
      <div class="spacer"></div>
      <el-button type="primary" @click="openAdd">＋ 收录题目（错题）</el-button>
    </div>

    <div class="table-scroll">
      <el-table :data="items" v-loading="loading" border size="small" style="min-width: 820px; width: 100%">
        <el-table-column label="题目" min-width="300">
          <template #default="{ row }"><MathText :text="row.question" :clamp="2" /></template>
        </el-table-column>
        <el-table-column label="难度" width="80">
          <template #default="{ row }"><el-tag size="small" :type="DIFF_TYPE[row.difficulty]">{{ DIFF_LABEL[row.difficulty] }}</el-tag></template>
        </el-table-column>
        <el-table-column label="题型" width="80">
          <template #default="{ row }"><el-tag size="small" type="info">{{ TYPE_LABEL[row.type] }}</el-tag></template>
        </el-table-column>
        <el-table-column prop="source" label="来源" width="140" show-overflow-tooltip />
        <el-table-column label="错题" width="70">
          <template #default="{ row }">
            <el-tag v-if="row.is_mistake" size="small" type="danger">错题</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="180">
          <template #default="{ row }">
            <el-button size="small" text type="primary" @click="openEdit(row)">编辑</el-button>
            <el-button size="small" text @click="copyOne(row)">复制</el-button>
            <el-button size="small" text type="danger" @click="remove(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>
    <el-empty v-if="!items.length && !loading" description="题库为空，可从「习题生成」页一键存入，或手动收录高频错题" />

    <!-- 新增/编辑 -->
    <el-dialog v-model="dialog" :title="form.id ? '编辑题目' : '收录题目'" width="640px">
      <el-form label-width="80px">
        <el-row :gutter="10">
          <el-col :span="12">
            <el-form-item label="章节">
              <el-select v-model="form.chapter_id" style="width: 100%" clearable filterable>
                <el-option v-for="ch in chapters" :key="ch.id" :value="ch.id" :label="ch.title" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="来源"><el-input v-model="form.source" placeholder="如：2025春 期中" /></el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="10">
          <el-col :span="12">
            <el-form-item label="难度">
              <el-radio-group v-model="form.difficulty">
                <el-radio-button v-for="(l, k) in DIFF_LABEL" :key="k" :value="k">{{ l }}</el-radio-button>
              </el-radio-group>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="题型">
              <el-radio-group v-model="form.type">
                <el-radio-button v-for="(l, k) in TYPE_LABEL" :key="k" :value="k">{{ l }}</el-radio-button>
              </el-radio-group>
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="题目" required>
          <el-input v-model="form.question" type="textarea" :rows="4" placeholder="支持 LaTeX 公式，如：求极限 $\lim_{x\to 0}\frac{\sin x}{x}$" />
        </el-form-item>
        <el-form-item label="答案"><el-input v-model="form.answer" type="textarea" :rows="2" /></el-form-item>
        <el-form-item label="解析"><el-input v-model="form.solution" type="textarea" :rows="3" /></el-form-item>
        <el-form-item label="标记错题">
          <el-switch v-model="form.is_mistake" :active-value="1" :inactive-value="0" active-text="高频易错题" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialog = false">取消</el-button>
        <el-button type="primary" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>
