// 极简 Promise 化 IndexedDB 封装 + 建库 + 首次种子数据
// 用于「浏览器本地模式」（GitHub Pages 静态部署），数据保存在当前浏览器中

const DB_NAME = 'teachaid-db';
const DB_VERSION = 1;

export const STORES = [
  'courses', 'classes', 'chapters', 'progress', 'progress_logs',
  'schedule_entries', 'prep_items', 'prep_attachments',
  'ai_records', 'question_bank', 'settings'
];

let dbPromise = null;

export function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('当前环境不支持 IndexedDB'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      for (const s of STORES) {
        if (!db.objectStoreNames.contains(s)) {
          db.createObjectStore(s, { keyPath: 'id', autoIncrement: true });
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function dbAll(storeName) {
  const db = await openDB();
  return reqToPromise(db.transaction(storeName).objectStore(storeName).getAll());
}

export async function dbGet(storeName, id) {
  const db = await openDB();
  return reqToPromise(db.transaction(storeName).objectStore(storeName).get(id));
}

/** 新增或更新；返回记录的 id */
export async function dbPut(storeName, obj) {
  const db = await openDB();
  const key = await reqToPromise(db.transaction(storeName, 'readwrite').objectStore(storeName).put(obj));
  return Number(key);
}

export async function dbDel(storeName, id) {
  const db = await openDB();
  await reqToPromise(db.transaction(storeName, 'readwrite').objectStore(storeName).delete(id));
}

export async function dbClear(storeName) {
  const db = await openDB();
  await reqToPromise(db.transaction(storeName, 'readwrite').objectStore(storeName).clear());
}

/** 本地时间字符串 YYYY-MM-DD HH:mm:ss */
export function now() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

// 默认 AI Key：部署时由 GitHub Actions 通过构建环境变量注入（安全，不进仓库）
const DEFAULT_AI_KEY = import.meta.env.VITE_DEFAULT_AI_KEY || '';

// ---------- 首次运行种子数据 ----------
export async function seedIfNeeded() {
  const seeded = await dbGet('settings', 'seeded');
  if (!seeded) {
    await dbPut('settings', { id: 'seeded', value: true });
    await dbPut('settings', { id: 'majors', value: ['计算机科学与技术', '机械工程', '经济管理', '电子信息工程', '土木工程'] });
    await dbPut('settings', {
      id: 'sectionTimes',
      value: [
        ['1', '08:00-08:45'], ['2', '08:55-09:40'], ['3', '10:00-10:45'], ['4', '10:55-11:40'],
        ['5', '14:00-14:45'], ['6', '14:55-15:40'], ['7', '16:00-16:45'], ['8', '16:55-17:40'],
        ['9', '19:00-19:45'], ['10', '19:55-20:40'], ['11', '20:50-21:35'], ['12', '21:45-22:30']
      ]
    });
    await dbPut('settings', { id: 'app', value: { name: '高数教学辅助系统', version: '0.2.0' } });
    await dbPut('settings', {
      id: 'ai',
      value: { provider: 'deepseek', apiKey: DEFAULT_AI_KEY, model: 'deepseek-chat', baseUrl: 'https://api.deepseek.com', temperature: 0.8 }
    });

    const courseId = await dbPut('courses', {
      name: '高等数学A（示例课程）', code: 'MATH101', semester: '2024-2025-1', total_hours: 64
    });

    const chapters = [
      ['第一章 函数与极限', 6, '函数概念与性质,数列极限,函数极限,无穷小与无穷大,极限运算法则,两个重要极限,函数的连续性与间断点'],
      ['第二章 导数与微分', 6, '导数的概念,求导法则,高阶导数,隐函数与参数方程求导,函数的微分'],
      ['第三章 微分中值定理与导数的应用', 8, '中值定理,洛必达法则,泰勒公式,函数单调性与凹凸性,极值与最值,曲率'],
      ['第四章 不定积分', 6, '不定积分的概念与性质,换元积分法,分部积分法,有理函数积分'],
      ['第五章 定积分', 6, '定积分的概念与性质,微积分基本定理,换元积分法与分部积分法,反常积分'],
      ['第六章 定积分的应用', 4, '平面图形面积,旋转体体积,平面曲线弧长,定积分在物理中的应用'],
      ['第七章 微分方程', 8, '微分方程的基本概念,可分离变量方程,一阶线性微分方程,可降阶的高阶方程,二阶常系数线性微分方程'],
      ['第八章 向量代数与空间解析几何', 4, '向量及其运算,平面与直线方程,曲面与空间曲线'],
      ['第九章 多元函数微分法及其应用', 8, '多元函数极限与连续,偏导数与全微分,复合函数与隐函数求导,方向导数与梯度,多元函数极值'],
      ['第十章 重积分', 6, '二重积分的概念与性质,二重积分的计算,三重积分,重积分的应用'],
      ['第十一章 曲线积分与曲面积分', 4, '曲线积分,格林公式,曲面积分,高斯公式与斯托克斯公式'],
      ['第十二章 无穷级数', 6, '常数项级数的概念与性质,正项级数审敛法,交错级数与绝对收敛,幂级数,傅里叶级数']
    ];
    for (const [i, [title, hours, kps]] of chapters.entries()) {
      await dbPut('chapters', { course_id: courseId, title, order_no: i + 1, planned_hours: hours, knowledge_points: kps });
    }

    await dbPut('classes', { course_id: courseId, name: '计算机2301班', major: '计算机科学与技术', student_count: 42, note: '' });
    await dbPut('classes', { course_id: courseId, name: '机械2302班', major: '机械工程', student_count: 38, note: '' });
  }

  // 已有数据但未配置 AI Key 时，用默认 Key 补齐（与 web 端保持一致）
  const ai = (await dbGet('settings', 'ai'))?.value || {};
  if (!ai.apiKey && DEFAULT_AI_KEY) {
    await dbPut('settings', { id: 'ai', value: { ...ai, apiKey: DEFAULT_AI_KEY } });
  }
}
