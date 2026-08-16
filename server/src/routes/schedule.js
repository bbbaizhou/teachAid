import { Router } from 'express';
import { db, getSetting } from '../db.js';

const router = Router();

function withInfo(rows) {
  return rows.map((r) => ({
    ...r,
    class_name: r.class_name,
    course_name: r.course_name,
    major: r.major
  }));
}

const BASE = `
  SELECT e.*, cl.name AS class_name, cl.major AS major, c.name AS course_name
  FROM schedule_entries e
  JOIN classes cl ON cl.id = e.class_id
  JOIN courses c ON c.id = cl.course_id
`;

router.get('/', (req, res) => {
  const { weekday, class_id, course_id } = req.query;
  let sql = BASE + ' WHERE 1=1';
  const params = [];
  if (weekday !== undefined && weekday !== '') { sql += ' AND e.weekday = ?'; params.push(Number(weekday)); }
  if (class_id) { sql += ' AND e.class_id = ?'; params.push(Number(class_id)); }
  if (course_id) { sql += ' AND c.id = ?'; params.push(Number(course_id)); }
  sql += ' ORDER BY e.weekday, e.start_section, e.id';
  res.json(db.prepare(sql).all(...params));
});

router.post('/', (req, res) => {
  const { class_id, weekday, start_section, end_section, weeks = '', location = '', note = '', status = 'normal' } = req.body;
  if (!class_id || weekday === undefined || !start_section) {
    return res.status(400).json({ error: '班级、星期、起始节次为必填项' });
  }
  const info = db.prepare(`
    INSERT INTO schedule_entries (class_id, weekday, start_section, end_section, weeks, location, note, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(class_id, Number(weekday), Number(start_section), Number(end_section || start_section), weeks, location, note, status);
  res.json({ id: Number(info.lastInsertRowid) });
});

router.put('/:id', (req, res) => {
  const { class_id, weekday, start_section, end_section, weeks, location, note, status } = req.body;
  const e = db.prepare('SELECT * FROM schedule_entries WHERE id = ?').get(req.params.id);
  if (!e) return res.status(404).json({ error: '课表条目不存在' });
  db.prepare(`
    UPDATE schedule_entries SET
      class_id = ?, weekday = ?, start_section = ?, end_section = ?,
      weeks = ?, location = ?, note = ?, status = ?
    WHERE id = ?
  `).run(
    class_id ?? e.class_id, weekday ?? e.weekday, start_section ?? e.start_section,
    end_section ?? e.end_section, weeks ?? e.weeks, location ?? e.location,
    note ?? e.note, status ?? e.status, req.params.id
  );
  res.json({ ok: true });
});

/** 标记调课/停课/恢复正常 */
router.post('/:id/status', (req, res) => {
  const { status, note } = req.body;
  db.prepare('UPDATE schedule_entries SET status = ?, note = ? WHERE id = ?')
    .run(status || 'normal', note ?? '', req.params.id);
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM schedule_entries WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

/** 今日课程：根据星期几返回今天的课表 */
router.get('/today', (req, res) => {
  const weekday = (new Date().getDay() + 6) % 7; // 周一=0
  const rows = db.prepare(BASE + ' WHERE e.weekday = ? ORDER BY e.start_section').all(weekday);
  res.json({ weekday, today: new Date().toLocaleDateString('zh-CN', { weekday: 'long', month: 'long', day: 'numeric' }), entries: rows });
});

/** 节次时间表 */
router.get('/section-times', (req, res) => {
  res.json(getSetting('sectionTimes', []));
});

export default router;
