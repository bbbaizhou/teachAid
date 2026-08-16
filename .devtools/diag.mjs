// 诊断课表弹窗下拉交互
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9227;
const profile = 'E:/vscodeProject/teachAid/.devtools/chrome-profile-diag';
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
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await send('Page.navigate', { url: 'http://127.0.0.1:8088/teachAid/#/schedule' });
await sleep(5000);

await evaluate(`(() => { const btn = [...document.querySelectorAll('button')].find(b => b.innerText.includes('添加课程')); btn?.click(); return !!btn; })()`);
await sleep(1200);
console.log('弹窗打开:', await evaluate(`!!document.querySelector('.el-dialog')`));
console.log('弹窗内 select 数:', await evaluate(`document.querySelectorAll('.el-dialog .el-select').length`));
await evaluate(`(() => { const s = document.querySelector('.el-dialog .el-select'); s?.click(); return !!s; })()`);
await sleep(1500);
// 用真实鼠标事件点击第一个下拉项
const rect = await evaluate(`(() => {
  const o = document.querySelector('.el-select-dropdown__item');
  if (!o) return null;
  const r = o.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
})()`);
console.log('下拉项坐标:', JSON.stringify(rect));
if (rect) {
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: rect.x, y: rect.y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: rect.x, y: rect.y, button: 'left', clickCount: 1 });
  await sleep(800);
}
console.log('选中后显示:', await evaluate(`document.querySelector('.el-dialog .el-select__selected-item')?.innerText || document.querySelector('.el-dialog .el-select__placeholder')?.innerText || '?'`));
await evaluate(`(() => { const b = [...document.querySelectorAll('.el-dialog button')].find(x => x.innerText.includes('保存')); b?.click(); return !!b; })()`);
await sleep(1500);
console.log('保存后弹窗仍开:', await evaluate(`!!document.querySelector('.el-dialog')`));
console.log('周视图卡片:', await evaluate(`document.querySelectorAll('.entry').length`));
chrome.kill();
process.exit(0);
