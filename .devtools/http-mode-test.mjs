// 服务模式（localhost:3001）回归验证
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9225;
const profile = 'E:/vscodeProject/teachAid/.devtools/chrome-profile-http';
mkdirSync(profile, { recursive: true });

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--disable-extensions',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`
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
  return r.result?.value;
};

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: 'http://localhost:3001/' });
await sleep(6000);

const state = await evaluate(`(() => ({
  modeTag: document.querySelector('.mode-tag')?.innerText || '',
  hasCourse: (document.body.innerText || '').includes('高等数学A'),
  hasAside: !!document.querySelector('.el-aside'),
  cards: document.querySelectorAll('.page-card').length,
  text: (document.body.innerText || '').slice(0, 60).replace(/\\n/g, ' ')
}))()`);
console.log(JSON.stringify(state, null, 1));

const ok = state.modeTag.includes('服务模式') && state.hasCourse && state.hasAside;
console.log(ok ? '✅ 服务模式回归正常' : '❌ 服务模式异常');
chrome.kill();
process.exit(ok ? 0 : 1);
