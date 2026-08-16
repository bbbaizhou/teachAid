// 客户端导出文档生成（与后端 services/exportService.js 保持一致）

const DIFF_LABEL = { basic: '基础级', intermediate: '进阶级', advanced: '提高级' };
const TYPE_LABEL = { choice: '选择题', blank: '填空题', calc: '计算题', proof: '证明题' };
const STATUS_LABEL = { not_started: '未开始', in_progress: '进行中', completed: '已完成' };

export { DIFF_LABEL, TYPE_LABEL, STATUS_LABEL };

function now() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function esc(s = '') {
  return String(s).replace(/\|/g, '\\|').replace(/\n/g, '<br>');
}

/** 进度档案 Markdown */
export function progressMarkdown({ course, classes, chapters, board }) {
  const lines = [];
  lines.push(`# ${course.name} 教学进度档案`);
  lines.push('');
  lines.push(`- 课程代码：${course.code || '—'}`);
  lines.push(`- 学期：${course.semester || '—'}`);
  lines.push(`- 总课时：${course.total_hours || '—'}`);
  lines.push(`- 导出时间：${now()}`);
  lines.push('');
  lines.push('## 班级概览');
  lines.push('');
  lines.push('| 班级 | 专业 | 人数 | 已完成章节 | 平均进度 |');
  lines.push('| --- | --- | --- | --- | --- |');
  for (const cls of classes) {
    const rows = board.filter((b) => b.class_id === cls.id);
    const done = rows.filter((r) => r.status === 'completed').length;
    const pct = rows.length ? Math.round((rows.reduce((s, r) => s + r.taught_hours, 0) / Math.max(1, rows.reduce((s, r) => s + r.planned_hours, 0))) * 100) : 0;
    lines.push(`| ${esc(cls.name)} | ${esc(cls.major)} | ${cls.student_count ?? 0} | ${done}/${rows.length} | ${pct}% |`);
  }
  lines.push('');
  lines.push('## 各班级章节进度');
  lines.push('');
  for (const cls of classes) {
    lines.push(`### ${cls.name}（${cls.major || '专业未填'}）`);
    lines.push('');
    lines.push('| 章节 | 计划课时 | 已授课时 | 状态 | 当前知识点 | 备注 |');
    lines.push('| --- | --- | --- | --- | --- | --- |');
    const rows = board.filter((b) => b.class_id === cls.id);
    for (const r of rows) {
      lines.push(`| ${esc(r.chapter_title)} | ${r.planned_hours} | ${r.taught_hours} | ${STATUS_LABEL[r.status]} | ${esc(r.current_point)} | ${esc(r.note)} |`);
    }
    lines.push('');
  }
  lines.push('---');
  lines.push(`*由高数教学辅助系统自动导出 ${now()}*`);
  return lines.join('\n');
}

/** 习题文档 Markdown */
export function exercisesMarkdown({ title, items }) {
  const lines = [];
  lines.push(`# ${title}`);
  lines.push('');
  lines.push(`- 导出时间：${now()}`);
  lines.push('');
  const grouped = { basic: [], intermediate: [], advanced: [] };
  for (const it of items) (grouped[it.difficulty] || (grouped[it.difficulty] = [])).push(it);
  for (const diff of ['basic', 'intermediate', 'advanced']) {
    const list = grouped[diff];
    if (!list || !list.length) continue;
    lines.push(`## ${DIFF_LABEL[diff]}（${list.length} 题）`);
    lines.push('');
    list.forEach((q, i) => {
      lines.push(`### ${i + 1}. 【${TYPE_LABEL[q.type] || q.type}】`);
      lines.push('');
      lines.push(q.question || '');
      lines.push('');
      lines.push('**答案：**');
      lines.push('');
      lines.push(q.answer || '');
      lines.push('');
      lines.push('**解析：**');
      lines.push('');
      lines.push(q.solution || '');
      lines.push('');
    });
  }
  return lines.join('\n');
}

/** 下载文本文件 */
export function downloadText(text, filename) {
  const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

/** Markdown → Word(docx)：浏览器端用 docx 包动态生成 */
export async function markdownToDocxBlob(md) {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel } = await import('docx');
  const children = [];
  const rows = String(md).split('\n');
  for (const line of rows) {
    const t = line.trim();
    if (!t) { children.push(new Paragraph({ children: [] })); continue; }
    if (/^#\s+/.test(t)) {
      const level = t.match(/^(#+)/)[1].length;
      const text = t.replace(/^#+\s*/, '');
      children.push(new Paragraph({
        heading: level === 1 ? HeadingLevel.HEADING_1 : level === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3,
        children: [new TextRun({ text, bold: true })],
        spacing: { before: 200, after: 120 }
      }));
      continue;
    }
    if (/^\|/.test(t)) {
      const cells = t.split('|').slice(1, -1).map((c) => c.trim().replace(/\\\|/g, '|').replace(/<br>/g, ' ').replace(/^[*\-_]+|[*\-_]+$/g, ''));
      if (cells.every((c) => /^:?-{2,}:?$/.test(c))) continue;
      children.push(new Paragraph({ children: [new TextRun({ text: cells.join('  |  ') })], spacing: { after: 60 } }));
      continue;
    }
    if (/^[-*]\s+/.test(t)) {
      children.push(new Paragraph({
        children: [new TextRun({ text: '• ' + t.replace(/^[-*]\s+/, '') })],
        indent: { left: 360 }, spacing: { after: 60 }
      }));
      continue;
    }
    const clean = t.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*([^*]+)\*/g, '$1').replace(/`([^`]+)`/g, '$1');
    children.push(new Paragraph({ children: [new TextRun({ text: clean })], spacing: { after: 80 } }));
  }
  const doc = new Document({ sections: [{ properties: {}, children }] });
  return Packer.toBlob(doc);
}

export async function downloadDocx(md, filename) {
  const blob = await markdownToDocxBlob(md);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename + '.docx';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}
