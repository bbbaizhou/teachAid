// AI 应用模块验证（服务模式 + 浏览器模式）
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9230;
const profile = 'E:/vscodeProject/teachAid/.devtools/chrome-profile-ai';
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

// ---- 服务模式 ----
await send('Page.navigate', { url: 'http://localhost:3001/#/ai' });
await sleep(4000);
let state = await evaluate(`(() => ({
  tabs: [...document.querySelectorAll('.ai-tabs .el-tabs__item')].map(t => t.innerText.trim()),
  active: document.querySelector('.ai-tabs .el-tabs__item.is-active')?.innerText.trim() || '',
  panels: document.querySelectorAll('.ai-module > div').length
}))()`);
check('AI 应用三个标签', state.tabs.length === 3 && state.tabs[0].includes('课程导入') && state.tabs[1].includes('习题生成') && state.tabs[2].includes('课程思政'), JSON.stringify(state.tabs));
check('默认显示课程导入', state.active.includes('课程导入'));

// 切换到课程思政
await evaluate(`[...document.querySelectorAll('.ai-tabs .el-tabs__item')].find(t => t.innerText.includes('课程思政'))?.click()`);
await sleep(1500);
state = await evaluate(`(() => ({
  active: document.querySelector('.ai-tabs .el-tabs__item.is-active')?.innerText.trim() || '',
  hasTheme: !!document.querySelector('.style-item'),
  hasUrl: location.hash
}))()`);
check('切换到课程思政标签', state.active.includes('课程思政') && state.hasTheme, state.hasUrl);
check('URL 同步 tab 参数', state.hasUrl.includes('tab=sizheng'), state.hasUrl);

// 旧路由重定向
await evaluate(`location.hash = '#/intro'`);
await sleep(1500);
const redirect = await evaluate(`location.hash`);
check('旧路由 /intro 重定向到 AI 模块', redirect.startsWith('#/ai'), redirect);

// ---- 浏览器模式（模拟 Pages）----
await send('Page.navigate', { url: 'http://127.0.0.1:8088/teachAid/#/ai?tab=sizheng' });
await sleep(5000);
state = await evaluate(`(() => ({
  active: document.querySelector('.ai-tabs .el-tabs__item.is-active')?.innerText.trim() || '',
  hasCourse: (document.body.innerText || '').includes('高等数学A'),
  mode: !!document.querySelector('.mode-dot.local')
}))()`);
check('浏览器模式：AI 模块可用', state.mode && state.hasCourse && state.active.includes('课程思政'), `模式:${state.mode} 激活:${state.active}`);

console.log('---');
console.log(allOk ? '🎉 AI 应用模块验证全部通过' : '⚠️ 存在问题');
chrome.kill();
process.exit(allOk ? 0 : 1);
