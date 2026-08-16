import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const DATA_DIR = path.join(__dirname, '..', 'data');
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
export const BACKUP_DIR = path.join(DATA_DIR, 'backups');
mkdirSync(UPLOAD_DIR, { recursive: true });
mkdirSync(BACKUP_DIR, { recursive: true });

export const db = new DatabaseSync(path.join(DATA_DIR, 'teachaid.db'));
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

/** 本地时间字符串 YYYY-MM-DD HH:mm:ss */
export function now() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

db.exec(`
CREATE TABLE IF NOT EXISTS courses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  code TEXT DEFAULT '',
  semester TEXT DEFAULT '',
  total_hours INTEGER DEFAULT 48,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS classes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  major TEXT DEFAULT '',
  student_count INTEGER DEFAULT 0,
  note TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS chapters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  order_no INTEGER DEFAULT 0,
  planned_hours INTEGER DEFAULT 4,
  knowledge_points TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS progress (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  chapter_id INTEGER NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
  taught_hours REAL DEFAULT 0,
  status TEXT DEFAULT 'not_started',
  current_point TEXT DEFAULT '',
  note TEXT DEFAULT '',
  updated_at TEXT DEFAULT (datetime('now','localtime')),
  UNIQUE(class_id, chapter_id)
);

CREATE TABLE IF NOT EXISTS progress_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  progress_id INTEGER NOT NULL REFERENCES progress(id) ON DELETE CASCADE,
  hours REAL DEFAULT 0,
  note TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS schedule_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  weekday INTEGER NOT NULL,
  start_section INTEGER NOT NULL,
  end_section INTEGER NOT NULL,
  weeks TEXT DEFAULT '',
  location TEXT DEFAULT '',
  note TEXT DEFAULT '',
  status TEXT DEFAULT 'normal',
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS prep_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chapter_id INTEGER REFERENCES chapters(id) ON DELETE CASCADE,
  knowledge_point TEXT DEFAULT '',
  title TEXT NOT NULL,
  content TEXT DEFAULT '',
  tags TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now','localtime')),
  updated_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS prep_attachments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  prep_id INTEGER NOT NULL REFERENCES prep_items(id) ON DELETE CASCADE,
  filename TEXT DEFAULT '',
  url TEXT DEFAULT '',
  size INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS ai_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  chapter_id INTEGER,
  major TEXT DEFAULT '',
  style TEXT DEFAULT '',
  config TEXT DEFAULT '',
  content TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS question_bank (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chapter_id INTEGER REFERENCES chapters(id) ON DELETE CASCADE,
  difficulty TEXT DEFAULT 'basic',
  type TEXT DEFAULT 'calc',
  question TEXT NOT NULL,
  answer TEXT DEFAULT '',
  solution TEXT DEFAULT '',
  source TEXT DEFAULT '',
  is_mistake INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT DEFAULT ''
);
`);

/** 读取设置项（JSON 解析），带默认值 */
export function getSetting(key, fallback = null) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  if (!row) return fallback;
  try { return JSON.parse(row.value); } catch { return row.value; }
}

export function setSetting(key, value) {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, JSON.stringify(value));
}

// ---------- 首次运行种子数据 ----------
function seed() {
  const count = db.prepare('SELECT COUNT(*) AS c FROM courses').get().c;
  if (count > 0) return;

  const majors = ['计算机科学与技术', '机械工程', '经济管理', '电子信息工程', '土木工程'];
  setSetting('majors', majors);

  const sectionTimes = [
    ['1', '08:00-08:45'], ['2', '08:55-09:40'], ['3', '10:00-10:45'], ['4', '10:55-11:40'],
    ['5', '14:00-14:45'], ['6', '14:55-15:40'], ['7', '16:00-16:45'], ['8', '16:55-17:40'],
    ['9', '19:00-19:45'], ['10', '19:55-20:40'], ['11', '20:50-21:35'], ['12', '21:45-22:30']
  ];
  setSetting('sectionTimes', sectionTimes);

  setSetting('app', {
    name: '高数教学辅助系统',
    version: '0.1.0'
  });
  setSetting('ai', {
    provider: 'deepseek',
    apiKey: '',
    model: 'deepseek-chat',
    baseUrl: 'https://api.deepseek.com',
    temperature: 0.8
  });

  const insertCourse = db.prepare('INSERT INTO courses (name, code, semester, total_hours) VALUES (?, ?, ?, ?)');
  const info = insertCourse.run('高等数学A（示例课程）', 'MATH101', '2024-2025-1', 64);
  const courseId = Number(info.lastInsertRowid);

  const insertChapter = db.prepare(
    'INSERT INTO chapters (course_id, title, order_no, planned_hours, knowledge_points) VALUES (?, ?, ?, ?, ?)');
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
  chapters.forEach(([title, hours, kps], i) => {
    insertChapter.run(courseId, title, i + 1, hours, kps);
  });

  // 示例班级
  db.prepare('INSERT INTO classes (course_id, name, major, student_count) VALUES (?, ?, ?, ?)')
    .run(courseId, '计算机2301班', '计算机科学与技术', 42);
  db.prepare('INSERT INTO classes (course_id, name, major, student_count) VALUES (?, ?, ?, ?)')
    .run(courseId, '机械2302班', '机械工程', 38);
}

seed();
