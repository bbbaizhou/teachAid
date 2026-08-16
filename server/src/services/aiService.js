import { getSetting } from '../db.js';

const DEFAULT_MODEL = 'deepseek-chat';
const DEFAULT_BASE_URL = 'https://api.deepseek.com';

export function aiConfig() {
  const cfg = getSetting('ai', {});
  return {
    provider: cfg.provider || 'deepseek',
    apiKey: cfg.apiKey || process.env.DEEPSEEK_API_KEY || '',
    model: cfg.model || DEFAULT_MODEL,
    baseUrl: (cfg.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, ''),
    temperature: Number(cfg.temperature ?? 0.8)
  };
}

export function hasApiKey() {
  return !!aiConfig().apiKey;
}

/** 调用 OpenAI 兼容的 chat/completions 接口 */
export async function chat(messages, { temperature, json = false } = {}) {
  const cfg = aiConfig();
  if (!cfg.apiKey) {
    const err = new Error('尚未配置 AI API Key，请到「设置」页填写');
    err.code = 'NO_API_KEY';
    throw err;
  }
  const body = {
    model: cfg.model,
    messages,
    temperature: temperature ?? cfg.temperature,
    stream: false
  };
  if (json) body.response_format = { type: 'json_object' };
  const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${cfg.apiKey}`
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const err = new Error(`AI 接口调用失败 (HTTP ${res.status}): ${text.slice(0, 300)}`);
    err.code = 'AI_HTTP_ERROR';
    throw err;
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? '';
}

/** 测试连接：发一个极小的请求 */
export async function testConnection() {
  const out = await chat([
    { role: 'system', content: '你是一个测试助手。' },
    { role: 'user', content: '请只回复两个字：正常' }
  ], { temperature: 0 });
  return out;
}

// ---------------- 课程导入文案 ----------------

export function buildIntroPrompt({ chapterTitle, knowledgePoints, major, style, extra }) {
  const styleDesc = {
    'life': '【生活案例导入】从日常生活现象或大众熟悉的场景切入，自然引出本章的数学概念。',
    'major': '【专业应用导入】紧密结合该专业中的实际应用场景，说明本章数学知识在本专业的用武之地，激发专业认同感。',
    'question': '【问题悬念导入】用一个有悬念、有冲突感的问题或"反常识"现象开场，制造认知冲突，勾起学生求解欲望。'
  }[style] || '【生活案例导入】从日常生活现象切入，自然引出本章的数学概念。';

  return [
    {
      role: 'system',
      content: '你是一位经验丰富、讲课生动的高等数学教师，擅长为学生设计课堂导入环节。'
        + '你输出的文案自然流畅、有画面感，能迅速抓住学生注意力，并贴合学生的专业背景。'
        + '如涉及公式，请使用 LaTeX 语法（行内公式 $...$）。'
    },
    {
      role: 'user',
      content: `请为以下高等数学章节设计一段课堂导入文案（约 200～300 字），用于课程开始时使用。

章节：${chapterTitle}
本章知识点：${knowledgePoints || '（未填写）'}
授课对象专业：${major || '（未指定）'}
导入风格：${styleDesc}
${extra ? `补充要求：${extra}` : ''}

要求：
1. 语言生动、口语化，适合教师在课堂上直接讲；
2. 内容必须贴合「${major || '该专业'}」的学习背景，让该专业学生觉得"学这个有用"；
3. 结尾自然过渡到本章的核心概念与学习目标；
4. 只输出文案本身，不要输出标题、解释或多余说明。`
    }
  ];
}

// ---------------- 课程思政 ----------------

export function buildSizhengPrompt({ chapterTitle, knowledgePoints, major, theme, withScript, extra }) {
  const themeDesc = {
    'comprehensive': '综合融入：兼顾家国情怀、科学精神、辩证思维、文化自信等多个维度，自然融汇，不显生硬。',
    'patriotic': '【侧重：家国情怀与科技报国】重点结合中国科技成就（如航天、高铁、芯片、大科学装置、人工智能等）与本章数学知识的联系，激发学生科技报国、使命担当的热情。',
    'science': '【侧重：科学精神与严谨求实】突出数学的严密性与求真精神，结合数学家严谨治学、敢于质疑、追求真理的故事。',
    'dialectic': '【侧重：辩证思维与哲学思辨】从本章概念（如极限、无穷、连续、变换等）的哲学内涵切入，培养辩证唯物主义世界观与科学方法论。',
    'culture': '【侧重：文化自信与数学史】突出中国数学史贡献（如刘徽、祖冲之、《九章算术》等），增强学生的文化自信与民族自豪感。',
    'craft': '【侧重：工匠精神与精益求精】结合本章学习要点，强调精益求精、追求卓越、踏实严谨的职业精神。'
  }[theme] || '综合融入，兼顾多个思政维度，自然不生硬。';

  return [
    {
      role: 'system',
      content: '你是一位资深的高校教师兼课程思政专家，长期从事高等数学教学与课程思政建设，'
        + '擅长把思政元素"如盐入水"般自然融入数学课堂，不空洞说教、不牵强附会，'
        + '输出的内容具体、可操作、可直接用于备课。'
    },
    {
      role: 'user',
      content: `请为高等数学章节「${chapterTitle}」设计一份课程思政融入方案。

本章知识点：${knowledgePoints || '（未填写）'}
授课对象专业：${major || '（未指定）'}
思政侧重主题：${themeDesc}
${extra ? `补充要求：${extra}` : ''}

请严格按以下 Markdown 结构输出：

## 一、思政元素挖掘
列出 2～4 个思政元素（如：家国情怀、科学精神、辩证思维、文化自信、工匠精神、使命担当等），每条用一句话说明本章哪个知识点如何体现该元素。

## 二、融入案例与素材
给出 2～3 个具体案例或素材（古今中外数学家故事 / 中国科技成就 / 哲学思辨 / 社会热点），每个注明【对应知识点】。

## 三、课堂融入设计
给出 3～4 条融入设计，每条格式：**教学环节**（引入/讲解/例题/小结/作业）＋ 具体怎么讲（一两句话，给出可直接用的表述）。

${withScript ? `## 四、课堂话术示例（可直接口播）
写一段 150 字左右的思政导入话术，口语化、自然，能在一节课开头直接使用。` : ''}

要求：贴合「${major || '该专业'}」的学习背景；内容具体不空泛；语言自然，避免生硬说教；只输出上述 Markdown 内容，不要额外解释。`
    }
  ];
}

// ---------------- 练习题生成 ----------------

export function buildExercisePrompt({ chapterTitle, knowledgePoints, major, counts, types, extra, mistakeHints }) {
  const typeLabels = {
    choice: '选择题', blank: '填空题', calc: '计算题', proof: '证明题'
  };
  const typeLine = types.length
    ? types.map((t) => typeLabels[t] || t).join('、')
    : '选择题、填空题、计算题、证明题';
  const countLine = [
    counts.basic ? `基础级 ${counts.basic} 道` : '',
    counts.intermediate ? `进阶级 ${counts.intermediate} 道` : '',
    counts.advanced ? `提高级 ${counts.advanced} 道` : ''
  ].filter(Boolean).join('，');

  return [
    {
      role: 'system',
      content: '你是一位资深的高等数学命题教师，擅长根据教学章节和知识点命制高质量练习题，并且非常注重数学严谨性。'
        + '你命制的题目必须满足：'
        + '1) 题干、答案、解析中的数学公式一律使用 LaTeX 语法（行内公式 $...$，独立公式 $$...$$）；'
        + '2) 每道题的答案都经过严格推导验证，确保准确无误；'
        + '3) 解析必须给出关键步骤与解题思路，不能只给结果；'
        + '4) 难度把控严格遵循以下标准：'
        + '基础级(basic)：概念辨析、公式直接套用、基础计算，适合课后作业；'
        + '进阶级(intermediate)：多知识点结合、常规解题技巧、中等计算量，适合章节小测；'
        + '提高级(advanced)：证明题、综合应用题、拓展思维题，适合拔高训练。'
    },
    {
      role: 'user',
      content: `请为以下章节命制练习题：
章节：${chapterTitle}
知识点：${knowledgePoints || '（未填写，由你根据章节常识选取）'}
学生专业：${major || '（未指定）'}（题目可适当结合该专业的应用背景，但不要喧宾夺主）
题量配置：${countLine || '每级各 2 道'}
题型要求：${typeLine}
${extra ? `补充要求：${extra}` : ''}
${mistakeHints ? `\n以下为本校学生高频易错题（供你参考其易错点与难度，不要照抄原题）：\n${mistakeHints}` : ''}

请严格按照下面的 JSON 数组格式输出，不要输出任何多余文字：
[{"difficulty":"basic或intermediate或advanced","type":"choice或blank或calc或proof","question":"题目内容（含LaTeX公式）","answer":"答案","solution":"详细解析"}]
确保数组中的题目数量与题量配置一致。`
    }
  ];
}

/** 从模型输出中稳健地提取并规范化习题 JSON 数组 */
export function parseExercises(raw) {
  if (!raw) throw new Error('AI 未返回内容');
  let text = String(raw).trim();
  // 去掉代码块围栏
  text = text.replace(/```(?:json)?/gi, '');
  // 取第一个 [ 到最后一个 ] 之间的内容
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  let arr = null;
  if (start !== -1 && end > start) {
    try { arr = JSON.parse(text.slice(start, end + 1)); } catch { arr = null; }
  }
  if (!arr) {
    throw new Error('AI 返回内容无法解析为题目 JSON，请重试或调整题量后重新生成');
  }
  const diffMap = { basic: 'basic', 基础: 'basic', 基础级: 'basic', intermediate: 'intermediate', 进阶: 'intermediate', 进阶级: 'intermediate', advanced: 'advanced', 提高: 'advanced', 提高级: 'advanced' };
  const typeMap = { choice: 'choice', 选择: 'choice', 选择题: 'choice', blank: 'blank', 填空: 'blank', 填空题: 'blank', calc: 'calc', 计算: 'calc', 计算题: 'calc', proof: 'proof', 证明: 'proof', 证明题: 'proof' };
  return arr
    .filter((q) => q && (q.question || q.题干))
    .map((q, i) => ({
      id: i + 1,
      difficulty: diffMap[String(q.difficulty ?? q.难度 ?? '').toLowerCase()] || 'basic',
      type: typeMap[String(q.type ?? q.题型 ?? '').toLowerCase()] || 'calc',
      question: q.question ?? q.题干 ?? '',
      answer: q.answer ?? q.答案 ?? '',
      solution: q.solution ?? q.解析 ?? ''
    }));
}
