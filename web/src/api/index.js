// 双模式 API 分发器：
// - 服务模式（http）：Express + SQLite 后端（本机/局域网）
// - 浏览器模式（local）：IndexedDB 本地存储（GitHub Pages 静态部署）
// 启动时自动探测：能连上 /api/health 用服务模式，否则用浏览器模式。
import * as httpApi from './http.js';
import * as localApi from './local.js';

let mode = null; // 'http' | 'local'

export async function initApi() {
  let httpOk = false;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 1500);
    const res = await fetch('/api/health', { signal: ctrl.signal });
    clearTimeout(timer);
    httpOk = res.ok;
  } catch {
    httpOk = false;
  }
  mode = httpOk ? 'http' : 'local';
  if (mode === 'local') {
    await localApi.initLocal();
  } else {
    await httpApi.initHttp();
  }
  return mode;
}

export const isLocalMode = () => mode === 'local';
export const getMode = () => mode;

const impl = () => (mode === 'http' ? httpApi : localApi);

// ---------- 课程 / 班级 / 章节 ----------
export const getCourses = (...a) => impl().getCourses(...a);
export const createCourse = (...a) => impl().createCourse(...a);
export const updateCourse = (...a) => impl().updateCourse(...a);
export const deleteCourse = (...a) => impl().deleteCourse(...a);
export const getCourseDetail = (...a) => impl().getCourseDetail(...a);
export const getClasses = (...a) => impl().getClasses(...a);
export const createClass = (...a) => impl().createClass(...a);
export const updateClass = (...a) => impl().updateClass(...a);
export const deleteClass = (...a) => impl().deleteClass(...a);
export const createChapter = (...a) => impl().createChapter(...a);
export const updateChapter = (...a) => impl().updateChapter(...a);
export const deleteChapter = (...a) => impl().deleteChapter(...a);

// ---------- 进度 ----------
export const getProgressBoard = (...a) => impl().getProgressBoard(...a);
export const logProgress = (...a) => impl().logProgress(...a);
export const updateProgress = (...a) => impl().updateProgress(...a);
export const getProgressLogs = (...a) => impl().getProgressLogs(...a);

// ---------- 课表 ----------
export const getSchedule = (...a) => impl().getSchedule(...a);
export const createSchedule = (...a) => impl().createSchedule(...a);
export const updateSchedule = (...a) => impl().updateSchedule(...a);
export const setScheduleStatus = (...a) => impl().setScheduleStatus(...a);
export const deleteSchedule = (...a) => impl().deleteSchedule(...a);
export const getTodaySchedule = (...a) => impl().getTodaySchedule(...a);
export const getSectionTimes = (...a) => impl().getSectionTimes(...a);

// ---------- 备课 ----------
export const getPrepItems = (...a) => impl().getPrepItems(...a);
export const getPrepItem = (...a) => impl().getPrepItem(...a);
export const createPrepItem = (...a) => impl().createPrepItem(...a);
export const updatePrepItem = (...a) => impl().updatePrepItem(...a);
export const deletePrepItem = (...a) => impl().deletePrepItem(...a);
export const uploadPrepFile = (...a) => impl().uploadPrepFile(...a);
export const addAttachment = (...a) => impl().addAttachment(...a);
export const deleteAttachment = (...a) => impl().deleteAttachment(...a);

// ---------- AI ----------
export const getAiStatus = (...a) => impl().getAiStatus(...a);
export const testAi = (...a) => impl().testAi(...a);
export const generateIntro = (...a) => impl().generateIntro(...a);
export const generateSizheng = (...a) => impl().generateSizheng(...a);
export const generateExercises = (...a) => impl().generateExercises(...a);
export const getAiRecords = (...a) => impl().getAiRecords(...a);
export const getAiRecord = (...a) => impl().getAiRecord(...a);
export const saveRecordToPrep = (...a) => impl().saveRecordToPrep(...a);

// ---------- 题库 ----------
export const getBankItems = (...a) => impl().getBankItems(...a);
export const createBankItem = (...a) => impl().createBankItem(...a);
export const updateBankItem = (...a) => impl().updateBankItem(...a);
export const deleteBankItem = (...a) => impl().deleteBankItem(...a);
export const importBankItems = (...a) => impl().importBankItems(...a);

// ---------- 设置 ----------
export const getSettings = (...a) => impl().getSettings(...a);
export const saveSettings = (...a) => impl().saveSettings(...a);
export const getNetworkInfo = (...a) => impl().getNetworkInfo(...a);

// ---------- 导出 ----------
export const exportProgress = (...a) => impl().exportProgress(...a);
export const exportExercises = (...a) => impl().exportExercises(...a);
export const packageChapter = (...a) => impl().packageChapter(...a);

// ---------- 模式专属：备份 ----------
// 服务模式：服务器 zip 备份；浏览器模式：JSON 导出/导入
export const createBackup = (...a) => httpApi.createBackup(...a);
export const getBackups = (...a) => httpApi.getBackups(...a);
export const deleteBackup = (...a) => httpApi.deleteBackup(...a);
export const backupDownloadUrl = (...a) => httpApi.backupDownloadUrl(...a);
export const backupExport = (...a) => localApi.backupExport(...a);
export const backupImport = (...a) => localApi.backupImport(...a);

export default impl;
