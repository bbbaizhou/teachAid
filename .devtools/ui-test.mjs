// 移动端 UI 优化验证（浏览器本地模式）
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9226;
const profile = 'E:/vscodeProject/teachAid/.devtools/chrome-profile-ui';
mkdirSync(profile, { recursive: true });

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--disable-extensions',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  'about:blank'
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
const check = (name, ok, extra = '') => {
  console.log(`${ok ? '✅' : '❌'} ${name}${extra ? ' | ' + extra : ''}`);
  if (!ok) allOk = false;
};

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await send('Page.navigate', { url: 'http://127.0.0.1:8088/teachAid/' });
await sleep(5000);

// 1. 底部导航
const nav = await evaluate(`(() => {
  const tabs = [...document.querySelectorAll('.bottom-nav .tab')].map(t => t.innerText.trim());
  return { tabs, count: tabs.length, fixed: getComputedStyle(document.querySelector('.bottom-nav')).position };
})()`);
check('底部导航 5 个标签', nav.count === 5 && ['首页', '进度', '课表', 'AI', '更多'].every((t, i) => nav.tabs[i]?.includes(t)), JSON.stringify(nav.tabs));
check('底部导航固定定位', nav.fixed === 'fixed');

// 2. 进度页班级标签
await evaluate(`location.hash = '#/progress'`);
await sleep(2000);
const prog = await evaluate(`(() => {
  const tabs = [...document.querySelectorAll('.m-tab')].map(t => t.innerText.replace(/\\n/g, ' '));
  const rows = document.querySelectorAll('.m-ch-row').length;
  return { tabs, rows };
})()`);
check('进度页班级切换标签', prog.tabs.length === 2 && prog.rows === 12, `班级:${prog.tabs.join(' / ')} 章节行:${prog.rows}`);
await evaluate(`document.querySelectorAll('.m-tab')[1]?.click()`);
await sleep(800);
const switched = await evaluate(`(() => document.querySelector('.m-tab.active')?.innerText.includes('机械2302班'))()`);
check('切换班级生效', switched === true);

// 3. 课表页：直接向 IndexedDB 播种两节课 → 验证列表视图
//（headless 环境下拉浮层定位异常，此处绕过表单，仅验证列表视图 UI 与交互）
await evaluate(`location.hash = '#/schedule'`);
await sleep(2000);
await evaluate(`(async () => {
  const db = await new Promise((res, rej) => { const r = indexedDB.open('teachaid-db', 1); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const tx = db.transaction('schedule_entries', 'readwrite');
  const st = tx.objectStore('schedule_entries');
  st.put({ class_id: 1, weekday: 0, start_section: 1, end_section: 2, weeks: '1-16', location: '教1-201', note: '', status: 'normal' });
  st.put({ class_id: 2, weekday: 2, start_section: 5, end_section: 6, weeks: '1-16', location: '教3-405', note: '', status: 'normal' });
  return new Promise((res) => { tx.oncomplete = () => res(true); });
})()`);
await sleep(500);
// 重新加载课表页数据
await evaluate(`location.hash = '#/home'`);
await sleep(800);
await evaluate(`location.hash = '#/schedule'`);
await sleep(2000);
// 检查底部弹层在添加课程弹窗中（打开添加弹窗验证）
await evaluate(`(() => {
  const btn = [...document.querySelectorAll('button')].find(b => b.innerText.includes('添加课程'));
  btn?.click();
})()`);
await sleep(1000);
const sheet = await evaluate(`(() => {
  const d = document.querySelector('.el-dialog');
  if (!d) return null;
  const r = d.getBoundingClientRect();
  return { bottom: Math.round(r.bottom), vh: window.innerHeight, top: Math.round(r.top), radius: getComputedStyle(d).borderRadius };
})()`);
check('弹窗为底部弹层', !!sheet && sheet.bottom >= sheet.vh - 2 && sheet.top > 0, JSON.stringify(sheet));
check('弹窗顶部圆角', !!sheet && sheet.radius.includes('18px'));
// 关闭弹窗（esc）
await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' });
await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape' });
await sleep(800);
// 确认周视图显示课程卡片
const created = await evaluate(`document.querySelectorAll('.entry').length`);
check('周视图出现课程卡片', created >= 2, `卡片数:${created}`);
// 切到列表视图
await evaluate(`(() => {
  const btn = [...document.querySelectorAll('.el-radio-button')].find(b => b.innerText.includes('列表'));
  btn?.click();
})()`);
await sleep(1200);
const listView = await evaluate(`(() => ({
  hasList: !!document.querySelector('.day-group'),
  hasWeekGrid: !!document.querySelector('.table-scroll'),
  entries: document.querySelectorAll('.list-entry').length,
  groups: document.querySelectorAll('.day-group').length
}))()`);
check('列表视图显示且周视图隐藏', listView.hasList === true && listView.hasWeekGrid === false, `列表条目:${listView.entries} 分组:${listView.groups}`);
// 点击列表项打开编辑
await evaluate(`document.querySelector('.list-entry')?.click()`);
await sleep(1000);
const editOpened = await evaluate(`!!document.querySelector('.el-dialog')`);
check('点击列表项打开编辑弹窗', editOpened === true);

// 4. 全页无横向溢出
const overflow = await evaluate(`(() => {
  const doc = document.documentElement;
  return doc.scrollWidth > doc.clientWidth + 1;
})()`);
check('无横向溢出', overflow === false);

// 5. 桌面端回归（1440 宽度无底部导航、有侧边栏）
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await sleep(1200);
const desktop = await evaluate(`(() => ({
  hasAside: !!document.querySelector('.el-aside'),
  noBottomNav: !document.querySelector('.bottom-nav')
}))()`);
check('桌面端回归（侧边栏、无底部导航）', desktop.hasAside && desktop.noBottomNav);

console.log('---');
console.log(allOk ? '🎉 移动端 UI 优化验证全部通过' : '⚠️ 存在问题');
chrome.kill();
process.exit(allOk ? 0 : 1);
