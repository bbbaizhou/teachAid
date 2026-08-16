import { Router } from 'express';
import { db } from '../db.js';

const router = Router();

// ---------- 课程 ----------
router.get('/courses', (req, res) => {
  const rows = db.prepare(`
    SELECT c.*,
      (SELECT COUNT(*) FROM classes WHERE course_id = c.id) AS class_count,
      (SELECT COUNT(*) FROM chapters WHERE course_id = c.id) AS chapter_count
    FROM courses c ORDER BY c.id DESC
  `).all();
  res.json(rows);
});

router.post('/courses', (req, res) => {
  const { name, code = '', semester = '', total_hours = 48, chapters = [] } = req.body;
  if (!name) return res.status(400).json({ error: '课程名称不能为空' });
  const info = db.prepare('INSERT INTO courses (name, code, semester, total_hours) VALUES (?, ?, ?, ?)')
    .run(name, code, semester, total_hours);
  const id = Number(info.lastInsertRowid);
  // 支持一次粘贴多行章节：每行格式 "标题\t课时" 或 "标题,课时" 或 "标题"
  if (Array.isArray(chapters)) {
    const ins = db.prepare('INSERT INTO chapters (course_id, title, order_no, planned_hours) VALUES (?, ?, ?, ?)');
    chapters.forEach((ch, i) => ins.run(id, ch.title, i + 1, ch.planned_hours || 4));
  }
  res.json({ id });
});

router.put('/courses/:id', (req, res) => {
  const { name, code, semester, total_hours } = req.body;
  const r = db.prepare('UPDATE courses SET name = ?, code = ?, semester = ?, total_hours = ? WHERE id = ?')
    .run(name, code ?? '', semester ?? '', total_hours ?? 48, req.params.id);
  if (!r.changes) return res.status(404).json({ error: '课程不存在' });
  res.json({ ok: true });
});

router.delete('/courses/:id', (req, res) => {
  db.prepare('DELETE FROM courses WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

router.get('/courses/:id', (req, res) => {
  const course = db.prepare('SELECT * FROM courses WHERE id = ?').get(req.params.id);
  if (!course) return res.status(404).json({ error: '课程不存在' });
  const classes = db.prepare('SELECT * FROM classes WHERE course_id = ? ORDER BY id').all(course.id);
  const chapters = db.prepare('SELECT * FROM chapters WHERE course_id = ? ORDER BY order_no, id').all(course.id);
  res.json({ ...course, classes, chapters });
});

// ---------- 班级 ----------
router.get('/classes', (req, res) => {
  const rows = db.prepare(`
    SELECT cl.*, c.name AS course_name, c.semester AS course_semester
    FROM classes cl JOIN courses c ON c.id = cl.course_id ORDER BY cl.id DESC
  `).all();
  res.json(rows);
});

router.post('/classes', (req, res) => {
  const { course_id, name, major = '', student_count = 0, note = '' } = req.body;
  if (!course_id || !name) return res.status(400).json({ error: '课程与班级名称不能为空' });
  const info = db.prepare('INSERT INTO classes (course_id, name, major, student_count, note) VALUES (?, ?, ?, ?, ?)')
    .run(course_id, name, major, student_count, note);
  res.json({ id: Number(info.lastInsertRowid) });
});

router.put('/classes/:id', (req, res) => {
  const { name, major, student_count, note } = req.body;
  db.prepare('UPDATE classes SET name = ?, major = ?, student_count = ?, note = ? WHERE id = ?')
    .run(name, major ?? '', student_count ?? 0, note ?? '', req.params.id);
  res.json({ ok: true });
});

router.delete('/classes/:id', (req, res) => {
  db.prepare('DELETE FROM classes WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ---------- 章节 ----------
router.post('/chapters', (req, res) => {
  const { course_id, title, order_no = 0, planned_hours = 4, knowledge_points = '' } = req.body;
  if (!course_id || !title) return res.status(400).json({ error: '课程与章节标题不能为空' });
  const info = db.prepare('INSERT INTO chapters (course_id, title, order_no, planned_hours, knowledge_points) VALUES (?, ?, ?, ?, ?)')
    .run(course_id, title, order_no, planned_hours, knowledge_points);
  res.json({ id: Number(info.lastInsertRowid) });
});

router.put('/chapters/:id', (req, res) => {
  const { title, order_no, planned_hours, knowledge_points } = req.body;
  db.prepare('UPDATE chapters SET title = ?, order_no = ?, planned_hours = ?, knowledge_points = ? WHERE id = ?')
    .run(title, order_no ?? 0, planned_hours ?? 4, knowledge_points ?? '', req.params.id);
  res.json({ ok: true });
});

router.delete('/chapters/:id', (req, res) => {
  db.prepare('DELETE FROM chapters WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

export default router;
