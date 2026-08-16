<script setup>
import { ref, computed, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  getCourses, getCourseDetail, getPrepItems, getPrepItem, createPrepItem, updatePrepItem, deletePrepItem,
  uploadPrepFile, addAttachment, deleteAttachment, packageChapter
} from '../api/index.js';
import MathText from '../components/MathText.vue';
import MarkdownView from '../components/MarkdownView.vue';

const courses = ref([]);
const courseId = ref(null);
const chapters = ref([]);
const activeNode = ref('all'); // 'all' | 'root' | chapterId
const items = ref([]);
const tagFilter = ref('');
const keyword = ref('');
const loading = ref(false);

const tags = ['重点', '难点', '易错点', '考研考点'];

const counts = computed(() => {
  const m = {};
  for (const it of items.value) {
    const k = it.chapter_id === null || it.chapter_id === undefined ? 'root' : String(it.chapter_id);
    m[k] = (m[k] || 0) + 1;
  }
  return m;
});

const treeData = computed(() => {
  const children = chapters.value.map((ch) => ({
    id: String(ch.id), label: `${ch.title}（${counts.value[ch.id] || 0}）`, chapter_id: ch.id
  }));
  return [
    { id: 'root', label: `课程级资料（${counts.value.root || 0}）`, children: [] },
    ...children
  ];
});

const filteredItems = computed(() => {
  let list = items.value;
  if (tagFilter.value) list = list.filter((it) => (',' + it.tags + ',').includes(',' + tagFilter.value + ','));
  if (keyword.value) {
    const k = keyword.value.toLowerCase();
    list = list.filter((it) => (it.title + ' ' + (it.content || '') + ' ' + (it.knowledge_point || '')).toLowerCase().includes(k));
  }
  return list;
});

async function loadCourses() {
  courses.value = await getCourses();
  if (courses.value.length) {
    courseId.value = courses.value[0].id;
    await loadChapters();
  }
}

async function loadChapters() {
  if (!courseId.value) { chapters.value = []; items.value = []; return; }
  const d = await getCourseDetail(courseId.value);
  chapters.value = d.chapters;
  await loadItems();
}

async function loadItems() {
  loading.value = true;
  try {
    items.value = await getPrepItems({ course_id: courseId.value });
  } finally {
    loading.value = false;
  }
}

function selectNode(node) {
  activeNode.value = node.id === 'root' ? 'root' : node.id === 'all' ? 'all' : String(node.chapter_id);
  tagFilter.value = '';
  keyword.value = '';
}

// ---------- 新增/编辑 ----------
const dialog = ref(false);
const preview = ref(false);
const form = ref({ id: null, chapter_id: 0, knowledge_point: '', title: '', content: '', tags: '' });
const attachments = ref([]);
const saving = ref(false);
const uploading = ref(false);
const fileInput = ref(null);

const kpOptions = computed(() => {
  const ch = chapters.value.find((c) => c.id === Number(form.value.chapter_id));
  return ch ? (ch.knowledge_points || '').split(/[,，]/).map((s) => s.trim()).filter(Boolean) : [];
});

// 标签：el-checkbox-group 需要数组，存库用逗号串
const tagsArr = computed({
  get: () => (form.value.tags || '').split(',').filter(Boolean),
  set: (v) => { form.value.tags = v.join(','); }
});

function openAdd() {
  form.value = {
    id: null,
    chapter_id: activeNode.value === 'all' ? (chapters.value[0]?.id || 0) : activeNode.value === 'root' ? 0 : Number(activeNode.value),
    knowledge_point: '', title: '', content: '', tags: ''
  };
  attachments.value = [];
  preview.value = false;
  dialog.value = true;
}

async function openEdit(id) {
  const it = await getPrepItem(id);
  form.value = { id: it.id, chapter_id: it.chapter_id || 0, knowledge_point: it.knowledge_point || '', title: it.title, content: it.content || '', tags: it.tags || '' };
  attachments.value = it.attachments || [];
  preview.value = false;
  dialog.value = true;
}

function changeChapter() {
  form.value.knowledge_point = '';
}

async function save() {
  if (!form.value.title) return ElMessage.warning('请填写标题');
  saving.value = true;
  try {
    const payload = { ...form.value, chapter_id: form.value.chapter_id || null };
    if (form.value.id) await updatePrepItem(form.value.id, payload);
    else await createPrepItem(payload);
    ElMessage.success('已保存');
    dialog.value = false;
    await loadItems();
  } finally {
    saving.value = false;
  }
}

async function remove(it) {
  await ElMessageBox.confirm(`确定删除资料「${it.title}」？`, '提示', { type: 'warning' });
  await deletePrepItem(it.id);
  ElMessage.success('已删除');
  await loadItems();
}

// ---------- 附件 ----------
async function onFileChange(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  uploading.value = true;
  try {
    const up = await uploadPrepFile(file);
    if (form.value.id) {
      await addAttachment(form.value.id, up);
      const it = await getPrepItem(form.value.id);
      attachments.value = it.attachments || [];
    } else {
      attachments.value.push({ id: 'temp' + Date.now(), filename: up.filename, url: up.url, size: up.size });
    }
    ElMessage.success('上传成功');
  } catch (err) {
    ElMessage.error(err.message);
  } finally {
    uploading.value = false;
    e.target.value = '';
  }
}

async function removeAtt(a) {
  if (a.id && String(a.id).startsWith('temp')) {
    attachments.value = attachments.value.filter((x) => x.id !== a.id);
    return;
  }
  await deleteAttachment(a.id);
  attachments.value = attachments.value.filter((x) => x.id !== a.id);
}

async function packageCurrent() {
  const chapterId = activeNode.value === 'root' || activeNode.value === 'all' ? null : Number(activeNode.value);
  const ch = chapters.value.find((c) => c.id === chapterId);
  if (!chapterId) return ElMessage.warning('请先在左侧选择要打包的章节');
  await packageChapter(chapterId);
  ElMessage.success(`正在打包「${ch.title}」的全部资料`);
}

onMounted(loadCourses);
</script>

<template>
  <el-row :gutter="14">
    <!-- 左侧目录树 -->
    <el-col :xs="24" :md="7">
      <div class="page-card">
        <h3 class="page-title">📂 课程 - 章节目录</h3>
        <el-select v-model="courseId" style="width: 100%; margin-bottom: 10px" filterable @change="loadChapters">
          <el-option v-for="c in courses" :key="c.id" :value="c.id" :label="c.name" />
        </el-select>
        <el-tree
          :data="[{ id: 'all', label: `全部资料（${items.length}）`, children: treeData }]"
          :props="{ label: 'label' }" default-expand-all highlight-current
          :current-node-key="activeNode" node-key="id"
          @node-click="selectNode">
          <template #default="{ node, data }">
            <span class="tree-node">{{ data.label }}</span>
          </template>
        </el-tree>
        <div class="muted" style="margin-top: 8px">按「课程 - 章节 - 知识点」三级组织备课资料</div>
      </div>
    </el-col>

    <!-- 右侧资料列表 -->
    <el-col :xs="24" :md="17">
      <div class="page-card" v-loading="loading">
        <div class="toolbar">
          <el-input v-model="keyword" placeholder="关键词搜索（标题/内容/知识点）" clearable style="width: 240px" @keyup.enter="keyword = keyword">
            <template #prefix><el-icon><Search /></el-icon></template>
          </el-input>
          <el-radio-group v-model="tagFilter" size="small">
            <el-radio-button value="">全部</el-radio-button>
            <el-radio-button v-for="t in tags" :key="t" :value="t">{{ t }}</el-radio-button>
          </el-radio-group>
          <div class="spacer"></div>
          <el-button type="warning" plain @click="packageCurrent">📦 打包当前章节</el-button>
          <el-button type="primary" @click="openAdd">＋ 新增资料</el-button>
        </div>

        <el-empty v-if="!filteredItems.length" description="该目录下暂无备课资料" />
        <div v-for="it in filteredItems" :key="it.id" class="prep-card">
          <div class="prep-head">
            <b class="prep-title">{{ it.title }}</b>
            <el-tag v-for="t in (it.tags || '').split(',').filter(Boolean)" :key="t" size="small"
              :type="t === '重点' ? 'danger' : t === '难点' ? 'warning' : t === '易错点' ? 'primary' : 'success'" style="margin-left:4px">{{ t }}</el-tag>
            <div class="spacer"></div>
            <span v-if="it.attach_count" class="muted">📎 {{ it.attach_count }} 个附件</span>
            <el-button size="small" text type="primary" @click="openEdit(it.id)">编辑</el-button>
            <el-button size="small" text type="danger" @click="remove(it)">删除</el-button>
          </div>
          <div class="prep-meta muted">
            {{ it.chapter_title || '课程级资料' }}<template v-if="it.knowledge_point"> · 知识点：{{ it.knowledge_point }}</template> · 更新于 {{ it.updated_at }}
          </div>
          <div class="prep-excerpt"><MathText :text="it.content" :clamp="3" /></div>
        </div>
      </div>
    </el-col>
  </el-row>

  <!-- 新增/编辑弹窗 -->
  <el-dialog v-model="dialog" :title="form.id ? '编辑资料' : '新增资料'" width="760px" top="4vh">
    <el-form label-width="90px">
      <el-row :gutter="10">
        <el-col :span="12">
          <el-form-item label="标题" required><el-input v-model="form.title" /></el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="所属章节">
            <el-select v-model="form.chapter_id" style="width: 100%" clearable filterable @change="changeChapter">
              <el-option v-for="ch in chapters" :key="ch.id" :value="ch.id" :label="ch.title" />
              <el-option :value="0" label="课程级资料" />
            </el-select>
          </el-form-item>
        </el-col>
      </el-row>
      <el-row :gutter="10">
        <el-col :span="12">
          <el-form-item label="知识点">
            <el-select v-model="form.knowledge_point" style="width: 100%" clearable filterable allow-create default-first-option>
              <el-option v-for="k in kpOptions" :key="k" :value="k" :label="k" />
            </el-select>
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="标签">
            <el-checkbox-group v-model="tagsArr" style="display:inline-flex">
              <el-checkbox v-for="t in tags" :key="t" :value="t" :label="t" />
            </el-checkbox-group>
          </el-form-item>
        </el-col>
      </el-row>
      <el-form-item label="内容">
        <el-radio-group v-model="preview" size="small" style="margin-bottom:6px">
          <el-radio-button :value="false">编辑</el-radio-button>
          <el-radio-button :value="true">预览</el-radio-button>
        </el-radio-group>
        <el-input v-if="!preview" v-model="form.content" type="textarea" :rows="10" placeholder="支持 Markdown 与 LaTeX 公式（$...$）&#10;可直接粘贴教案 / 知识点讲义 / 课堂导入文案" />
        <div v-else class="preview-box"><MarkdownView :content="form.content" /></div>
      </el-form-item>
      <el-form-item label="附件">
        <input ref="fileInput" type="file" style="display:none" @change="onFileChange" />
        <el-button :loading="uploading" @click="fileInput.click()">＋ 上传附件（PPT/Word/图片…）</el-button>
        <div v-for="a in attachments" :key="a.id" class="attach-item">
          <el-icon><Paperclip /></el-icon>
          <a :href="a.url" target="_blank" class="attach-name">{{ a.filename }}</a>
          <span class="muted">{{ (a.size / 1024).toFixed(1) }} KB</span>
          <el-button size="small" text type="danger" @click="removeAtt(a)">移除</el-button>
        </div>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="dialog = false">取消</el-button>
      <el-button type="primary" :loading="saving" @click="save">保存</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.tree-node { font-size: 13px; }
.prep-card {
  border: 1px solid var(--ta-border); border-radius: 16px; padding: 14px 16px; margin-bottom: 12px;
  background: var(--ta-surface); box-shadow: var(--ta-sh-1);
  transition: box-shadow .2s ease;
}
.prep-card:hover { box-shadow: var(--ta-sh-2); }
.prep-head { display: flex; align-items: center; gap: 4px; }
.prep-title { font-size: 15px; color: var(--ta-text); }
.prep-meta { margin: 6px 0; }
.prep-excerpt { color: var(--ta-text-2); font-size: 13px; }
.preview-box { border: 1px solid #e4e7ed; border-radius: 6px; padding: 10px 14px; min-height: 200px; background: #fafafa; }
.attach-item { display: inline-flex; align-items: center; gap: 6px; margin: 6px 12px 0 0; padding: 4px 10px; background: #f4f4f5; border-radius: 6px; }
.attach-name { color: #409eff; }
</style>
