import { Router } from 'express';
import os from 'node:os';
import { db, getSetting, setSetting } from '../db.js';

const router = Router();

/** 局域网访问地址（供手机/平板访问本机服务） */
router.get('/network', (req, res) => {
  const list = [];
  const ifs = os.networkInterfaces();
  for (const name of Object.keys(ifs)) {
    for (const info of ifs[name] || []) {
      if (info.family === 'IPv4' && !info.internal) {
        list.push({ name, address: info.address });
      }
    }
  }
  res.json({ list, port: Number(process.env.PORT || 3001) });
});

/** 返回设置（API Key 打码） */
router.get('/', (req, res) => {
  const ai = getSetting('ai', {});
  res.json({
    ai: {
      provider: ai.provider || 'deepseek',
      model: ai.model || 'deepseek-chat',
      baseUrl: ai.baseUrl || 'https://api.deepseek.com',
      temperature: Number(ai.temperature ?? 0.8),
      hasKey: !!(ai.apiKey || process.env.DEEPSEEK_API_KEY)
    },
    majors: getSetting('majors', []),
    sectionTimes: getSetting('sectionTimes', []),
    app: getSetting('app', { name: '高数教学辅助系统', version: '0.1.0' }),
    dataDir: getSetting('dataDirHint', '')
  });
});

router.put('/', (req, res) => {
  const { ai, majors, sectionTimes } = req.body;
  if (ai) {
    const cur = getSetting('ai', {});
    const next = { ...cur, ...ai };
    // 打码占位符不覆盖已有 Key
    if (ai.apiKey === '****') next.apiKey = cur.apiKey;
    if (next.apiKey !== undefined) next.apiKey = next.apiKey.trim();
    setSetting('ai', next);
  }
  if (Array.isArray(majors)) setSetting('majors', majors.filter(Boolean));
  if (Array.isArray(sectionTimes)) setSetting('sectionTimes', sectionTimes);
  res.json({ ok: true });
});

/** 数据目录提示（后端返回绝对路径，方便用户找备份） */
router.get('/datadir', (req, res) => {
  res.json({ dir: process.env.TEACHAID_DATA_HINT || '' });
});

export default router;
