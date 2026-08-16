import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import archiver from 'archiver';
import { db, now, UPLOAD_DIR } from '../db.js';

const router = Router();

// 上传存储：UPLOAD_DIR/时间戳-原名
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const safe = path.basename(file.originalname || 'file').replace(/[\\/:*?"<>|]/g, '_');
    cb(null, `${Date.now()}-${safe}`);
  }
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

/** 列表：course_id 课程下（含课程级） / chapter_id / tag / q 搜索 */
router.get('/', (req, res) => {
  const { course_id, chapter_id, tag, q } = req.query;
  let sql = `
    SELECT i.*, ch.title AS chapter_title, c.name AS course_name,
      (SELECT COUNT(*) FROM prep_attachments a WHERE a.prep_id = i.id) AS attach_count
    FROM prep_items i
    LEFT JOIN chapters ch ON ch.id = i.chapter_id
    LEFT JOIN courses c ON c.id = ch.course_id
    WHERE 1=1
  `;
  const params = [];
  if (course_id) { sql += ' AND (ch.course_id = ? OR i.chapter_id IS NULL)'; params.push(Number(course_id)); }
  if (chapter_id) { sql += ' AND i.chapter_id = ?'; params.push(Number(chapter_id)); }
  if (tag) { sql += ' AND (\',\' || i.tags || \',\') LIKE ?'; params.push(`%,${tag},%`); }
  if (q) { sql += ' AND (i.title LIKE ? OR i.content LIKE ? OR i.knowledge_point LIKE ?)'; const k = `%${q}%`; params.push(k, k, k); }
  sql += ' ORDER BY i.updated_at DESC, i.id DESC';
  res.json(db.prepare(sql).all(...params));
});

router.get('/:id', (req, res) => {
  const item = db.prepare('SELECT * FROM prep_items WHERE id = ?').get(req.params.id);
  if (!item) return res.status(404).json({ error: '资料不存在' });
  const attachments = db.prepare('SELECT * FROM prep_attachments WHERE prep_id = ? ORDER BY id').all(item.id);
  res.json({ ...item, attachments });
});

router.post('/', (req, res) => {
  const { chapter_id = null, knowledge_point = '', title, content = '', tags = '' } = req.body;
  if (!title) return res.status(400).json({ error: '标题不能为空' });
  const info = db.prepare(`
    INSERT INTO prep_items (chapter_id, knowledge_point, title, content, tags, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(chapter_id || null, knowledge_point, title, content, tags, now());
  res.json({ id: Number(info.lastInsertRowid) });
});

router.put('/:id', (req, res) => {
  const { chapter_id, knowledge_point, title, content, tags } = req.body;
  const item = db.prepare('SELECT * FROM prep_items WHERE id = ?').get(req.params.id);
  if (!item) return res.status(404).json({ error: '资料不存在' });
  db.prepare('UPDATE prep_items SET chapter_id = ?, knowledge_point = ?, title = ?, content = ?, tags = ?, updated_at = ? WHERE id = ?')
    .run(chapter_id !== undefined ? chapter_id : item.chapter_id,
      knowledge_point !== undefined ? knowledge_point : item.knowledge_point,
      title ?? item.title, content ?? item.content, tags ?? item.tags, now(), req.params.id);
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM prep_items WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ---------- 附件 ----------
router.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: '未收到文件' });
  res.json({
    filename: req.file.originalname,
    url: `/uploads/${req.file.filename}`,
    size: req.file.size
  });
});

router.post('/:id/attachments', (req, res) => {
  const { filename, url, size = 0 } = req.body;
  const info = db.prepare('INSERT INTO prep_attachments (prep_id, filename, url, size) VALUES (?, ?, ?, ?)')
    .run(req.params.id, filename, url, size);
  res.json({ id: Number(info.lastInsertRowid) });
});

router.delete('/attachments/:id', (req, res) => {
  db.prepare('DELETE FROM prep_attachments WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ---------- 单章节打包导出（zip：每个资料一个 md + 附件文件） ----------
router.get('/package/:chapterId', (req, res) => {
  const chapter = db.prepare('SELECT * FROM chapters WHERE id = ?').get(req.params.chapterId);
  if (!chapter) return res.status(404).json({ error: '章节不存在' });
  const items = db.prepare('SELECT * FROM prep_items WHERE chapter_id = ? ORDER BY id').all(chapter.id);
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(chapter.title)}.zip`);
  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.pipe(res);
  items.forEach((it, i) => {
    const md = `# ${it.title}\n\n${it.tags ? `标签：${it.tags}\n\n` : ''}${it.knowledge_point ? `所属知识点：${it.knowledge_point}\n\n` : ''}${it.content || ''}\n`;
    archive.append(md, { name: `${String(i + 1).padStart(2, '0')}-${it.title.replace(/[\\/:*?"<>|]/g, '_').slice(0, 40)}.md` });
    const atts = db.prepare('SELECT * FROM prep_attachments WHERE prep_id = ?').all(it.id);
    atts.forEach((a) => {
      const p = path.join(UPLOAD_DIR, path.basename(a.url));
      archive.file(p, { name: `附件/${it.title.replace(/[\\/:*?"<>|]/g, '_').slice(0, 30)}-${a.filename}` });
    });
  });
  if (!items.length) archive.append('（该章节暂无备课资料）', { name: '说明.txt' });
  archive.finalize();
});

export default router;
