// 零依赖移动端 QA：通过 Chrome DevTools Protocol 驱动真实浏览器
// 用法：node mobile-qa.mjs <chrome路径>
const CHROME = process.argv[2] || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9222;
const APP = 'http://localhost:3001';

import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const profile = 'E:/vscodeProject/teachAid/.devtools/chrome-profile';
mkdirSync(profile, { recursive: true });

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
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
  throw new Error('无法连接 Chrome DevTools');
}

let msgId = 0;
const pending = new Map();
let ws;

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++msgId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error('JS异常: ' + JSON.stringify(r.exceptionDetails.exception?.description || r.exceptionDetails));
  return r.result?.value;
}

const target = await getTarget();
ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) {
    const { resolve, reject } = pending.get(m.id);
    pending.delete(m.id);
    m.error ? reject(new Error(m.error.message)) : resolve(m.result);
  }
};

// 移动端视口
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await send('Page.enable');
await send('Runtime.enable');
await send('Page.navigate', { url: APP + '/#/' });
await sleep(4000);

const routes = [
  ['/', '首页'],
  ['/progress', '教学进度'],
  ['/schedule', '我的课程表'],
  ['/intro', 'AI 课程导入'],
  ['/exercises', '习题生成'],
  ['/prep', '备课整理'],
  ['/bank', '本地题库'],
  ['/settings', '设置']
];

let allOk = true;
for (const [route, name] of routes) {
  await evaluate(`location.hash = '#${route}'`);
  await sleep(1800);
  const result = await evaluate(`(() => {
    const doc = document.documentElement;
    const overflowX = doc.scrollWidth > doc.clientWidth + 1;
    const bodyOverflow = document.body.scrollWidth > document.body.clientWidth + 1;
    const hasHamburger = !!document.querySelector('.hamburger');
    const hasAside = !!document.querySelector('.el-aside');
    return {
      title: document.title,
      route: location.hash,
      clientW: doc.clientWidth,
      scrollW: doc.scrollWidth,
      bodyScrollW: document.body.scrollWidth,
      overflowX, bodyOverflow,
      hasHamburger, hasAside,
      pageCards: document.querySelectorAll('.page-card').length,
      text: (document.body.innerText || '').slice(0, 60).replace(/\\n/g, ' ')
    };
  })()`);
  const ok = !result.overflowX && !result.bodyOverflow && result.hasHamburger && !result.hasAside;
  if (!ok) allOk = false;
  console.log(`${ok ? '✅' : '❌'} ${name} | 宽度 ${result.clientW}/${result.scrollW} 溢出:${result.overflowX || result.bodyOverflow} 汉堡:${result.hasHamburger} 侧栏:${result.hasAside} | 文本: ${result.text}`);
}

// 抽屉导航交互测试
await evaluate(`location.hash = '#/'`);
await sleep(1500);
await evaluate(`document.querySelector('.hamburger').click()`);
await sleep(800);
const drawer = await evaluate(`(() => {
  const d = document.querySelector('.el-drawer');
  return { open: !!d && d.offsetParent !== null, menuItems: document.querySelectorAll('.el-drawer .el-menu-item').length };
})()`);
console.log(`${drawer.open ? '✅' : '❌'} 抽屉菜单打开: ${drawer.open}, 菜单项: ${drawer.menuItems}`);
if (!drawer.open) allOk = false;

// 弹窗宽度测试（移动端应 92%）
await evaluate(`location.hash = '#/progress'`);
await sleep(1500);
await evaluate(`document.querySelector('.hamburger').click()`);
await sleep(500);
await evaluate(`(() => { const items = document.querySelectorAll('.el-drawer .el-menu-item'); items[0].click(); })()`);
await sleep(1200);
await evaluate(`document.querySelector('.el-drawer') && document.body.click()`);
await sleep(300);

// 进度页登记弹窗打开（移动端卡片视图）
await evaluate(`location.hash = '#/progress'`);
await sleep(1800);
const regOpened = await evaluate(`(() => {
  const rows = document.querySelectorAll('.m-ch-row');
  if (rows.length) { rows[0].click(); return true; }
  return false;
})()`);
await sleep(1000);
const dialogW = await evaluate(`(() => {
  const d = document.querySelector('.el-dialog');
  if (!d) return null;
  const rect = d.getBoundingClientRect();
  return { w: Math.round(rect.width), vw: window.innerWidth, pct: Math.round(rect.width / window.innerWidth * 100) };
})()`);
console.log(`${regOpened ? '✅' : '❌'} 移动端点击章节行可打开登记弹窗, 弹窗宽度占比: ${dialogW ? dialogW.pct + '%' : '未检测到'}`);
if (!regOpened || !dialogW || dialogW.pct > 95) allOk = false;

// 桌面端回归：1440 宽度应恢复侧边栏与矩阵表格
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await sleep(1200);
const desktop = await evaluate(`(() => ({
  hasAside: !!document.querySelector('.el-aside'),
  hasTable: !!document.querySelector('.el-table'),
  hasMobileCards: !!document.querySelector('.m-class-card'),
  overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
}))()`);
console.log(`${desktop.hasAside && desktop.hasTable && !desktop.hasMobileCards && !desktop.overflowX ? '✅' : '❌'} 桌面端回归: 侧栏:${desktop.hasAside} 矩阵表格:${desktop.hasTable} 移动卡片隐藏:${!desktop.hasMobileCards} 溢出:${desktop.overflowX}`);
if (!(desktop.hasAside && desktop.hasTable && !desktop.hasMobileCards && !desktop.overflowX)) allOk = false;

console.log('---');
console.log(allOk ? '🎉 移动端适配全部通过' : '⚠️ 存在需修复的问题');
chrome.kill();
process.exit(allOk ? 0 : 1);
