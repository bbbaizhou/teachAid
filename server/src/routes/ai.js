import { Router } from 'express';
import { db, now } from '../db.js';
import {
  chat, buildIntroPrompt, buildExercisePrompt, parseExercises, hasApiKey, testConnection
} from '../services/aiService.js';

const router = Router();

router.get('/status', (req, res) => {
  res.json({ hasKey: hasApiKey() });
});

/** 测试 AI 连接 */
router.post('/test', async (req, res) => {
  try {
    const out = await testConnection();
    res.json(out);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** 生成课程导入文案 */
router.post('/intro', async (req, res) => {
  try {
    const { chapter_id, major, style = 'life', extra = '', title, knowledge_points } = req.body;
    if (!chapter_id && !title) return res.status(400).json({ error: '请选择章节' });
    let chapter = null;
    if (chapter_id) chapter = db.prepare('SELECT * FROM chapters WHERE id = ?').get(chapter_id);
    const chapterTitle = chapter?.title || title;
    const kps = chapter?.knowledge_points || knowledge_points || '';
    const messages = buildIntroPrompt({ chapterTitle, knowledgePoints: kps, major, style, extra });
    const content = (await chat(messages, { temperature: 0.8 })).trim();
    const info = db.prepare('INSERT INTO ai_records (type, chapter_id, major, style, config, content) VALUES (?, ?, ?, ?, ?, ?)')
      .run('intro', chapter?.id || null, major || '', style, JSON.stringify({ extra }), content);
    res.json({ id: Number(info.lastInsertRowid), content });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** 生成练习题 */
router.post('/exercises', async (req, res) => {
  try {
    const { chapter_id, title, knowledge_points, major = '', counts = {}, types = [], extra = '', use_mistakes = false } = req.body;
    if (!chapter_id && !title) return res.status(400).json({ error: '请选择章节' });
    let chapter = null;
    if (chapter_id) chapter = db.prepare('SELECT * FROM chapters WHERE id = ?').get(chapter_id);
    const chapterTitle = chapter?.title || title;
    const kps = chapter?.knowledge_points || knowledge_points || '';

    let mistakeHints = '';
    if (use_mistakes && chapter) {
      const rows = db.prepare('SELECT question FROM question_bank WHERE chapter_id = ? AND is_mistake = 1 ORDER BY id DESC LIMIT 5').all(chapter.id);
      mistakeHints = rows.map((r) => `- ${r.question}`).join('\n');
    }

    const messages = buildExercisePrompt({ chapterTitle, knowledgePoints: kps, major, counts, types, extra, mistakeHints });
    const raw = await chat(messages, { temperature: 0.7 });
    const items = parseExercises(raw);
    const info = db.prepare('INSERT INTO ai_records (type, chapter_id, major, style, config, content) VALUES (?, ?, ?, ?, ?, ?)')
      .run('exercise', chapter?.id || null, major || '', 'generated',
        JSON.stringify({ counts, types, extra, use_mistakes, chapterTitle }), JSON.stringify(items));
    res.json({ id: Number(info.lastInsertRowid), items, raw });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** 生成记录（用于历史查看） */
router.get('/records', (req, res) => {
  const { type } = req.query;
  let sql = `
    SELECT r.*, ch.title AS chapter_title
    FROM ai_records r LEFT JOIN chapters ch ON ch.id = r.chapter_id
  `;
  const params = [];
  if (type) { sql += ' WHERE r.type = ?'; params.push(type); }
  sql += ' ORDER BY r.id DESC LIMIT 50';
  res.json(db.prepare(sql).all(...params));
});

/** 把某条生成记录的内容保存为备课资料 */
router.post('/records/:id/save-to-prep', (req, res) => {
  const record = db.prepare('SELECT * FROM ai_records WHERE id = ?').get(req.params.id);
  if (!record) return res.status(404).json({ error: '记录不存在' });
  const { chapter_id, title, tags = '', knowledge_point = '' } = req.body;
  const content = record.type === 'exercise'
    ? (() => { try { return JSON.stringify(JSON.parse(record.content), null, 2); } catch { return record.content; } })()
    : record.content;
  const info = db.prepare(`
    INSERT INTO prep_items (chapter_id, knowledge_point, title, content, tags, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(chapter_id || record.chapter_id || null, knowledge_point,
    title || (record.type === 'intro' ? `课堂导入：${record.chapter_id ? '' : ''}` : '练习题组'),
    content, tags || '导入文案', now());
  res.json({ id: Number(info.lastInsertRowid) });
});

/** 记录详情 */
router.get('/records/:id', (req, res) => {
  const r = db.prepare('SELECT r.*, ch.title AS chapter_title FROM ai_records r LEFT JOIN chapters ch ON ch.id = r.chapter_id WHERE r.id = ?').get(req.params.id);
  if (!r) return res.status(404).json({ error: '记录不存在' });
  if (r.type === 'exercise') { try { r.items = JSON.parse(r.content); } catch { r.items = []; } }
  res.json(r);
});

export default router;
