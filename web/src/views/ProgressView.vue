<script setup>
import { ref, computed, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  getCourses, createCourse, updateCourse, deleteCourse, getCourseDetail,
  createClass, updateClass, deleteClass, createChapter, updateChapter, deleteChapter,
  getProgressBoard, logProgress, updateProgress, getProgressLogs,
  exportProgressUrl
} from '../api/index.js';
import { STATUS_LABEL } from '../utils/math.js';

const courses = ref([]);
const courseId = ref(null);
const board = ref(null); // {course, classes, chapters, board}
const loading = ref(false);

// 课程弹窗
const courseDialog = ref(false);
const courseForm = ref({ id: null, name: '', code: '', semester: '', total_hours: 48, chaptersText: '' });

// 班级管理
const classDialog = ref(false);       // 班级列表弹窗
const classFormDialog = ref(false);   // 班级新增/编辑弹窗
const classForm = ref({ id: null, course_id: null, name: '', major: '', student_count: 0, note: '' });

// 章节管理
const chapterDialog = ref(false);       // 章节列表弹窗
const chapterFormDialog = ref(false);   // 章节新增/编辑弹窗
const chapterForm = ref({ id: null, title: '', order_no: 0, planned_hours: 4, knowledge_points: '' });

// 登记进度
const regDialog = ref(false);
const regForm = ref({ class_id: null, chapter_id: null, hours: 1, note: '', status: 'in_progress', current_point: '' });
const regClass = ref(null);
const regChapter = ref(null);
const saving = ref(false);

// 班级明细
const detailDrawer = ref(false);
const detailClass = ref(null);
const detailRows = ref([]);

// 流水
const logsDialog = ref(false);
const logs = ref([]);

const byKey = computed(() => {
  const m = new Map();
  if (board.value) for (const r of board.value.board) m.set(`${r.class_id}:${r.chapter_id}`, r);
  return m;
});

function rowOf(classId, chapterId) {
  return byKey.value.get(`${classId}:${chapterId}`) || null;
}

async function loadCourses() {
  courses.value = await getCourses();
  if (!courseId.value && courses.value.length) courseId.value = courses.value[0].id;
}

async function loadBoard() {
  if (!courseId.value) { board.value = null; return; }
  loading.value = true;
  try {
    board.value = await getProgressBoard(courseId.value);
  } finally {
    loading.value = false;
  }
}

function switchCourse(id) {
  courseId.value = id;
  loadBoard();
}

onMounted(async () => {
  await loadCourses();
  await loadBoard();
});

// ---------- 课程 ----------
function openCourseDialog(course = null) {
  courseForm.value = course
    ? { id: course.id, name: course.name, code: course.code || '', semester: course.semester || '', total_hours: course.total_hours, chaptersText: '' }
    : { id: null, name: '', code: '', semester: '', total_hours: 48, chaptersText: '' };
  courseDialog.value = true;
}

async function saveCourse() {
  if (!courseForm.value.name) return ElMessage.warning('请填写课程名称');
  const f = courseForm.value;
  const chapters = f.chaptersText.split('\n').map((l) => l.trim()).filter(Boolean).map((line) => {
    const parts = line.split(/[\t,，]/).map((s) => s.trim());
    return { title: parts[0], planned_hours: Number(parts[1]) > 0 ? Number(parts[1]) : 4 };
  });
  if (f.id) {
    await updateCourse(f.id, { name: f.name, code: f.code, semester: f.semester, total_hours: f.total_hours });
  } else {
    await createCourse({ name: f.name, code: f.code, semester: f.semester, total_hours: f.total_hours, chapters });
  }
  ElMessage.success(f.id ? '课程已更新' : '课程已创建');
  courseDialog.value = false;
  await loadCourses();
  if (!f.id) courseId.value = courses.value[0].id;
  await loadBoard();
}

async function removeCourse() {
  await ElMessageBox.confirm(`确定删除课程「${board.value.course.name}」？其下班级、章节、进度、资料将全部删除！`, '危险操作', { type: 'warning' });
  await deleteCourse(courseId.value);
  ElMessage.success('已删除');
  courseId.value = null;
  await loadCourses();
  await loadBoard();
}

// ---------- 班级 ----------
function openClassDialog(row = null) {
  classForm.value = row
    ? { id: row.id, course_id: row.course_id, name: row.name, major: row.major || '', student_count: row.student_count || 0, note: row.note || '' }
    : { id: null, course_id: courseId.value, name: '', major: '', student_count: 0, note: '' };
  classFormDialog.value = true;
}

async function saveClass() {
  if (!classForm.value.name) return ElMessage.warning('请填写班级名称');
  const f = classForm.value;
  if (f.id) await updateClass(f.id, f);
  else await createClass(f);
  ElMessage.success('保存成功');
  classFormDialog.value = false;
  await loadBoard();
}

async function removeClass(cls) {
  await ElMessageBox.confirm(`确定删除班级「${cls.name}」？其进度记录将一并删除。`, '提示', { type: 'warning' });
  await deleteClass(cls.id);
  ElMessage.success('已删除');
  await loadBoard();
}

// ---------- 章节 ----------
function openChapterDialog(row = null) {
  chapterForm.value = row
    ? { id: row.id, title: row.title, order_no: row.order_no, planned_hours: row.planned_hours, knowledge_points: row.knowledge_points || '' }
    : { id: null, title: '', order_no: (board.value?.chapters.length || 0) + 1, planned_hours: 4, knowledge_points: '' };
  chapterFormDialog.value = true;
}

async function saveChapter() {
  if (!chapterForm.value.title) return ElMessage.warning('请填写章节标题');
  const f = chapterForm.value;
  if (f.id) await updateChapter(f.id, f);
  else await createChapter({ ...f, course_id: courseId.value });
  ElMessage.success('保存成功');
  chapterFormDialog.value = false;
  await loadBoard();
}

async function removeChapter(ch) {
  await ElMessageBox.confirm(`确定删除章节「${ch.title}」？`, '提示', { type: 'warning' });
  await deleteChapter(ch.id);
  ElMessage.success('已删除');
  await loadBoard();
}

// ---------- 登记 ----------
function openReg(row, cls, ch) {
  regForm.value = {
    class_id: cls.id, chapter_id: ch.id,
    hours: 1,
    note: '',
    status: row?.status || 'in_progress',
    current_point: row?.current_point || ''
  };
  regClass.value = cls;
  regChapter.value = ch;
  regDialog.value = true;
}

async function saveReg() {
  saving.value = true;
  try {
    const f = regForm.value;
    const p = await logProgress({ class_id: f.class_id, chapter_id: f.chapter_id, hours: f.hours, note: f.note });
    if (p.id) {
      await updateProgress(p.id, { status: f.status, current_point: f.current_point, taught_hours: p.taught_hours });
    }
    ElMessage.success(`已登记 ${f.hours >= 0 ? '+' : ''}${f.hours} 课时`);
    regDialog.value = false;
    await loadBoard();
  } finally {
    saving.value = false;
  }
}

// ---------- 班级明细 ----------
async function openDetail(cls) {
  detailClass.value = cls;
  detailRows.value = board.value.chapters.map((ch) => {
    const r = rowOf(cls.id, ch.id);
    return { chapter: ch, row: r };
  });
  detailDrawer.value = true;
}

async function showLogs(row) {
  logs.value = await getProgressLogs(row.id);
  logsDialog.value = true;
}

function statusType(s) {
  return s === 'completed' ? 'success' : s === 'in_progress' ? 'warning' : 'info';
}

function download(url, name) {
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
}
</script>

<template>
  <div>
    <!-- 工具栏 -->
    <div class="page-card" style="margin-bottom: 14px;">
      <div class="toolbar">
        <el-select v-model="courseId" placeholder="选择课程" style="width: 260px" @change="switchCourse" filterable>
          <el-option v-for="c in courses" :key="c.id" :value="c.id" :label="`${c.name}${c.semester ? '（' + c.semester + '）' : ''}`" />
        </el-select>
        <el-button type="primary" @click="openCourseDialog()">＋ 新建课程</el-button>
        <el-button v-if="board" @click="openCourseDialog(board.course)">编辑课程</el-button>
        <el-button v-if="board" @click="openClassDialog()">＋ 添加班级</el-button>
        <el-button v-if="board" @click="openChapterDialog()">＋ 添加章节</el-button>
        <el-button v-if="board" @click="classDialog = true">班级管理</el-button>
        <el-button v-if="board" @click="chapterDialog = true">章节管理</el-button>
        <div class="spacer"></div>
        <el-dropdown v-if="board" @command="(f) => download(exportProgressUrl(courseId, f), '')">
          <el-button type="success">导出进度档案<el-icon class="el-icon--right"><ArrowDown /></el-icon></el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="md">Markdown 格式</el-dropdown-item>
              <el-dropdown-item command="docx">Word 格式</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
        <el-button v-if="board" type="danger" plain @click="removeCourse">删除课程</el-button>
      </div>
    </div>

    <!-- 矩阵看板 -->
    <div class="page-card" v-loading="loading">
      <template v-if="board">
        <h3 class="page-title">{{ board.course.name }} —— 班级 × 章节进度对比（点击格子登记）</h3>
        <el-table :data="board.chapters" border size="small" style="width: 100%">
          <el-table-column label="章节 / 班级" min-width="200" fixed>
            <template #default="{ row }">
              <b>{{ row.title }}</b>
              <span class="muted">（计划 {{ row.planned_hours }} 课时）</span>
            </template>
          </el-table-column>
          <el-table-column v-for="cls in board.classes" :key="cls.id" :label="cls.name" min-width="150">
            <template #default="{ row: ch }">
              <div v-if="rowOf(cls.id, ch.id)" class="cell pointer" @click="openReg(rowOf(cls.id, ch.id), cls, ch)">
                <el-progress :percentage="rowOf(cls.id, ch.id).pct" :stroke-width="6"
                  :status="rowOf(cls.id, ch.id).status === 'completed' ? 'success' : ''" />
                <div class="cell-info">
                  <span>{{ rowOf(cls.id, ch.id).taught_hours }}/{{ ch.planned_hours }} 课时</span>
                  <el-tag size="small" :type="statusType(rowOf(cls.id, ch.id).status)">{{ STATUS_LABEL[rowOf(cls.id, ch.id).status] }}</el-tag>
                </div>
                <div v-if="rowOf(cls.id, ch.id).current_point" class="muted ellipsis">▶ {{ rowOf(cls.id, ch.id).current_point }}</div>
              </div>
              <div v-else class="cell pointer" @click="openReg(null, cls, ch)">
                <el-progress :percentage="0" :stroke-width="6" />
                <div class="cell-info"><span class="muted">未开始</span></div>
              </div>
            </template>
          </el-table-column>
        </el-table>
      </template>
      <el-empty v-else description="请先选择或新建课程" />
    </div>

    <!-- 课程弹窗 -->
    <el-dialog v-model="courseDialog" :title="courseForm.id ? '编辑课程' : '新建课程'" width="520px">
      <el-form label-width="90px">
        <el-form-item label="课程名称" required><el-input v-model="courseForm.name" placeholder="如：高等数学A" /></el-form-item>
        <el-form-item label="课程代码"><el-input v-model="courseForm.code" placeholder="如：MATH101" /></el-form-item>
        <el-form-item label="学期"><el-input v-model="courseForm.semester" placeholder="如：2025-2026-1" /></el-form-item>
        <el-form-item label="总课时"><el-input-number v-model="courseForm.total_hours" :min="1" :max="200" /></el-form-item>
        <el-form-item v-if="!courseForm.id" label="章节列表">
          <el-input v-model="courseForm.chaptersText" type="textarea" :rows="8"
            placeholder="每行一个章节，格式：标题 或 标题,课时&#10;例如：&#10;第一章 函数与极限,6&#10;第二章 导数与微分,6" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="courseDialog = false">取消</el-button>
        <el-button type="primary" @click="saveCourse">保存</el-button>
      </template>
    </el-dialog>

    <!-- 班级管理 -->
    <el-dialog v-model="classDialog" title="班级管理" width="720px">
      <el-table :data="board?.classes || []" size="small" border>
        <el-table-column prop="name" label="班级名称" />
        <el-table-column prop="major" label="专业" />
        <el-table-column prop="student_count" label="人数" width="80" />
        <el-table-column prop="note" label="备注" show-overflow-tooltip />
        <el-table-column label="操作" width="140">
          <template #default="{ row }">
            <el-button size="small" text type="primary" @click="openClassDialog(row)">编辑</el-button>
            <el-button size="small" text type="danger" @click="removeClass(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
      <template #footer>
        <el-button @click="classDialog = false">关闭</el-button>
      </template>
    </el-dialog>

    <!-- 班级新增/编辑 -->
    <el-dialog v-model="classFormDialog" :title="classForm.id ? '编辑班级' : '添加班级'" width="460px">
      <el-form label-width="80px">
        <el-form-item label="班级名称" required><el-input v-model="classForm.name" placeholder="如：计算机2301班" /></el-form-item>
        <el-form-item label="专业"><el-input v-model="classForm.major" placeholder="如：计算机科学与技术" /></el-form-item>
        <el-form-item label="人数"><el-input-number v-model="classForm.student_count" :min="0" :max="300" /></el-form-item>
        <el-form-item label="备注"><el-input v-model="classForm.note" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="classFormDialog = false">取消</el-button>
        <el-button type="primary" @click="saveClass">保存</el-button>
      </template>
    </el-dialog>

    <!-- 章节管理 -->
    <el-dialog v-model="chapterDialog" title="章节管理" width="860px">
      <el-table :data="board?.chapters || []" size="small" border>
        <el-table-column prop="order_no" label="序号" width="60" />
        <el-table-column prop="title" label="章节标题" min-width="180" />
        <el-table-column prop="planned_hours" label="计划课时" width="80" />
        <el-table-column prop="knowledge_points" label="知识点（逗号分隔）" show-overflow-tooltip />
        <el-table-column label="操作" width="140">
          <template #default="{ row }">
            <el-button size="small" text type="primary" @click="openChapterDialog(row)">编辑</el-button>
            <el-button size="small" text type="danger" @click="removeChapter(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
      <template #footer><el-button @click="chapterDialog = false">关闭</el-button></template>
    </el-dialog>

    <!-- 章节新增/编辑 -->
    <el-dialog v-model="chapterFormDialog" :title="chapterForm.id ? '编辑章节' : '添加章节'" width="520px">
      <el-form label-width="90px">
        <el-form-item label="章节标题" required><el-input v-model="chapterForm.title" placeholder="如：第三章 导数与微分" /></el-form-item>
        <el-form-item label="顺序"><el-input-number v-model="chapterForm.order_no" :min="1" :max="99" /></el-form-item>
        <el-form-item label="计划课时"><el-input-number v-model="chapterForm.planned_hours" :min="1" :max="60" /></el-form-item>
        <el-form-item label="知识点"><el-input v-model="chapterForm.knowledge_points" type="textarea" :rows="3" placeholder="用逗号分隔，如：导数概念,求导法则,高阶导数" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="chapterFormDialog = false">取消</el-button>
        <el-button type="primary" @click="saveChapter">保存</el-button>
      </template>
    </el-dialog>

    <!-- 登记进度 -->
    <el-dialog v-model="regDialog" :title="`登记进度：${regChapter?.title}`" width="480px">
      <p class="muted" style="margin-top:0">班级：<b>{{ regClass?.name }}</b>（{{ regClass?.major || '专业未填' }}）</p>
      <el-form label-width="100px">
        <el-form-item label="本次登记课时">
          <el-input-number v-model="regForm.hours" :min="-10" :max="10" :step="1" />
          <span class="muted" style="margin-left:8px">正数增加、负数微调</span>
        </el-form-item>
        <el-form-item label="进度状态">
          <el-radio-group v-model="regForm.status">
            <el-radio-button value="in_progress">进行中</el-radio-button>
            <el-radio-button value="completed">已完成</el-radio-button>
            <el-radio-button value="not_started">未开始</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="当前知识点"><el-input v-model="regForm.current_point" placeholder="如：两个重要极限" /></el-form-item>
        <el-form-item label="备注"><el-input v-model="regForm.note" type="textarea" :rows="2" placeholder="如：本节补充了习题课" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="regDialog = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveReg">保存登记</el-button>
      </template>
    </el-dialog>

    <!-- 班级明细 -->
    <el-drawer v-model="detailDrawer" :title="`${detailClass?.name} 进度明细（${detailClass?.major || '专业未填'}）`" size="520px">
      <div v-for="d in detailRows" :key="d.chapter.id" class="detail-row">
        <div class="detail-head">
          <b>{{ d.chapter.title }}</b>
          <span class="muted">{{ d.row ? d.row.taught_hours : 0 }}/{{ d.chapter.planned_hours }} 课时</span>
          <el-tag v-if="d.row" size="small" :type="statusType(d.row.status)">{{ STATUS_LABEL[d.row.status] }}</el-tag>
        </div>
        <div class="detail-actions">
          <el-button size="small" @click="openReg(d.row, detailClass, d.chapter)">登记</el-button>
          <el-button size="small" :disabled="!d.row" @click="showLogs(d.row)">流水</el-button>
        </div>
      </div>
    </el-drawer>

    <!-- 流水 -->
    <el-dialog v-model="logsDialog" title="登记流水" width="480px">
      <el-timeline>
        <el-timeline-item v-for="l in logs" :key="l.id" :timestamp="l.created_at">
          <span :class="l.hours >= 0 ? 'plus' : 'minus'">{{ l.hours >= 0 ? '+' : '' }}{{ l.hours }} 课时</span>
          <span v-if="l.note" class="muted"> —— {{ l.note }}</span>
        </el-timeline-item>
      </el-timeline>
      <el-empty v-if="!logs.length" description="暂无登记记录" />
    </el-dialog>
  </div>
</template>

<style scoped>
.cell { padding: 4px 2px; }
.cell-info { display: flex; align-items: center; gap: 8px; font-size: 12px; margin-top: 3px; }
.ellipsis { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 130px; }
.detail-row { border: 1px solid #ebeef5; border-radius: 6px; padding: 10px; margin-bottom: 10px; }
.detail-head { display: flex; align-items: center; gap: 10px; }
.detail-actions { margin-top: 8px; }
.plus { color: #67c23a; font-weight: 600; }
.minus { color: #f56c6c; font-weight: 600; }
</style>
