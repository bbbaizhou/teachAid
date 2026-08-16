// 浏览器本地模式（GitHub Pages 模拟）端到端验证
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9224;
const profile = 'E:/vscodeProject/teachAid/.devtools/chrome-profile-local';
mkdirSync(profile, { recursive: true });

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--disable-extensions',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  '--window-size=390,844', 'about:blank'
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function getTarget() {
  for (let i = 0; i < 30; i++) {
    try {
      const list = await fetch(`http://127.0.0.1:${PORT}/json/list`).then(r => r.json());
      const page = list.find(t => t.type === 'page');
      if (page) return page;
    } catch { /* retry */ }
    await sleep(500);
  }
  throw new Error('无法连接 Chrome');
}

const target = await getTarget();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let msgId = 0;
const pending = new Map();
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) {
    const { resolve, reject } = pending.get(m.id);
    pending.delete(m.id);
    m.error ? reject(new Error(m.error.message)) : resolve(m.result);
  }
};
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++msgId; pending.set(id, { resolve, reject });
  ws.send(JSON.stringify({ id, method, params }));
});
const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) return { __error: r.exceptionDetails.exception?.description || 'JS异常' };
  return r.result?.value;
};

let allOk = true;
await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });

// 1. 打开模拟 Pages 地址（子路径）
await send('Page.navigate', { url: 'http://127.0.0.1:8088/teachAid/' });
await sleep(5000);

const boot = await evaluate(`(() => ({
  modeTag: document.querySelector('.mode-tag')?.innerText || '',
  title: document.title,
  bodyText: (document.body.innerText || '').slice(0, 80).replace(/\\n/g, ' ')
}))()`);
console.log('启动:', JSON.stringify(boot));
const localMode = boot.modeTag && boot.modeTag.includes('浏览器模式');
if (!localMode) { console.log('❌ 未进入浏览器模式'); allOk = false; }

// 2. 首页应显示种子数据
const home = await evaluate(`(() => ({
  hasCourse: (document.body.innerText || '').includes('高等数学A'),
  quickCards: document.querySelectorAll('.quick-card').length
}))()`);
console.log('首页种子数据:', JSON.stringify(home));
if (!home.hasCourse) { console.log('❌ 种子数据未加载'); allOk = false; }

// 3. 进度页：登记一条进度 → 刷新 → 数据保留
await evaluate(`location.hash = '#/progress'`);
await sleep(2000);
const before = await evaluate(`(() => {
  const rows = [...document.querySelectorAll('.m-ch-row')];
  return { count: rows.length, first: rows[0]?.innerText.replace(/\\n/g, ' ') || '' };
})()`);
console.log('进度页(刷新前):', JSON.stringify(before));

// 点击第一行打开登记弹窗并保存
const reg = await evaluate(`(() => {
  const row = document.querySelector('.m-ch-row');
  if (!row) return '无行可点';
  row.click();
  return 'clicked';
})()`);
await sleep(1200);
const fill = await evaluate(`(() => {
  const inputs = document.querySelectorAll('.el-dialog .el-input-number input');
  if (!inputs.length) return '弹窗未打开';
  inputs[0].value = '2';
  inputs[0].dispatchEvent(new Event('input', { bubbles: true }));
  const saveBtn = [...document.querySelectorAll('.el-dialog button')].find(b => b.innerText.includes('保存登记'));
  saveBtn?.click();
  return 'submitted';
})()`);
await sleep(1500);
console.log('登记操作:', fill);

// 强制刷新（浏览器重载）
await send('Page.reload');
await sleep(5000);
await evaluate(`location.hash = '#/progress'`);
await sleep(2000);
const after = await evaluate(`(() => {
  const rows = [...document.querySelectorAll('.m-ch-row')];
  return rows[0]?.innerText.replace(/\\n/g, ' ') || '(无数据)';
})()`);
console.log('进度页(刷新后):', after);
const persisted = after.includes('2 /') && after.includes('33%');
console.log(persisted ? '✅ 刷新后数据保留（IndexedDB 持久化）' : '❌ 刷新后数据丢失');
if (!persisted) allOk = false;

// 4. AI 直连 CORS 实测（使用已配置的 Key，检查浏览器能否跨域调用 DeepSeek）
const cors = await evaluate(`(async () => {
  try {
    const res = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ${process.env.KEY}' },
      body: JSON.stringify({ model: 'deepseek-chat', messages: [{ role: 'user', content: 'hi' }], max_tokens: 5 })
    });
    return { status: res.status, corsOk: true, body: (await res.text()).slice(0, 80) };
  } catch (e) {
    return { corsOk: false, err: e.message };
  }
})()`);
console.log('AI 浏览器直连 CORS:', JSON.stringify(cors));
if (!cors.corsOk || cors.status === 403 || cors.status === 401) {
  console.log('⚠️ AI 直连受限（CORS 或鉴权）— 浏览器模式 AI 不可用');
  allOk = false;
} else {
  console.log('✅ AI 可从浏览器直连 DeepSeek');
}

console.log('---');
console.log(allOk ? '🎉 浏览器本地模式全部通过' : '⚠️ 存在问题');
chrome.kill();
process.exit(allOk ? 0 : 1);
