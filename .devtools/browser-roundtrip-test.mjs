// 浏览器模式（IndexedDB）完整导出→清空→导入 往返测试
// 导出：拦截 a.click 捕获 blob → fetch 内容（不依赖下载管理器）
// 导入：页面内执行与 backupImport 等价的恢复逻辑
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9235;
const profile = 'E:/vscodeProject/teachAid/.devtools/chrome-profile-rt2';
import { rmSync } from 'node:fs';
rmSync(profile, { recursive: true, force: true });
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
await send('Page.navigate', { url: 'http://127.0.0.1:8088/teachAid/#/' });
await sleep(5000);

// 拦截 blob 下载
await evaluate(`(() => {
  window.__capturedBlob = null;
  const orig = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    if (this.download && typeof this.href === 'string' && this.href.startsWith('blob:')) window.__capturedBlob = this.href;
    return orig.call(this);
  };
  return true;
})()`);

// 1. 造测试数据
await evaluate(`(async () => {
  const db = await new Promise((res, rej) => { const r = indexedDB.open('teachaid-db', 1); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const w = (s, o) => new Promise((res, rej) => { const t = db.transaction(s, 'readwrite'); t.objectStore(s).put(o); t.oncomplete = () => res(); t.onerror = () => rej(t.error); });
  await w('progress', { class_id: 1, chapter_id: 1, taught_hours: 2, status: 'in_progress', current_point: '两个重要极限', note: '往返测试', updated_at: '2026-08-16 12:00:00' });
  await w('progress_logs', { progress_id: 1, hours: 2, note: '往返测试', created_at: '2026-08-16 12:00:00' });
  await w('schedule_entries', { class_id: 1, weekday: 1, start_section: 3, end_section: 4, weeks: '1-16', location: '教1-201', note: '', status: 'normal' });
  await w('prep_items', { chapter_id: 1, knowledge_point: '', title: '往返测试教案', content: '## 测试', tags: '重点', created_at: '2026-08-16 12:00:00', updated_at: '2026-08-16 12:00:00' });
  await w('question_bank', { chapter_id: 1, difficulty: 'basic', type: 'calc', question: '求极限。', answer: '1', solution: '略', source: '测试', is_mistake: 0, created_at: '2026-08-16 12:00:00' });
  return 'seeded';
})()`);
console.log('✅ 浏览器测试数据就绪');

// 2. 设置页 → 导出（捕获 blob 内容）
await evaluate(`location.hash = '#/settings'`);
await sleep(2000);
await evaluate(`(() => { const b = [...document.querySelectorAll('button')].find(x => x.innerText.includes('导出完整数据')); b?.click(); return !!b; })()`);
await sleep(1200); // 尽快抓取，避免 blob 被 3s 后自动吊销
const captured = await evaluate(`window.__capturedBlob`);
check('导出 blob 已生成', typeof captured === 'string' && captured.startsWith('blob:'));
let exportJson = null;
if (captured) {
  const text = await evaluate(`(async () => { const r = await fetch(window.__capturedBlob); return await r.text(); })()`);
  try {
    exportJson = JSON.parse(text);
  } catch (e) {
    console.log('解析失败:', String(text).slice(0, 100));
  }
}
const summary = exportJson ? Object.fromEntries(Object.entries(exportJson.data).map(([k, v]) => [k, v.length])) : null;
console.log('导出内容:', JSON.stringify(summary));
check('导出含进度(2课时)', !!exportJson && exportJson.data.progress?.[0]?.taught_hours === 2);

// 3. 清空 IndexedDB → 刷新重新种子
await evaluate(`(async () => {
  const db = await new Promise((res, rej) => { const r = indexedDB.open('teachaid-db', 1); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  for (const n of [...db.objectStoreNames]) {
    await new Promise((res, rej) => { const t = db.transaction(n, 'readwrite'); t.objectStore(n).clear(); t.oncomplete = () => res(); t.onerror = () => rej(t.error); });
  }
  return true;
})()`);
await send('Page.reload');
await sleep(5000);
const freshCourses = await evaluate(`(async () => {
  const db = await new Promise((res, rej) => { const r = indexedDB.open('teachaid-db', 1); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  return new Promise((res) => { const g = db.transaction('courses').objectStore('courses').count(); g.onsuccess = () => res(g.result); });
})()`);
check('清空后重新种子', freshCourses === 1, 'courses=' + freshCourses);

// 4. 用导出的 JSON 恢复（等价于 backupImport 核心逻辑）
const restore = await evaluate(`(async () => {
  const text = ${JSON.stringify(JSON.stringify(exportJson))};
  const parsed = JSON.parse(text);
  if (parsed.app !== 'teachaid' || !parsed.data) return 'bad-format';
  const db = await new Promise((res, rej) => { const r = indexedDB.open('teachaid-db', 1); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const stores = ['courses','classes','chapters','progress','progress_logs','schedule_entries','prep_items','prep_attachments','ai_records','question_bank','settings'];
  for (const s of stores) {
    await new Promise((res, rej) => { const t = db.transaction(s, 'readwrite'); t.objectStore(s).clear(); t.oncomplete = () => res(); t.onerror = () => rej(t.error); });
  }
  for (const s of Object.keys(parsed.data)) {
    for (const row of parsed.data[s] || []) {
      const r = { ...row }; // 保留原 id，保证外键一致（与真实 backupImport 一致）
      if (r.blobBase64) { const bin = atob(r.blobBase64); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); r.blob = new Blob([u8]); delete r.blobBase64; }
      await new Promise((res, rej) => { const t = db.transaction(s, 'readwrite'); t.objectStore(s).put(r); t.oncomplete = () => res(); t.onerror = () => rej(t.error); });
    }
  }
  await new Promise((res, rej) => { const t = db.transaction('settings', 'readwrite'); t.objectStore('settings').put({ id: 'seeded', value: true }); t.oncomplete = () => res(); t.onerror = () => rej(t.error); });
  return 'restored';
})()`);
check('恢复执行', restore === 'restored', String(restore));

// 5. 刷新后校验进度页
await send('Page.reload');
await sleep(5000);
const dbState = await evaluate(`(async () => {
  const db = await new Promise((res, rej) => { const r = indexedDB.open('teachaid-db', 1); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const cnt = async (s) => new Promise((res) => { const g = db.transaction(s).objectStore(s).count(); g.onsuccess = () => res(g.result); });
  const first = async (s) => new Promise((res) => { const g = db.transaction(s).objectStore(s).getAll(); g.onsuccess = () => res((g.result || [])[0] || null); });
  return {
    courses: await cnt('courses'), classes: await cnt('classes'), chapters: await cnt('chapters'),
    progress: await cnt('progress'),
    course0: await first('courses'), class0: await first('classes')
  };
})()`);
console.log('恢复后 IndexedDB:', JSON.stringify(dbState));
await evaluate(`location.hash = '#/progress'`);
await sleep(2500);
const restored = await evaluate(`(() => {
  const row = document.querySelector('.m-ch-row');
  return { txt: row?.innerText?.replace(/\\n/g, ' ') || '(空)', cards: document.querySelectorAll('.m-ch-row').length, body: (document.body.innerText || '').slice(0, 60).replace(/\\n/g, ' ') };
})()`);
console.log('恢复后进度行:', restored.txt, '| body:', restored.body);
check('导入后进度还原(2/6课时 33%)', restored.txt.includes('2 /') && restored.txt.includes('6'), restored.txt);
check('章节列表完整(12行)', restored.cards === 12, 'cards=' + restored.cards);

console.log('---');
console.log(allOk ? '🎉 浏览器模式往返测试通过' : '⚠️ 存在问题');
chrome.kill();
process.exit(allOk ? 0 : 1);
