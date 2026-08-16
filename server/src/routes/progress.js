import { Router } from 'express';
import { db, now } from '../db.js';

const router = Router();

/** 进度看板：给定课程，返回每个班级 × 每个章节的进度行 */
router.get('/board', (req, res) => {
  const courseId = Number(req.query.course_id);
  if (!courseId) return res.status(400).json({ error: '缺少 course_id' });
  const course = db.prepare('SELECT * FROM courses WHERE id = ?').get(courseId);
  if (!course) return res.status(404).json({ error: '课程不存在' });
  const classes = db.prepare('SELECT * FROM classes WHERE course_id = ? ORDER BY id').all(courseId);
  const chapters = db.prepare('SELECT * FROM chapters WHERE course_id = ? ORDER BY order_no, id').all(courseId);
  const rows = db.prepare(`
    SELECT p.*, c.title AS chapter_title, c.planned_hours AS planned_hours, c.order_no
    FROM progress p JOIN chapters c ON c.id = p.chapter_id
    WHERE c.course_id = ? ORDER BY c.order_no, c.id
  `).all(courseId);
  const byKey = new Map(rows.map((r) => [`${r.class_id}:${r.chapter_id}`, r]));
  const board = [];
  for (const cls of classes) {
    for (const ch of chapters) {
      const p = byKey.get(`${cls.id}:${ch.id}`) || {
        class_id: cls.id, chapter_id: ch.id, taught_hours: 0,
        status: 'not_started', current_point: '', note: '', id: null, updated_at: null
      };
      const pct = ch.planned_hours > 0 ? Math.min(100, Math.round((p.taught_hours / ch.planned_hours) * 100)) : 0;
      board.push({ ...p, planned_hours: ch.planned_hours, chapter_title: ch.title, order_no: ch.order_no, pct });
    }
  }
  res.json({ course, classes, chapters, board });
});

/** 登记一次课时（正数增加、负数微调），并写流水 */
router.post('/log', (req, res) => {
  const { class_id, chapter_id, hours, note = '' } = req.body;
  if (!class_id || !chapter_id) return res.status(400).json({ error: '缺少班级或章节' });
  const h = Number(hours);
  if (Number.isNaN(h)) return res.status(400).json({ error: '课时必须是数字' });
  const p = db.prepare('SELECT * FROM progress WHERE class_id = ? AND chapter_id = ?').get(class_id, chapter_id);
  let progressId;
  if (p) {
    const newHours = Math.max(0, Number(p.taught_hours) + h);
    db.prepare('UPDATE progress SET taught_hours = ?, note = CASE WHEN ? != \'\' THEN ? ELSE note END, updated_at = ? WHERE id = ?')
      .run(newHours, note, note, now(), p.id);
    progressId = p.id;
  } else {
    const info = db.prepare('INSERT INTO progress (class_id, chapter_id, taught_hours, status, updated_at) VALUES (?, ?, ?, \'in_progress\', ?)')
      .run(class_id, chapter_id, Math.max(0, h), now());
    progressId = Number(info.lastInsertRowid);
  }
  db.prepare('INSERT INTO progress_logs (progress_id, hours, note) VALUES (?, ?, ?)').run(progressId, h, note);
  const row = db.prepare('SELECT * FROM progress WHERE id = ?').get(progressId);
  res.json(row);
});

/** 手动调整某条进度（状态/当前知识点/备注/直接改已授课时） */
router.put('/:id', (req, res) => {
  const { taught_hours, status, current_point, note } = req.body;
  const p = db.prepare('SELECT * FROM progress WHERE id = ?').get(req.params.id);
  if (!p) return res.status(404).json({ error: '进度记录不存在' });
  db.prepare('UPDATE progress SET taught_hours = ?, status = ?, current_point = ?, note = ?, updated_at = ? WHERE id = ?')
    .run(taught_hours ?? p.taught_hours, status ?? p.status, current_point ?? p.current_point, note ?? p.note, now(), req.params.id);
  res.json(db.prepare('SELECT * FROM progress WHERE id = ?').get(req.params.id));
});

/** 某条进度的登记流水 */
router.get('/:id/logs', (req, res) => {
  const rows = db.prepare('SELECT * FROM progress_logs WHERE progress_id = ? ORDER BY id DESC').all(req.params.id);
  res.json(rows);
});

export default router;
