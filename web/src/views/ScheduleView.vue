<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  getClasses, getSchedule, createSchedule, updateSchedule, setScheduleStatus, deleteSchedule,
  getTodaySchedule, getSectionTimes
} from '../api/index.js';
import { WEEK_LABEL } from '../utils/math.js';

const classes = ref([]);
const entries = ref([]);
const sectionTimes = ref([]);
const filterClassId = ref(null);
const todayData = ref({ entries: [], today: '' });
const remindOn = ref(false);
const notifiedIds = new Set();

const MAX_SECTION = 12;

const todayWeekday = (new Date().getDay() + 6) % 7; // 周一=0
const curSection = computed(() => {
  const hm = new Date().toTimeString().slice(0, 5);
  for (const [n, range] of sectionTimes.value) {
    const [s, e] = range.split('-');
    if (hm >= s && hm <= e) return Number(n);
  }
  return 0;
});

const sections = computed(() => {
  const list = [];
  for (let i = 1; i <= MAX_SECTION; i++) {
    const t = sectionTimes.value.find((x) => String(x[0]) === String(i));
    list.push({ no: i, time: t ? t[1] : '' });
  }
  return list;
});

function entriesAt(wd, section) {
  return entries.value.filter((e) => e.weekday === wd && section >= e.start_section && section <= e.end_section);
}
function primaryEntry(wd, section) {
  // 只在本节课开始节次渲染完整卡片，其余节次渲染延续标记
  return entries.value.filter((e) => e.weekday === wd && e.start_section === section);
}

async function loadAll() {
  const [cls, st, today] = await Promise.all([getClasses(), getSectionTimes(), getTodaySchedule()]);
  classes.value = cls;
  sectionTimes.value = st;
  todayData.value = today;
  await loadEntries();
}

async function loadEntries() {
  entries.value = await getSchedule(filterClassId.value ? { class_id: filterClassId.value } : {});
}

function className(id) {
  return classes.value.find((c) => c.id === id)?.name || `班级#${id}`;
}
function timeOf(section) {
  const t = sectionTimes.value.find((x) => String(x[0]) === String(section));
  return t ? t[1] : '';
}

// ---------- 新增/编辑 ----------
const dialog = ref(false);
const form = ref({ id: null, class_id: null, weekday: 0, start_section: 1, end_section: 2, weeks: '1-16', location: '', note: '', status: 'normal' });

function openAdd(wd = 0, section = 1) {
  form.value = { id: null, class_id: filterClassId.value || null, weekday: wd, start_section: section, end_section: section + 1, weeks: '1-16', location: '', note: '', status: 'normal' };
  dialog.value = true;
}

function openEdit(e) {
  form.value = { ...e };
  dialog.value = true;
}

async function save() {
  const f = form.value;
  if (!f.class_id) return ElMessage.warning('请选择班级');
  if (f.end_section < f.start_section) return ElMessage.warning('结束节次不能早于开始节次');
  if (f.id) await updateSchedule(f.id, f);
  else await createSchedule(f);
  ElMessage.success('已保存');
  dialog.value = false;
  await loadEntries();
  await loadToday();
}

async function loadToday() {
  todayData.value = await getTodaySchedule();
}

async function markStatus(e, status) {
  const label = status === 'cancelled' ? '停课' : status === 'adjusted' ? '调课' : '恢复正常';
  let note = e.note || '';
  if (status !== 'normal') {
    const { value } = await ElMessageBox.prompt(`为该课程添加${label}备注（可选）`, `${label}`, { inputValue: note, inputPlaceholder: '如：调至周三第5-6节 / 因考试停课' });
    note = value || note;
  }
  await setScheduleStatus(e.id, { status, note });
  ElMessage.success(`已标记${label}`);
  await loadEntries();
}

async function remove(e) {
  await ElMessageBox.confirm(`删除「${className(e.class_id)}」${WEEK_LABEL[e.weekday]}第${e.start_section}-${e.end_section}节？`, '提示', { type: 'warning' });
  await deleteSchedule(e.id);
  ElMessage.success('已删除');
  await loadEntries();
}

function statusTagType(s) {
  return s === 'cancelled' ? 'danger' : s === 'adjusted' ? 'warning' : 'success';
}
function statusLabel(s) {
  return s === 'cancelled' ? '停课' : s === 'adjusted' ? '调课' : '正常';
}

// ---------- 上课提醒 ----------
let timer = null;
function toggleRemind(val) {
  if (val) {
    if (!('Notification' in window)) { ElMessage.warning('当前浏览器不支持桌面通知'); remindOn.value = false; return; }
    Notification.requestPermission().then((p) => {
      if (p !== 'granted') { ElMessage.warning('未获得通知权限，提醒功能不可用'); remindOn.value = false; }
    });
    timer = setInterval(checkRemind, 60000);
    checkRemind();
  } else if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

function checkRemind() {
  if (!remindOn.value) return;
  const now = new Date();
  const hm = now.toTimeString().slice(0, 5);
  const today = (now.getDay() + 6) % 7;
  for (const e of todayData.value.entries) {
    if (e.weekday !== today || e.status !== 'normal' || notifiedIds.has(e.id)) continue;
    const start = timeOf(e.start_section)?.split('-')[0];
    if (!start) continue;
    // 上课前 10 分钟内提醒
    const diff = (start.slice(0, 2) - hm.slice(0, 2)) * 60 + (start.slice(3) - hm.slice(3));
    if (diff >= -5 && diff <= 10) {
      notifiedIds.add(e.id);
      new Notification(`📚 即将上课：${e.class_name}`, {
        body: `${e.course_name} · ${e.location || ''} · 第${e.start_section}-${e.end_section}节（${start} 开始）`
      });
    }
  }
}

onMounted(async () => { await loadAll(); });
onUnmounted(() => { if (timer) clearInterval(timer); });
</script>

<template>
  <div>
    <!-- 今日课程 + 工具栏 -->
    <div class="page-card" style="margin-bottom: 14px;">
      <div class="today-line">
        <b>📅 {{ todayData.today }}</b>
        <template v-if="todayData.entries.length">
          <span v-for="e in todayData.entries" :key="e.id" class="today-chip">
            <el-tag size="small" :type="statusTagType(e.status)">{{ statusLabel(e.status) }}</el-tag>
            <b>{{ e.class_name }}</b> 第{{ e.start_section }}-{{ e.end_section }}节 {{ timeOf(e.start_section) }}
            <span class="muted">{{ e.location }} {{ e.note }}</span>
          </span>
        </template>
        <span v-else class="muted">今天没有课</span>
        <div class="spacer"></div>
        <el-switch v-model="remindOn" @change="toggleRemind" active-text="上课提醒（课前10分钟）" />
      </div>
      <div class="toolbar" style="margin-bottom:0; margin-top: 10px;">
        <el-select v-model="filterClassId" placeholder="全部班级" clearable style="width: 200px" @change="loadEntries">
          <el-option v-for="c in classes" :key="c.id" :value="c.id" :label="`${c.name}（${c.major || '专业未填'}）`" />
        </el-select>
        <el-button type="primary" @click="openAdd(todayWeekday, Math.max(1, curSection || 1))">＋ 添加课程</el-button>
        <span class="muted">点击格子中的课程卡片可编辑 / 调课 / 停课</span>
      </div>
    </div>

    <!-- 周视图网格 -->
    <div class="page-card">
      <el-table :data="sections" border size="small" style="width: 100%">
        <el-table-column label="节次 / 时间" width="110" fixed>
          <template #default="{ row }">
            <b>{{ row.no }}</b> <span class="muted">{{ row.time }}</span>
            <el-tag v-if="row.no === curSection" size="small" type="danger" style="margin-left:4px">现在</el-tag>
          </template>
        </el-table-column>
        <el-table-column v-for="(w, i) in WEEK_LABEL" :key="i" :label="`${w}${i === todayWeekday ? '（今天）' : ''}`" min-width="150">
          <template #default="{ row }">
            <div class="cell" :class="{ today: i === todayWeekday }" @click="openAdd(i, row.no)">
              <div v-for="e in primaryEntry(i, row.no)" :key="e.id" class="entry pointer" :class="e.status" @click.stop="openEdit(e)">
                <div class="entry-head">
                  <el-tag size="small" :type="statusTagType(e.status)">{{ statusLabel(e.status) }}</el-tag>
                  <span class="entry-sec">第{{ e.start_section }}-{{ e.end_section }}节</span>
                </div>
                <b>{{ e.class_name }}</b>
                <div class="muted">{{ e.course_name }} · {{ e.location || '—' }}</div>
                <div class="muted">第{{ e.weeks || '?' }}周</div>
                <div v-if="e.note" class="entry-note">{{ e.note }}</div>
                <div class="entry-actions">
                  <el-button size="small" text type="warning" @click.stop="markStatus(e, 'adjusted')">调课</el-button>
                  <el-button size="small" text type="danger" @click.stop="markStatus(e, 'cancelled')">停课</el-button>
                  <el-button size="small" text type="danger" @click.stop="remove(e)">删除</el-button>
                </div>
              </div>
              <div v-if="entriesAt(i, row.no).some((e) => e.start_section < row.no)" class="contin"></div>
            </div>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <!-- 新增/编辑弹窗 -->
    <el-dialog v-model="dialog" :title="form.id ? '编辑课程' : '添加课程'" width="500px">
      <el-form label-width="90px">
        <el-form-item label="班级" required>
          <el-select v-model="form.class_id" style="width: 100%" filterable>
            <el-option v-for="c in classes" :key="c.id" :value="c.id" :label="`${c.name}（${c.major || '专业未填'}）`" />
          </el-select>
        </el-form-item>
        <el-form-item label="星期">
          <el-radio-group v-model="form.weekday">
            <el-radio-button v-for="(w, i) in WEEK_LABEL" :key="i" :value="i">{{ w }}</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="节次">
          <el-select v-model="form.start_section" style="width: 110px">
            <el-option v-for="s in sections" :key="s.no" :value="s.no" :label="`${s.no}节 (${s.time})`" />
          </el-select>
          <span style="margin: 0 8px">至</span>
          <el-select v-model="form.end_section" style="width: 110px">
            <el-option v-for="s in sections" :key="s.no" :value="s.no" :label="`${s.no}节 (${s.time})`" />
          </el-select>
        </el-form-item>
        <el-form-item label="周次"><el-input v-model="form.weeks" placeholder="如：1-16 或 1,3,5-8" /></el-form-item>
        <el-form-item label="地点"><el-input v-model="form.location" placeholder="如：教1-201" /></el-form-item>
        <el-form-item label="备注"><el-input v-model="form.note" placeholder="调课 / 停课说明等" /></el-form-item>
        <el-form-item v-if="form.id" label="状态">
          <el-radio-group v-model="form.status">
            <el-radio-button value="normal">正常</el-radio-button>
            <el-radio-button value="adjusted">调课</el-radio-button>
            <el-radio-button value="cancelled">停课</el-radio-button>
          </el-radio-group>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialog = false">取消</el-button>
        <el-button type="primary" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.today-line { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.today-chip { display: inline-flex; align-items: center; gap: 6px; background: #f4f4f5; padding: 4px 10px; border-radius: 12px; font-size: 13px; }
.spacer { flex: 1; }
.cell { min-height: 52px; padding: 2px; }
.cell.today { background: #f0f9eb; }
.entry {
  border: 1px solid #d9ecff; background: #ecf5ff; border-radius: 5px;
  padding: 4px 6px; margin-bottom: 3px; font-size: 12px; position: relative;
}
.entry.adjusted { border-color: #e6a23c; background: #fdf6ec; }
.entry.cancelled { border-color: #f56c6c; background: #fef0f0; text-decoration: line-through; }
.entry-head { display: flex; align-items: center; gap: 5px; }
.entry-sec { color: #606266; }
.entry-note { color: #e6a23c; margin-top: 2px; }
.entry-actions { display: none; position: absolute; right: 2px; top: 2px; background: #fff; border: 1px solid #e4e7ed; border-radius: 4px; }
.entry:hover .entry-actions { display: flex; }
.contin { height: 2px; background: repeating-linear-gradient(90deg, #409eff 0 6px, transparent 6px 12px); margin: 1px 0; }
</style>
