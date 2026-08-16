// 线上 GitHub Pages 站点功能验证（全新浏览器）
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9229;
const profile = 'E:/vscodeProject/teachAid/.devtools/chrome-profile-live';
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
const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) return { __error: r.exceptionDetails.exception?.description || 'JS异常' };
  return r.result?.value;
};

let allOk = true;
const check = (name, ok, extra = '') => { console.log(`${ok ? '✅' : '❌'} ${name}${extra ? ' | ' + extra : ''}`); if (!ok) allOk = false; };

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await send('Page.navigate', { url: 'https://bbbaizhou.github.io/teachAid/' });
// 等待应用挂载（最多 20 秒）
let boot = null;
for (let i = 0; i < 10; i++) {
  await sleep(2000);
  boot = await evaluate(`(() => {
    const txt = document.body.innerText || '';
    const idx = txt.indexOf('AI 能力');
    return {
      modeDot: !!document.querySelector('.mode-dot.local'),
      bottomNav: document.querySelectorAll('.bottom-nav .tab').length,
      hasCourse: txt.includes('高等数学A'),
      aiStatus: idx >= 0 ? txt.slice(Math.max(0, idx - 30), idx).replace(/\\s+/g, ' ') : '',
      title: document.title
    };
  })()`);
  if (boot && !boot.__error && boot.bottomNav > 0) break;
}
console.log('应用状态:', JSON.stringify(boot));
check('线上站点加载（浏览器模式）', boot.modeDot === true, '模式圆点:浏览器');
check('底部导航渲染', boot.bottomNav === 5, `标签数:${boot.bottomNav}`);
check('种子数据加载', boot.hasCourse === true);
check('AI 默认 Key 已生效（已就绪）', boot.aiStatus.includes('已就绪'), `AI 状态:${boot.aiStatus}`);

// 直接读 IndexedDB 中的 Key
const storedKey = await evaluate(`(async () => {
  const db = await new Promise((res, rej) => { const r = indexedDB.open('teachaid-db', 1); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  return new Promise((res) => { const g = db.transaction('settings').objectStore('settings').get('ai'); g.onsuccess = () => res(g.result?.value?.apiKey || ''); });
})()`);
check('IndexedDB 已存默认 Key', storedKey.startsWith('sk-c12379052b'), storedKey.slice(0, 12) + '...');

console.log('---');
console.log(allOk ? '🎉 线上部署验证全部通过' : '⚠️ 存在问题');
chrome.kill();
process.exit(allOk ? 0 : 1);
