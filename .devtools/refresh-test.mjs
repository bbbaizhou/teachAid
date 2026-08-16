// 真实浏览器刷新测试：加载进度页 → 记录界面数据 → Page.reload → 对比
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9223;
const profile = 'E:/vscodeProject/teachAid/.devtools/chrome-profile-refresh';
mkdirSync(profile, { recursive: true });

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-first-run',
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
  const r = await send('Runtime.evaluate', { expression, returnByValue: true });
  return r.result?.value;
};

await send('Page.enable');
await send('Runtime.enable');
await send('Page.navigate', { url: 'http://localhost:3001/#/progress' });
await sleep(4000);

const snapshot = async () => evaluate(`(() => {
  const rows = [...document.querySelectorAll('.m-ch-row')].map(r => r.innerText.replace(/\\n/g, ' '));
  const title = document.querySelector('.page-title')?.innerText || '';
  return { title, firstRow: rows[0] || '(无进度行)', rowCount: rows.length };
})()`);

const before = await snapshot();
console.log('🖥️ 刷新前界面:', JSON.stringify(before));

await send('Page.reload');
await sleep(4500);
const after = await snapshot();
console.log('🔄 刷新后界面:', JSON.stringify(after));

const same = before.firstRow === after.firstRow && before.rowCount === after.rowCount;
console.log(same ? '✅ 真实刷新前后界面数据完全一致（数据不会被重置）' : '❌ 刷新后数据变化！');
chrome.kill();
process.exit(same ? 0 : 1);
