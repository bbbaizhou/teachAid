import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import archiver from 'archiver';
import { db, DATA_DIR, UPLOAD_DIR, BACKUP_DIR, now } from '../db.js';
import { progressMarkdown, exercisesMarkdown, markdownToDocxBuffer } from '../services/exportService.js';

const router = Router();

// ---------- 完整数据导出 / 导入（跨模式统一 JSON 格式） ----------

const EXPORT_TABLES = [
  'courses', 'classes', 'chapters', 'progress', 'progress_logs',
  'schedule_entries', 'prep_items', 'prep_attachments', 'ai_records', 'question_bank'
];

const TABLE_COLUMNS = {
  courses: ['id', 'name', 'code', 'semester', 'total_hours', 'created_at'],
  classes: ['id', 'course_id', 'name', 'major', 'student_count', 'note', 'created_at'],
  chapters: ['id', 'course_id', 'title', 'order_no', 'planned_hours', 'knowledge_points', 'created_at'],
  progress: ['id', 'class_id', 'chapter_id', 'taught_hours', 'status', 'current_point', 'note', 'updated_at'],
  progress_logs: ['id', 'progress_id', 'hours', 'note', 'created_at'],
  schedule_entries: ['id', 'class_id', 'weekday', 'start_section', 'end_section', 'weeks', 'location', 'note', 'status', 'created_at'],
  prep_items: ['id', 'chapter_id', 'knowledge_point', 'title', 'content', 'tags', 'created_at', 'updated_at'],
  prep_attachments: ['id', 'prep_id', 'filename', 'url', 'size', 'created_at'],
  ai_records: ['id', 'type', 'chapter_id', 'major', 'style', 'config', 'content', 'created_at'],
  question_bank: ['id', 'chapter_id', 'difficulty', 'type', 'question', 'answer', 'solution', 'source', 'is_mistake', 'created_at']
};

/** 收集全部业务数据（附件内嵌 base64；设置解析为原始对象） */
function collectAllData() {
  const data = {};
  for (const t of EXPORT_TABLES) {
    data[t] = db.prepare(`SELECT * FROM ${t}`).all();
  }
  data.prep_attachments = data.prep_attachments.map((a) => {
    const filePath = path.join(UPLOAD_DIR, path.basename(a.url || ''));
    let blobBase64 = '';
    try { if (fs.existsSync(filePath)) blobBase64 = fs.readFileSync(filePath).toString('base64'); } catch { /* ignore */ }
    return { ...a, blobBase64 };
  });
  data.settings = db.prepare('SELECT key AS id, value FROM settings WHERE key NOT IN (?)').all('lastAutoBackup')
    .map((s) => { let v = s.value; try { v = JSON.parse(s.value); } catch { /* keep raw */ } return { id: s.id, value: v }; });
  return data;
}

/** 导出完整数据（JSON 下载） */
router.get('/data', (req, res) => {
  const data = collectAllData();
  const json = JSON.stringify({ app: 'teachaid', version: 1, exportedAt: now(), data }, null, 2);
  const stamp = now().replace(/[-: ]/g, '').slice(0, 14);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent('teachaid-完整数据-' + stamp)}.json`);
  res.send(json);
});

const importUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 300 * 1024 * 1024 } });

/** 导入完整数据（事务恢复，保留原 id 与外键；附件 base64 落盘） */
router.post('/import', importUpload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: '未收到备份文件' });
    let parsed;
    try {
      parsed = JSON.parse(req.file.buffer.toString('utf8'));
    } catch {
      return res.status(400).json({ error: '备份文件不是有效的 JSON' });
    }
    if (parsed.app !== 'teachaid' || !parsed.data) {
      return res.status(400).json({ error: '不是本系统导出的备份文件（缺少 app 标识）' });
    }
    const data = parsed.data;
    const counts = {};

    db.prepare('BEGIN').run();
    try {
      // 清空业务表
      for (const t of EXPORT_TABLES) {
        db.prepare(`DELETE FROM ${t}`).run();
        counts[t] = 0;
      }
      // 清空设置（保留 lastAutoBackup 运行态标记）
      db.prepare('DELETE FROM settings WHERE key != ?').run('lastAutoBackup');

      // 逐表恢复（保留原 id）
      for (const t of EXPORT_TABLES) {
        const cols = TABLE_COLUMNS[t];
        const placeholders = cols.map(() => '?').join(',');
        const ins = db.prepare(`INSERT INTO ${t} (${cols.join(',')}) VALUES (${placeholders})`);
        for (const row of data[t] || []) {
          if (t === 'prep_attachments') {
            // 附件：先落盘文件再插入
            const origName = path.basename(row.url || row.filename || 'file');
            const storedName = `${Date.now()}-${String(origName).replace(/[\\/:*?"<>|]/g, '_')}`;
            const filePath = path.join(UPLOAD_DIR, storedName);
            if (row.blobBase64) {
              fs.writeFileSync(filePath, Buffer.from(row.blobBase64, 'base64'));
            }
            ins.run(row.id, row.prep_id, row.filename, `/uploads/${storedName}`, row.size || 0, row.created_at || now());
          } else {
            ins.run(...cols.map((c) => row[c] ?? null));
          }
          counts[t]++;
        }
      }
      // 设置恢复
      for (const s of data.settings || []) {
        if (s.id === 'seeded' || s.id === 'lastAutoBackup') continue;
        const val = (typeof s.value === 'string') ? s.value : JSON.stringify(s.value);
        db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
          .run(s.id, val);
      }
      db.prepare('COMMIT').run();
    } catch (e) {
      db.prepare('ROLLBACK').run();
      throw e;
    }

    res.json({ ok: true, restored: true, counts, exportedAt: parsed.exportedAt || '' });
  } catch (e) {
    res.status(500).json({ error: '导入失败：' + e.message });
  }
});

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
