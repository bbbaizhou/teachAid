import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import archiver from 'archiver';
import { DATA_DIR, UPLOAD_DIR, BACKUP_DIR, db, getSetting, setSetting } from './db.js';
import coursesRouter from './routes/courses.js';
import progressRouter from './routes/progress.js';
import scheduleRouter from './routes/schedule.js';
import prepRouter from './routes/prep.js';
import aiRouter from './routes/ai.js';
import bankRouter from './routes/bank.js';
import settingsRouter from './routes/settings.js';
import exportRouter from './routes/export.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3001);

const app = express();
app.use(cors());
app.use(express.json({ limit: '20mb' }));

// 静态资源
app.use('/uploads', express.static(UPLOAD_DIR));

// API 路由
app.use('/api', coursesRouter);
app.use('/api/progress', progressRouter);
app.use('/api/schedule', scheduleRouter);
app.use('/api/prep', prepRouter);
app.use('/api/ai', aiRouter);
app.use('/api/bank', bankRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/export', exportRouter);

app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// 生产模式：托管前端构建产物
const webDist = path.join(__dirname, '..', '..', 'web', 'dist');
if (fs.existsSync(webDist)) {
  app.use(express.static(webDist));
  app.get(/^\/(?!api|uploads).*/, (req, res) => {
    res.sendFile(path.join(webDist, 'index.html'));
  });
  console.log(`[teachAid] 前端构建产物已挂载: ${webDist}`);
}

// 启动时自动备份（每天最多一次）
function autoBackupIfNeeded() {
  const last = Number(getSetting('lastAutoBackup', 0) || 0);
  if (Date.now() - last < 24 * 3600 * 1000) return;
  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  const zipPath = path.join(BACKUP_DIR, `teachaid-backup-${stamp}.zip`);
  const output = fs.createWriteStream(zipPath);
  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.pipe(output);
  archive.file(path.join(DATA_DIR, 'teachaid.db'), { name: 'teachaid.db' });
  archive.directory(UPLOAD_DIR, 'uploads');
  archive.finalize();
  output.on('close', () => setSetting('lastAutoBackup', Date.now()));
}

app.listen(PORT, () => {
  console.log(`[teachAid] 后端服务已启动: http://localhost:${PORT}`);
  console.log(`[teachAid] 数据目录: ${DATA_DIR}`);
  // 手机访问地址提示
  const ifs = os.networkInterfaces();
  const lan = [];
  for (const name of Object.keys(ifs)) {
    for (const info of ifs[name] || []) {
      if (info.family === 'IPv4' && !info.internal) lan.push(info.address);
    }
  }
  if (lan.length) {
    console.log(`[teachAid] 📱 手机访问（同一 WiFi）：http://${lan[0]}:${PORT}`);
  }
  autoBackupIfNeeded();
});
