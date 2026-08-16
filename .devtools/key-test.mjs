// 验证：全新浏览器配置下，默认 AI Key 自动生效
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9228;
const profile = 'E:/vscodeProject/teachAid/.devtools/chrome-profile-key';
mkdirSync(profile, { recursive: true });
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--disable-extensions', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`], { stdio: 'ignore' });
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
  throw new Error('no chrome');
}
const target = await getTarget();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let msgId = 0;
const pending = new Map();
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { const { resolve, reject } = pending.get(m.id); pending.delete(m.id); m.error ? reject(new Error(m.error.message)) : resolve(m.result); }
};
const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++msgId; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })); });
const evaluate = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result?.value;

await send('Page.enable');
await send('Runtime.enable');
await send('Page.navigate', { url: 'http://127.0.0.1:8088/teachAid/' });
await sleep(5000);

// 直接读 IndexedDB 中的 ai 设置
const stored = await evaluate(`(async () => {
  const db = await new Promise((res, rej) => { const r = indexedDB.open('teachaid-db', 1); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  return new Promise((res) => {
    const g = db.transaction('settings').objectStore('settings').get('ai');
    g.onsuccess = () => res(g.result?.value?.apiKey || '');
  });
})()`);
console.log('IndexedDB 中的 Key:', stored ? stored.slice(0, 10) + '...' + stored.slice(-4) : '(空)');

// 首页 AI 状态
await evaluate(`location.hash = '#/'`);
await sleep(1500);
const aiStatus = await evaluate(`(() => (document.body.innerText || '').match(/AI 能力\s*([^\s]+)/)?.[1] || '?')()`);
console.log('首页 AI 能力显示:', aiStatus);

const ok = stored === 'sk-c12379052b494871ac390dcc4c673473';
console.log(ok ? '✅ 默认 AI Key 自动生效（与 web 端一致）' : '❌ Key 未生效');
chrome.kill();
process.exit(ok ? 0 : 1);
