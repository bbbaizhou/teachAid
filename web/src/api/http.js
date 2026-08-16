// 服务模式（http）API 实现：调用 Express 后端
import axios from 'axios';

const http = axios.create({ baseURL: '/api', timeout: 120000 });

http.interceptors.response.use(
  (res) => res.data,
  (err) => {
    const msg = err.response?.data?.error || err.message || '请求失败';
    return Promise.reject(new Error(msg));
  }
);

export function initHttp() { return Promise.resolve(); }

// ---------- 课程 / 班级 / 章节 ----------
export const getCourses = () => http.get('/courses');
export const createCourse = (data) => http.post('/courses', data);
export const updateCourse = (id, data) => http.put(`/courses/${id}`, data);
export const deleteCourse = (id) => http.delete(`/courses/${id}`);
export const getCourseDetail = (id) => http.get(`/courses/${id}`);
export const getClasses = () => http.get('/classes');
export const createClass = (data) => http.post('/classes', data);
export const updateClass = (id, data) => http.put(`/classes/${id}`, data);
export const deleteClass = (id) => http.delete(`/classes/${id}`);
export const createChapter = (data) => http.post('/chapters', data);
export const updateChapter = (id, data) => http.put(`/chapters/${id}`, data);
export const deleteChapter = (id) => http.delete(`/chapters/${id}`);

// ---------- 进度 ----------
export const getProgressBoard = (courseId) => http.get('/progress/board', { params: { course_id: courseId } });
export const logProgress = (data) => http.post('/progress/log', data);
export const updateProgress = (id, data) => http.put(`/progress/${id}`, data);
export const getProgressLogs = (id) => http.get(`/progress/${id}/logs`);

// ---------- 课表 ----------
export const getSchedule = (params) => http.get('/schedule', { params });
export const createSchedule = (data) => http.post('/schedule', data);
export const updateSchedule = (id, data) => http.put(`/schedule/${id}`, data);
export const setScheduleStatus = (id, data) => http.post(`/schedule/${id}/status`, data);
export const deleteSchedule = (id) => http.delete(`/schedule/${id}`);
export const getTodaySchedule = () => http.get('/schedule/today');
export const getSectionTimes = () => http.get('/schedule/section-times');

// ---------- 备课 ----------
export const getPrepItems = (params) => http.get('/prep', { params });
export const getPrepItem = (id) => http.get(`/prep/${id}`);
export const createPrepItem = (data) => http.post('/prep', data);
export const updatePrepItem = (id, data) => http.put(`/prep/${id}`, data);
export const deletePrepItem = (id) => http.delete(`/prep/${id}`);
export const uploadPrepFile = (file) => {
  const fd = new FormData();
  fd.append('file', file);
  return http.post('/prep/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
};
export const addAttachment = (prepId, data) => http.post(`/prep/${prepId}/attachments`, data);
export const deleteAttachment = (id) => http.delete(`/prep/attachments/${id}`);

// ---------- AI ----------
export const getAiStatus = () => http.get('/ai/status');
export const testAi = () => http.post('/ai/test', {});
export const generateIntro = (data) => http.post('/ai/intro', data);
export const generateExercises = (data) => http.post('/ai/exercises', data);
export const getAiRecords = (type) => http.get('/ai/records', { params: { type } });
export const getAiRecord = (id) => http.get(`/ai/records/${id}`);
export const saveRecordToPrep = (id, data) => http.post(`/ai/records/${id}/save-to-prep`, data);

// ---------- 题库 ----------
export const getBankItems = (params) => http.get('/bank', { params });
export const createBankItem = (data) => http.post('/bank', data);
export const updateBankItem = (id, data) => http.put(`/bank/${id}`, data);
export const deleteBankItem = (id) => http.delete(`/bank/${id}`);
export const importBankItems = (items) => http.post('/bank/import', { items });

// ---------- 设置 ----------
export const getSettings = () => http.get('/settings');
export const saveSettings = (data) => http.put('/settings', data);
export const getNetworkInfo = () => http.get('/settings/network');

// ---------- 导出 / 备份 ----------
function triggerDownload(url) {
  const a = document.createElement('a');
  a.href = url;
  a.click();
}

export async function exportProgress(courseId, format = 'md') {
  triggerDownload(`/api/export/progress?course_id=${courseId}&format=${format}`);
  return { ok: true };
}

export async function exportExercises(recordId, format = 'md') {
  triggerDownload(`/api/export/exercises/${recordId}?format=${format}`);
  return { ok: true };
}

export async function packageChapter(chapterId) {
  triggerDownload(`/api/prep/package/${chapterId}`);
  return { ok: true };
}

export const createBackup = () => http.post('/export/backup');
export const getBackups = () => http.get('/export/backups');
export const deleteBackup = (name) => http.delete(`/export/backups/${name}`);
export const backupDownloadUrl = (name) => `/api/export/backups/${encodeURIComponent(name)}`;
