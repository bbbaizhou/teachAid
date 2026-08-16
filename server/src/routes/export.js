import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import archiver from 'archiver';
import { db, DATA_DIR, UPLOAD_DIR, BACKUP_DIR, now } from '../db.js';
import { progressMarkdown, exercisesMarkdown, markdownToDocxBuffer } from '../services/exportService.js';

const router = Router();

function sendMd(res, md, filename) {
  res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}.md`);
  res.send(md);
}

/** 导出进度档案（md / docx） */
router.get('/progress', async (req, res) => {
  try {
    const courseId = Number(req.query.course_id);
    const format = req.query.format || 'md';
    const course = db.prepare('SELECT * FROM courses WHERE id = ?').get(courseId);
    if (!course) return res.status(404).json({ error: '课程不存在' });
    const classes = db.prepare('SELECT * FROM classes WHERE course_id = ? ORDER BY id').all(courseId);
    const chapters = db.prepare('SELECT * FROM chapters WHERE course_id = ? ORDER BY order_no, id').all(courseId);
    const rows = db.prepare('SELECT * FROM progress WHERE class_id IN (SELECT id FROM classes WHERE course_id = ?)').all(courseId);
    const byKey = new Map(rows.map((r) => [`${r.class_id}:${r.chapter_id}`, r]));
    const board = [];
    for (const cls of classes) {
      for (const ch of chapters) {
        const p = byKey.get(`${cls.id}:${ch.id}`) || {
          class_id: cls.id, chapter_id: ch.id, taught_hours: 0, status: 'not_started', current_point: '', note: ''
        };
        board.push({ ...p, planned_hours: ch.planned_hours, chapter_title: ch.title, order_no: ch.order_no });
      }
    }
    const md = progressMarkdown({ course, classes, chapters, board });
    if (format === 'docx') {
      const buf = await markdownToDocxBuffer(md);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(course.name + '-进度档案')}.docx`);
      return res.send(Buffer.from(buf));
    }
    sendMd(res, md, course.name + '-进度档案');
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** 导出习题记录（md / docx） */
router.get('/exercises/:recordId', async (req, res) => {
  try {
    const format = req.query.format || 'md';
    const record = db.prepare('SELECT * FROM ai_records WHERE id = ? AND type = ?').get(req.params.recordId, 'exercise');
    if (!record) return res.status(404).json({ error: '习题记录不存在' });
    let items = [];
    try { items = JSON.parse(record.content); } catch { /* ignore */ }
    if (!items.length) return res.status(400).json({ error: '该记录没有题目内容' });
    let config = {};
    try { config = JSON.parse(record.config || '{}'); } catch { /* ignore */ }
    const title = `练习题：${config.chapterTitle || '高数习题'}`;
    const md = exercisesMarkdown({ title, items });
    if (format === 'docx') {
      const buf = await markdownToDocxBuffer(md);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(title)}.docx`);
      return res.send(Buffer.from(buf));
    }
    sendMd(res, md, title);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** 一键备份：打包 db + uploads 为 zip */
router.post('/backup', (req, res) => {
  const stamp = now().replace(/[-: ]/g, '').slice(0, 14);
  const zipName = `teachaid-backup-${stamp}.zip`;
  const zipPath = path.join(BACKUP_DIR, zipName);
  const output = fs.createWriteStream(zipPath);
  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.pipe(output);
  archive.file(path.join(DATA_DIR, 'teachaid.db'), { name: 'teachaid.db' });
  archive.directory(UPLOAD_DIR, 'uploads');
  archive.finalize();
  output.on('close', () => {
    db.prepare('INSERT INTO settings (key, value) VALUES (\'lastAutoBackup\', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
      .run(JSON.stringify(Date.now()));
    res.json({ ok: true, name: zipName, size: fs.statSync(zipPath).size });
  });
  archive.on('error', (e) => { res.status(500).json({ error: e.message }); });
});

/** 备份列表 */
router.get('/backups', (req, res) => {
  const files = fs.readdirSync(BACKUP_DIR)
    .filter((f) => f.endsWith('.zip'))
    .map((f) => {
      const st = fs.statSync(path.join(BACKUP_DIR, f));
      return { name: f, size: st.size, mtime: st.mtime.toISOString().replace('T', ' ').slice(0, 19) };
    })
    .sort((a, b) => b.name.localeCompare(a.name));
  res.json(files);
});

router.get('/backups/:name', (req, res) => {
  const name = path.basename(req.params.name);
  const p = path.join(BACKUP_DIR, name);
  if (!fs.existsSync(p)) return res.status(404).json({ error: '备份文件不存在' });
  res.download(p, name);
});

/** 删除备份 */
router.delete('/backups/:name', (req, res) => {
  const name = path.basename(req.params.name);
  const p = path.join(BACKUP_DIR, name);
  if (fs.existsSync(p)) fs.unlinkSync(p);
  res.json({ ok: true });
});

export default router;
