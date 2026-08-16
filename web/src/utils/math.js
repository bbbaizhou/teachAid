import katex from 'katex';
import { marked } from 'marked';

/** 含换行/环境的多行公式应使用独立（display）模式渲染 */
function shouldDisplay(tex) {
  return /\\\\|\\begin|\\end|\n/.test(tex);
}

function renderOne(tex, display) {
  try {
    return katex.renderToString(tex, { displayMode: display, throwOnError: false, strict: false });
  } catch {
    return tex;
  }
}

/** 渲染一段纯文本中的 LaTeX 数学公式（$...$ 行内、$$...$$ 独立） */
export function renderMath(text = '') {
  if (!text) return '';
  const safe = String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return safe.replace(/\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g, (m, d, i) => {
    const tex = (d || i).trim();
    if (!tex) return m;
    return renderOne(tex, !!d || shouldDisplay(tex));
  });
}

/** 渲染 Markdown（先隔离公式，再走 marked，最后回填 KaTeX HTML） */
export function renderMarkdown(md = '') {
  if (!md) return '';
  const tokens = [];
  const escaped = String(md).replace(/\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g, (m, d, i) => {
    const id = `@@MATH${tokens.length}@@`;
    tokens.push({ id, display: !!d, tex: (d || i).trim() });
    return id;
  });
  let html = '';
  try {
    html = marked.parse(escaped);
  } catch {
    html = escaped;
  }
  for (const t of tokens) {
    html = html.split(t.id).join(renderOne(t.tex, t.display || shouldDisplay(t.tex)));
  }
  return html;
}

export const DIFF_LABEL = { basic: '基础级', intermediate: '进阶级', advanced: '提高级' };
export const DIFF_TYPE = { basic: 'primary', intermediate: 'warning', advanced: 'danger' };
export const TYPE_LABEL = { choice: '选择题', blank: '填空题', calc: '计算题', proof: '证明题' };
export const STATUS_LABEL = { not_started: '未开始', in_progress: '进行中', completed: '已完成' };
export const WEEK_LABEL = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
