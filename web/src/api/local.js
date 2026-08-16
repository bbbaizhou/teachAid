// 浏览器本地模式 API：使用 IndexedDB 实现与后端完全一致的接口
// （函数签名与 http.js 一一对应，由 api/index.js 按模式分发）
import {
  dbAll, dbGet, dbPut, dbDel, dbClear, now, seedIfNeeded
} from '../db/browser-db.js';
import {
  chat, hasApiKeyLocal, buildIntroPrompt, buildExercisePrompt, buildSizhengPrompt, parseExercises, testConnectionLocal
} from '../utils/aiPrompts.js';
import { progressMarkdown, exercisesMarkdown, downloadText, downloadDocx } from '../utils/exportMd.js';

export async function initLocal() {
  await seedIfNeeded();
}

// ---------- 课程 / 班级 / 章节 ----------
export async function getCourses() {
  const courses = await dbAll('courses');
  const classes = await dbAll('classes');
  const chapters = await dbAll('chapters');
  return courses
    .map((c) => ({
      ...c,
      class_count: classes.filter((x) => x.course_id === c.id).length,
      chapter_count: chapters.filter((x) => x.course_id === c.id).length
    }))
    .sort((a, b) => b.id - a.id);
}

export async function createCourse(data) {
  const { name, code = '', semester = '', total_hours = 48, chapters = [] } = data;
  if (!name) throw new Error('课程名称不能为空');
  const id = await dbPut('courses', { name, code, semester, total_hours });
  if (Array.isArray(chapters)) {
    for (const [i, ch] of chapters.entries()) {
      await dbPut('chapters', { course_id: id, title: ch.title, order_no: i + 1, planned_hours: ch.planned_hours || 4 });
    }
  }
  return { id };
}

export async function updateCourse(id, data) {
  const cur = await dbGet('courses', id);
  await dbPut('courses', { ...cur, name: data.name, code: data.code ?? '', semester: data.semester ?? '', total_hours: data.total_hours ?? 48 });
  return { ok: true };
}

export async function deleteCourse(id) {
  const classes = (await dbAll('classes')).filter((c) => c.course_id === id);
  const chapters = (await dbAll('chapters')).filter((c) => c.course_id === id);
  const chapterIds = chapters.map((c) => c.id);
  const classIds = classes.map((c) => c.id);
  // 进度 + 流水
  for (const p of (await dbAll('progress')).filter((x) => classIds.includes(x.class_id))) {
    await delProgressWithLogs(p.id);
  }
  // 课表
  for (const s of (await dbAll('schedule_entries')).filter((x) => classIds.includes(x.class_id))) {
    await dbDel('schedule_entries', s.id);
  }
  // 备课（章节级 + 附件）
  for (const it of (await dbAll('prep_items')).filter((x) => x.chapter_id && chapterIds.includes(x.chapter_id))) {
    await deletePrepItem(it.id);
  }
  // 题库 + AI 记录
  for (const b of (await dbAll('question_bank')).filter((x) => chapterIds.includes(x.chapter_id))) {
    await dbDel('question_bank', b.id);
  }
  for (const a of (await dbAll('ai_records')).filter((x) => chapterIds.includes(x.chapter_id))) {
    await dbDel('ai_records', a.id);
  }
  for (const c of chapters) await dbDel('chapters', c.id);
  for (const c of classes) await dbDel('classes', c.id);
  await dbDel('courses', id);
  return { ok: true };
}

export async function getCourseDetail(id) {
  const course = await dbGet('courses', id);
  const classes = (await dbAll('classes')).filter((c) => c.course_id === id).sort((a, b) => a.id - b.id);
  const chapters = (await dbAll('chapters')).filter((c) => c.course_id === id)
    .sort((a, b) => (a.order_no - b.order_no) || (a.id - b.id));
  return { ...course, classes, chapters };
}

export async function getClasses() {
  const classes = await dbAll('classes');
  const courses = await dbAll('courses');
  return classes
    .map((c) => ({ ...c, course_name: courses.find((x) => x.id === c.course_id)?.name || '', course_semester: courses.find((x) => x.id === c.course_id)?.semester || '' }))
    .sort((a, b) => b.id - a.id);
}

export async function createClass(data) {
  const { course_id, name, major = '', student_count = 0, note = '' } = data;
  if (!course_id || !name) throw new Error('课程与班级名称不能为空');
  const id = await dbPut('classes', { course_id, name, major, student_count, note });
  return { id };
}

export async function updateClass(id, data) {
  const cur = await dbGet('classes', id);
  await dbPut('classes', { ...cur, name: data.name, major: data.major ?? '', student_count: data.student_count ?? 0, note: data.note ?? '' });
  return { ok: true };
}

export async function deleteClass(id) {
  for (const p of (await dbAll('progress')).filter((x) => x.class_id === id)) {
    await delProgressWithLogs(p.id);
  }
  for (const s of (await dbAll('schedule_entries')).filter((x) => x.class_id === id)) {
    await dbDel('schedule_entries', s.id);
  }
  await dbDel('classes', id);
  return { ok: true };
}

export async function createChapter(data) {
  const { course_id, title, order_no = 0, planned_hours = 4, knowledge_points = '' } = data;
  if (!course_id || !title) throw new Error('课程与章节标题不能为空');
  const id = await dbPut('chapters', { course_id, title, order_no, planned_hours, knowledge_points });
  return { id };
}

export async function updateChapter(id, data) {
  const cur = await dbGet('chapters', id);
  await dbPut('chapters', {
    ...cur,
    title: data.title ?? cur.title,
    order_no: data.order_no ?? 0,
    planned_hours: data.planned_hours ?? 4,
    knowledge_points: data.knowledge_points ?? ''
  });
  return { ok: true };
}

export async function deleteChapter(id) {
  for (const p of (await dbAll('progress')).filter((x) => x.chapter_id === id)) {
    await delProgressWithLogs(p.id);
  }
  for (const it of (await dbAll('prep_items')).filter((x) => x.chapter_id === id)) {
    await deletePrepItem(it.id);
  }
  for (const b of (await dbAll('question_bank')).filter((x) => x.chapter_id === id)) {
    await dbDel('question_bank', b.id);
  }
  for (const a of (await dbAll('ai_records')).filter((x) => x.chapter_id === id)) {
    await dbDel('ai_records', a.id);
  }
  await dbDel('chapters', id);
  return { ok: true };
}

// ---------- 进度 ----------
async function delProgressWithLogs(id) {
  for (const l of (await dbAll('progress_logs')).filter((x) => x.progress_id === id)) {
    await dbDel('progress_logs', l.id);
  }
  await dbDel('progress', id);
}

export async function getProgressBoard(courseId) {
  const course = await dbGet('courses', courseId);
  const classes = (await dbAll('classes')).filter((c) => c.course_id === courseId).sort((a, b) => a.id - b.id);
  const chapters = (await dbAll('chapters')).filter((c) => c.course_id === courseId)
    .sort((a, b) => (a.order_no - b.order_no) || (a.id - b.id));
  const rows = (await dbAll('progress')).filter((p) => classes.some((c) => c.id === p.class_id));
  const byKey = new Map(rows.map((r) => [`${r.class_id}:${r.chapter_id}`, r]));
  const board = [];
  for (const cls of classes) {
    for (const ch of chapters) {
      const p = byKey.get(`${cls.id}:${ch.id}`) || {
        id: null, class_id: cls.id, chapter_id: ch.id, taught_hours: 0,
        status: 'not_started', current_point: '', note: '', updated_at: null
      };
      const pct = ch.planned_hours > 0 ? Math.min(100, Math.round((p.taught_hours / ch.planned_hours) * 100)) : 0;
      board.push({ ...p, planned_hours: ch.planned_hours, chapter_title: ch.title, order_no: ch.order_no, pct });
    }
  }
  return { course, classes, chapters, board };
}

export async function logProgress(data) {
  const { class_id, chapter_id, hours, note = '' } = data;
  if (!class_id || !chapter_id) throw new Error('缺少班级或章节');
  const h = Number(hours);
  if (Number.isNaN(h)) throw new Error('课时必须是数字');
  let progressId;
  const p = (await dbAll('progress')).find((x) => x.class_id === class_id && x.chapter_id === chapter_id);
  if (p) {
    const newHours = Math.max(0, Number(p.taught_hours) + h);
    await dbPut('progress', { ...p, taught_hours: newHours, note: note ? note : p.note, updated_at: now() });
    progressId = p.id;
  } else {
    progressId = await dbPut('progress', {
      class_id, chapter_id, taught_hours: Math.max(0, h), status: 'in_progress', current_point: '', note, updated_at: now()
    });
  }
  await dbPut('progress_logs', { progress_id: progressId, hours: h, note, created_at: now() });
  return dbGet('progress', progressId);
}

export async function updateProgress(id, data) {
  const p = await dbGet('progress', id);
  if (!p) throw new Error('进度记录不存在');
  await dbPut('progress', {
    ...p,
    taught_hours: data.taught_hours ?? p.taught_hours,
    status: data.status ?? p.status,
    current_point: data.current_point ?? p.current_point,
    note: data.note ?? p.note,
    updated_at: now()
  });
  return dbGet('progress', id);
}

export async function getProgressLogs(id) {
  return (await dbAll('progress_logs')).filter((x) => x.progress_id === id).sort((a, b) => b.id - a.id);
}

// ---------- 课表 ----------
function joinSchedule(entries) {
  return Promise.all(entries.map(async (e) => {
    const cl = await dbGet('classes', e.class_id);
    const co = cl ? await dbGet('courses', cl.course_id) : null;
    return { ...e, class_name: cl?.name || '', major: cl?.major || '', course_name: co?.name || '' };
  }));
}

export async function getSchedule(params = {}) {
  const { weekday, class_id, course_id } = params;
  let entries = await dbAll('schedule_entries');
  if (weekday !== undefined && weekday !== '') entries = entries.filter((e) => e.weekday === Number(weekday));
  if (class_id) entries = entries.filter((e) => e.class_id === Number(class_id));
  if (course_id) {
    const classes = (await dbAll('classes')).filter((c) => c.course_id === Number(course_id));
    const ids = new Set(classes.map((c) => c.id));
    entries = entries.filter((e) => ids.has(e.class_id));
  }
  entries = entries.sort((a, b) => (a.weekday - b.weekday) || (a.start_section - b.start_section) || (a.id - b.id));
  return joinSchedule(entries);
}

export async function createSchedule(data) {
  const { class_id, weekday, start_section, end_section, weeks = '', location = '', note = '', status = 'normal' } = data;
  if (!class_id || weekday === undefined || !start_section) throw new Error('班级、星期、起始节次为必填项');
  const id = await dbPut('schedule_entries', {
    class_id, weekday: Number(weekday), start_section: Number(start_section),
    end_section: Number(end_section || start_section), weeks, location, note, status
  });
  return { id };
}

export async function updateSchedule(id, data) {
  const e = await dbGet('schedule_entries', id);
  await dbPut('schedule_entries', {
    ...e,
    class_id: data.class_id ?? e.class_id,
    weekday: data.weekday ?? e.weekday,
    start_section: data.start_section ?? e.start_section,
    end_section: data.end_section ?? e.end_section,
    weeks: data.weeks ?? e.weeks,
    location: data.location ?? e.location,
    note: data.note ?? e.note,
    status: data.status ?? e.status
  });
  return { ok: true };
}

export async function setScheduleStatus(id, data) {
  const e = await dbGet('schedule_entries', id);
  await dbPut('schedule_entries', { ...e, status: data.status || 'normal', note: data.note ?? '' });
  return { ok: true };
}

export async function deleteSchedule(id) {
  await dbDel('schedule_entries', id);
  return { ok: true };
}

export async function getTodaySchedule() {
  const weekday = (new Date().getDay() + 6) % 7;
  const entries = (await dbAll('schedule_entries')).filter((e) => e.weekday === weekday).sort((a, b) => a.start_section - b.start_section);
  return {
    weekday,
    today: new Date().toLocaleDateString('zh-CN', { weekday: 'long', month: 'long', day: 'numeric' }),
    entries: await joinSchedule(entries)
  };
}

export async function getSectionTimes() {
  return (await dbGet('settings', 'sectionTimes'))?.value || [];
}

// ---------- 备课 ----------
export async function getPrepItems(params = {}) {
  const { course_id, chapter_id, tag, q } = params;
  let items = await dbAll('prep_items');
  const chapters = await dbAll('chapters');
  const courses = await dbAll('courses');
  if (course_id) {
    const chapterIds = new Set(chapters.filter((c) => c.course_id === Number(course_id)).map((c) => c.id));
    items = items.filter((it) => it.chapter_id === null || it.chapter_id === undefined || chapterIds.has(it.chapter_id));
  }
  if (chapter_id) items = items.filter((it) => it.chapter_id === Number(chapter_id));
  if (tag) items = items.filter((it) => (',' + it.tags + ',').includes(',' + tag + ','));
  if (q) {
    const k = String(q).toLowerCase();
    items = items.filter((it) => (it.title + ' ' + (it.content || '') + ' ' + (it.knowledge_point || '')).toLowerCase().includes(k));
  }
  const attachments = await dbAll('prep_attachments');
  const enriched = await Promise.all(items.map(async (it) => {
    const ch = it.chapter_id ? chapters.find((c) => c.id === it.chapter_id) : null;
    const co = ch ? courses.find((c) => c.id === ch.course_id) : null;
    return {
      ...it,
      chapter_title: ch?.title || '',
      course_name: co?.name || '',
      attach_count: attachments.filter((a) => a.prep_id === it.id).length
    };
  }));
  enriched.sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || '') || b.id - a.id);
  return enriched;
}

export async function getPrepItem(id) {
  const item = await dbGet('prep_items', id);
  if (!item) throw new Error('资料不存在');
  const attachments = (await dbAll('prep_attachments')).filter((a) => a.prep_id === id).sort((a, b) => a.id - b.id);
  return { ...item, attachments: attachments.map((a) => ({ ...a, url: a.blob ? URL.createObjectURL(a.blob) : a.url })) };
}

export async function createPrepItem(data) {
  const { chapter_id = null, knowledge_point = '', title, content = '', tags = '' } = data;
  if (!title) throw new Error('标题不能为空');
  const id = await dbPut('prep_items', {
    chapter_id: chapter_id || null, knowledge_point, title, content, tags, created_at: now(), updated_at: now()
  });
  return { id };
}

export async function updatePrepItem(id, data) {
  const cur = await dbGet('prep_items', id);
  await dbPut('prep_items', {
    ...cur,
    chapter_id: data.chapter_id !== undefined ? data.chapter_id : cur.chapter_id,
    knowledge_point: data.knowledge_point !== undefined ? data.knowledge_point : cur.knowledge_point,
    title: data.title ?? cur.title,
    content: data.content ?? cur.content,
    tags: data.tags ?? cur.tags,
    updated_at: now()
  });
  return { ok: true };
}

export async function deletePrepItem(id) {
  for (const a of (await dbAll('prep_attachments')).filter((x) => x.prep_id === id)) {
    await dbDel('prep_attachments', a.id);
  }
  await dbDel('prep_items', id);
  return { ok: true };
}

// ---------- 附件 ----------
export async function uploadPrepFile(file) {
  const id = await dbPut('prep_attachments', {
    prep_id: 0, filename: file.name, size: file.size, blob: file, created_at: now()
  });
  return { filename: file.name, url: `local://${id}`, size: file.size };
}

export async function addAttachment(prepId, data) {
  const existing = (await dbAll('prep_attachments')).find((a) => a.url === data.url);
  if (existing) {
    await dbPut('prep_attachments', { ...existing, prep_id: prepId });
    return { id: existing.id };
  }
  const id = await dbPut('prep_attachments', {
    prep_id: prepId, filename: data.filename, url: data.url, size: data.size || 0, created_at: now()
  });
  return { id };
}

export async function deleteAttachment(id) {
  await dbDel('prep_attachments', id);
  return { ok: true };
}

export async function packageChapter(chapterId) {
  const chapter = await dbGet('chapters', chapterId);
  const items = (await dbAll('prep_items')).filter((x) => x.chapter_id === chapterId).sort((a, b) => a.id - b.id);
  const atts = (await dbAll('prep_attachments')).filter((a) => items.some((it) => it.id === a.prep_id));
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  items.forEach((it, i) => {
    const md = `# ${it.title}\n\n${it.tags ? `标签：${it.tags}\n\n` : ''}${it.knowledge_point ? `所属知识点：${it.knowledge_point}\n\n` : ''}${it.content || ''}\n`;
    zip.file(`${String(i + 1).padStart(2, '0')}-${it.title.replace(/[\\/:*?"<>|]/g, '_').slice(0, 40)}.md`, md);
    atts.filter((a) => a.prep_id === it.id).forEach((a) => {
      if (a.blob) zip.file(`附件/${it.title.replace(/[\\/:*?"<>|]/g, '_').slice(0, 30)}-${a.filename}`, a.blob);
    });
  });
  if (!items.length) zip.file('说明.txt', '（该章节暂无备课资料）');
  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${chapter.title}.zip`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
  return { ok: true };
}

// ---------- AI ----------
export async function getAiStatus() {
  return { hasKey: await hasApiKeyLocal() };
}

export async function testAi() {
  return testConnectionLocal();
}

export async function generateIntro(data) {
  const { chapter_id, title, knowledge_points, major, style = 'life', extra = '' } = data;
  if (!chapter_id && !title) throw new Error('请选择章节');
  const chapter = chapter_id ? await dbGet('chapters', chapter_id) : null;
  const chapterTitle = chapter?.title || title;
  const kps = chapter?.knowledge_points || knowledge_points || '';
  const messages = buildIntroPrompt({ chapterTitle, knowledgePoints: kps, major, style, extra });
  const content = (await chat(messages, { temperature: 0.8 })).trim();
  const id = await dbPut('ai_records', {
    type: 'intro', chapter_id: chapter?.id || null, major: major || '', style,
    config: JSON.stringify({ extra }), content, created_at: now()
  });
  return { id, content };
}

export async function generateSizheng(data) {
  const { chapter_id, title, knowledge_points, major, theme = 'comprehensive', withScript = false, extra = '' } = data;
  if (!chapter_id && !title) throw new Error('请选择章节');
  const chapter = chapter_id ? await dbGet('chapters', chapter_id) : null;
  const chapterTitle = chapter?.title || title;
  const kps = chapter?.knowledge_points || knowledge_points || '';
  const messages = buildSizhengPrompt({ chapterTitle, knowledgePoints: kps, major, theme, withScript, extra });
  const content = (await chat(messages, { temperature: 0.8 })).trim();
  const id = await dbPut('ai_records', {
    type: 'sz', chapter_id: chapter?.id || null, major: major || '', style: theme,
    config: JSON.stringify({ withScript, extra }), content, created_at: now()
  });
  return { id, content };
}

export async function generateExercises(data) {
  const { chapter_id, title, knowledge_points, major = '', counts = {}, types = [], extra = '', use_mistakes = false } = data;
  if (!chapter_id && !title) throw new Error('请选择章节');
  const chapter = chapter_id ? await dbGet('chapters', chapter_id) : null;
  const chapterTitle = chapter?.title || title;
  const kps = chapter?.knowledge_points || knowledge_points || '';
  let mistakeHints = '';
  if (use_mistakes && chapter) {
    const rows = (await dbAll('question_bank'))
      .filter((x) => x.chapter_id === chapter.id && x.is_mistake === 1)
      .sort((a, b) => b.id - a.id)
      .slice(0, 5);
    mistakeHints = rows.map((r) => `- ${r.question}`).join('\n');
  }
  const messages = buildExercisePrompt({ chapterTitle, knowledgePoints: kps, major, counts, types, extra, mistakeHints });
  const raw = await chat(messages, { temperature: 0.7 });
  const items = parseExercises(raw);
  const id = await dbPut('ai_records', {
    type: 'exercise', chapter_id: chapter?.id || null, major: major || '', style: 'generated',
    config: JSON.stringify({ counts, types, extra, use_mistakes, chapterTitle }),
    content: JSON.stringify(items), created_at: now()
  });
  return { id, items, raw };
}

export async function getAiRecords(type) {
  const records = await dbAll('ai_records');
  const chapters = await dbAll('chapters');
  let list = type ? records.filter((r) => r.type === type) : records;
  list = list.map((r) => ({
    ...r,
    chapter_title: r.chapter_id ? chapters.find((c) => c.id === r.chapter_id)?.title || '' : ''
  }));
  list.sort((a, b) => b.id - a.id);
  return list.slice(0, 50);
}

export async function getAiRecord(id) {
  const r = await dbGet('ai_records', id);
  if (!r) throw new Error('记录不存在');
  const out = { ...r };
  if (r.type === 'exercise') { try { out.items = JSON.parse(r.content); } catch { out.items = []; } }
  return out;
}

export async function saveRecordToPrep(id, data) {
  const record = await dbGet('ai_records', id);
  if (!record) throw new Error('记录不存在');
  const { chapter_id, title, tags = '', knowledge_point = '' } = data;
  const content = record.type === 'exercise'
    ? (() => { try { return JSON.stringify(JSON.parse(record.content), null, 2); } catch { return record.content; } })()
    : record.content;
  const chapterTitle = record.chapter_id
    ? (await dbGet('chapters', record.chapter_id))?.title || ''
    : '';
  const defaultTitle = record.type === 'intro'
    ? `课堂导入：${chapterTitle || (record.major ? `面向${record.major}` : '')}`
    : record.type === 'sz'
      ? `课程思政设计：${chapterTitle || (record.major ? `面向${record.major}` : '')}`
      : '练习题组';
  const newId = await createPrepItem({
    chapter_id: chapter_id || record.chapter_id || null,
    knowledge_point,
    title: title || defaultTitle,
    content,
    tags: tags || '课程思政'
  });
  return { id: newId.id };
}

// ---------- 题库 ----------
export async function getBankItems(params = {}) {
  const { chapter_id, difficulty, type, is_mistake, q, course_id } = params;
  let items = await dbAll('question_bank');
  const chapters = await dbAll('chapters');
  const courses = await dbAll('courses');
  if (chapter_id) items = items.filter((b) => b.chapter_id === Number(chapter_id));
  if (course_id) {
    const chapterIds = new Set(chapters.filter((c) => c.course_id === Number(course_id)).map((c) => c.id));
    items = items.filter((b) => chapterIds.has(b.chapter_id));
  }
  if (difficulty) items = items.filter((b) => b.difficulty === difficulty);
  if (type) items = items.filter((b) => b.type === type);
  if (is_mistake !== undefined && is_mistake !== '') items = items.filter((b) => b.is_mistake === Number(is_mistake));
  if (q) {
    const k = String(q).toLowerCase();
    items = items.filter((b) => ((b.question || '') + ' ' + (b.solution || '')).toLowerCase().includes(k));
  }
  const enriched = items.map((b) => {
    const ch = b.chapter_id ? chapters.find((c) => c.id === b.chapter_id) : null;
    const co = ch ? courses.find((c) => c.id === ch.course_id) : null;
    return { ...b, chapter_title: ch?.title || '', course_name: co?.name || '' };
  });
  enriched.sort((a, b) => b.id - a.id);
  return enriched;
}

export async function createBankItem(data) {
  const { chapter_id = null, difficulty = 'basic', type = 'calc', question, answer = '', solution = '', source = '', is_mistake = 0 } = data;
  if (!question) throw new Error('题目内容不能为空');
  const id = await dbPut('question_bank', {
    chapter_id: chapter_id || null, difficulty, type, question, answer, solution, source,
    is_mistake: is_mistake ? 1 : 0, created_at: now()
  });
  return { id };
}

export async function importBankItems(items) {
  if (!Array.isArray(items) || !items.length) throw new Error('没有可导入的题目');
  for (const it of items) {
    await dbPut('question_bank', {
      chapter_id: it.chapter_id || null,
      difficulty: it.difficulty || 'basic',
      type: it.type || 'calc',
      question: it.question,
      answer: it.answer || '',
      solution: it.solution || '',
      source: it.source || '',
      is_mistake: it.is_mistake ? 1 : 0,
      created_at: now()
    });
  }
  return { ok: true, count: items.length };
}

export async function updateBankItem(id, data) {
  const b = await dbGet('question_bank', id);
  await dbPut('question_bank', {
    ...b,
    chapter_id: data.chapter_id !== undefined ? data.chapter_id : b.chapter_id,
    difficulty: data.difficulty ?? b.difficulty,
    type: data.type ?? b.type,
    question: data.question ?? b.question,
    answer: data.answer ?? b.answer,
    solution: data.solution ?? b.solution,
    source: data.source ?? b.source,
    is_mistake: data.is_mistake !== undefined ? (data.is_mistake ? 1 : 0) : b.is_mistake
  });
  return { ok: true };
}

export async function deleteBankItem(id) {
  await dbDel('question_bank', id);
  return { ok: true };
}

// ---------- 设置 ----------
export async function getSettings() {
  const ai = (await dbGet('settings', 'ai'))?.value || {};
  return {
    ai: {
      provider: ai.provider || 'deepseek',
      model: ai.model || 'deepseek-chat',
      baseUrl: ai.baseUrl || 'https://api.deepseek.com',
      temperature: Number(ai.temperature ?? 0.8),
      hasKey: !!(ai.apiKey)
    },
    majors: (await dbGet('settings', 'majors'))?.value || [],
    sectionTimes: (await dbGet('settings', 'sectionTimes'))?.value || [],
    app: (await dbGet('settings', 'app'))?.value || { name: '高数教学辅助系统', version: '0.2.0' },
    dataDir: ''
  };
}

export async function saveSettings(data) {
  const { ai, majors, sectionTimes } = data;
  if (ai) {
    const cur = (await dbGet('settings', 'ai'))?.value || {};
    const next = { ...cur, ...ai };
    if (ai.apiKey === '****') next.apiKey = cur.apiKey;
    if (next.apiKey !== undefined) next.apiKey = String(next.apiKey).trim();
    await dbPut('settings', { id: 'ai', value: next });
  }
  if (Array.isArray(majors)) await dbPut('settings', { id: 'majors', value: majors.filter(Boolean) });
  if (Array.isArray(sectionTimes)) await dbPut('settings', { id: 'sectionTimes', value: sectionTimes });
  return { ok: true };
}

export async function getNetworkInfo() {
  return { list: [], port: 0 };
}

// ---------- 导出（客户端生成） ----------
export async function exportProgress(courseId, format = 'md') {
  const board = await getProgressBoard(courseId);
  const { course, classes, chapters } = board;
  const md = progressMarkdown({ course, classes, chapters, board: board.board });
  if (format === 'docx') {
    await downloadDocx(md, course.name + '-进度档案');
  } else {
    downloadText(md, course.name + '-进度档案.md');
  }
  return { ok: true };
}

export async function exportExercises(recordId, format = 'md') {
  const record = await dbGet('ai_records', recordId);
  if (!record || record.type !== 'exercise') throw new Error('习题记录不存在');
  let items = [];
  try { items = JSON.parse(record.content); } catch { /* ignore */ }
  if (!items.length) throw new Error('该记录没有题目内容');
  let config = {};
  try { config = JSON.parse(record.config || '{}'); } catch { /* ignore */ }
  const title = `练习题：${config.chapterTitle || '高数习题'}`;
  const md = exercisesMarkdown({ title, items });
  if (format === 'docx') {
    await downloadDocx(md, title);
  } else {
    downloadText(md, title + '.md');
  }
  return { ok: true };
}

// ---------- 备份：导出/导入 JSON（统一命名，与 http 模式对齐） ----------
export async function exportData() {
  return backupExport();
}

export async function importData(file) {
  return backupImport(file);
}

export async function backupExport() {
  const dump = {};
  for (const s of ['courses', 'classes', 'chapters', 'progress', 'progress_logs', 'schedule_entries', 'prep_items', 'prep_attachments', 'ai_records', 'question_bank']) {
    const rows = await dbAll(s);
    dump[s] = await Promise.all(rows.map(async (r) => {
      const out = { ...r };
      if (r.blob) {
        out.blobBase64 = await blobToBase64(r.blob);
        delete out.blob;
      }
      return out;
    }));
  }
  const settings = await dbAll('settings');
  dump.settings = settings.filter((s) => s.id !== 'seeded');
  const json = JSON.stringify({ app: 'teachaid', version: 1, exportedAt: now(), data: dump }, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `teachaid-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
  return { ok: true };
}

export async function backupImport(file) {
  const text = await file.text();
  const parsed = JSON.parse(text);
  if (parsed.app !== 'teachaid' || !parsed.data) throw new Error('不是有效的备份文件');
  // 清空并恢复
  for (const s of ['courses', 'classes', 'chapters', 'progress', 'progress_logs', 'schedule_entries', 'prep_items', 'prep_attachments', 'ai_records', 'question_bank', 'settings']) {
    await dbClear(s);
  }
  for (const s of Object.keys(parsed.data)) {
    for (const row of parsed.data[s] || []) {
      const r = { ...row };
      // 保留原 id：保证外键（course_id/chapter_id 等）在恢复后仍然一致；
      // IndexedDB 插入显式 id 会自动更新自增计数器。
      if (r.blobBase64) {
        r.blob = base64ToBlob(r.blobBase64);
        delete r.blobBase64;
      }
      await dbPut(s, r);
    }
  }
  await dbPut('settings', { id: 'seeded', value: true });
  return { ok: true };
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result).split(',')[1] || '');
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(blob);
  });
}

function base64ToBlob(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes]);
}
