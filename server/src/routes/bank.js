import { Router } from 'express';
import { db } from '../db.js';

const router = Router();

const BASE = `
  SELECT b.*, ch.title AS chapter_title, c.name AS course_name
  FROM question_bank b
  LEFT JOIN chapters ch ON ch.id = b.chapter_id
  LEFT JOIN courses c ON c.id = ch.course_id
`;

router.get('/', (req, res) => {
  const { chapter_id, difficulty, type, is_mistake, q, course_id } = req.query;
  let sql = BASE + ' WHERE 1=1';
  const params = [];
  if (chapter_id) { sql += ' AND b.chapter_id = ?'; params.push(Number(chapter_id)); }
  if (course_id) { sql += ' AND ch.course_id = ?'; params.push(Number(course_id)); }
  if (difficulty) { sql += ' AND b.difficulty = ?'; params.push(difficulty); }
  if (type) { sql += ' AND b.type = ?'; params.push(type); }
  if (is_mistake !== undefined && is_mistake !== '') { sql += ' AND b.is_mistake = ?'; params.push(Number(is_mistake)); }
  if (q) { sql += ' AND (b.question LIKE ? OR b.solution LIKE ?)'; const k = `%${q}%`; params.push(k, k); }
  sql += ' ORDER BY b.id DESC';
  res.json(db.prepare(sql).all(...params));
});

router.post('/', (req, res) => {
  const { chapter_id = null, difficulty = 'basic', type = 'calc', question, answer = '', solution = '', source = '', is_mistake = 0 } = req.body;
  if (!question) return res.status(400).json({ error: '题目内容不能为空' });
  const info = db.prepare(`
    INSERT INTO question_bank (chapter_id, difficulty, type, question, answer, solution, source, is_mistake)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(chapter_id || null, difficulty, type, question, answer, solution, source, is_mistake ? 1 : 0);
  res.json({ id: Number(info.lastInsertRowid) });
});

/** 批量导入（用于把生成题目一键存入题库） */
router.post('/import', (req, res) => {
  const { items } = req.body;
  if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: '没有可导入的题目' });
  const ins = db.prepare(`
    INSERT INTO question_bank (chapter_id, difficulty, type, question, answer, solution, source, is_mistake)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const tx = db.prepare('BEGIN');
  tx.run();
  try {
    for (const it of items) {
      ins.run(it.chapter_id || null, it.difficulty || 'basic', it.type || 'calc',
        it.question, it.answer || '', it.solution || '', it.source || '', it.is_mistake ? 1 : 0);
    }
    db.prepare('COMMIT').run();
  } catch (e) {
    db.prepare('ROLLBACK').run();
    throw e;
  }
  res.json({ ok: true, count: items.length });
});

router.put('/:id', (req, res) => {
  const { chapter_id, difficulty, type, question, answer, solution, source, is_mistake } = req.body;
  const b = db.prepare('SELECT * FROM question_bank WHERE id = ?').get(req.params.id);
  if (!b) return res.status(404).json({ error: '题目不存在' });
  db.prepare(`
    UPDATE question_bank SET chapter_id = ?, difficulty = ?, type = ?, question = ?, answer = ?, solution = ?, source = ?, is_mistake = ?
    WHERE id = ?
  `).run(
    chapter_id !== undefined ? chapter_id : b.chapter_id,
    difficulty ?? b.difficulty, type ?? b.type, question ?? b.question,
    answer ?? b.answer, solution ?? b.solution, source ?? b.source,
    is_mistake !== undefined ? (is_mistake ? 1 : 0) : b.is_mistake,
    req.params.id
  );
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM question_bank WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

export default router;
