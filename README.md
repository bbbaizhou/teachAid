# 🎓 高数教学辅助系统（个人自用版）

面向高校高等数学教师个人的**轻量本地教学管理工作台**。数据全部保存在本机，无服务器、无多用户、无云端上传；AI 能力按需接入 DeepSeek 大模型。

## ✨ 五大核心模块

| 模块 | 功能 |
| --- | --- |
| 📈 **课程教学进度跟踪** | 「班级 × 章节」矩阵看板，进度条 + 已授/剩余课时，一键登记课时（支持负数微调），班级间横向对比，登记流水，学期末导出教学档案（Word/Markdown） |
| 📅 **我的课程表** | 周视图网格（周一~周日 × 节次），班级/地点/节次/周次录入，调课/停课一键标注，今日课程卡片，课前 10 分钟桌面通知提醒 |
| 🪄 **AI 课程导入生成** | 选择「章节 + 学生专业 + 导入风格（生活案例 / 专业应用 / 问题悬念）」，AI 生成贴合专业的课堂导入文案，一键复制或存入备课资料 |
| 📝 **三级难度自动出题** | 基础级（课后作业）/ 进阶级（章节小测）/ 提高级（拔高训练）三档难度，题型可选（选择/填空/计算/证明），题量自由配置，生成题目 + 详细解析，导出 Word/Markdown，支持把高频易错题纳入本地题库、下次出题优先参考 |
| 📂 **备课内容整理** | 按「课程 - 章节 - 知识点」三级目录组织教案/PPT/导入文案，重点/难点/易错点/考研考点四类标签，关键词全文检索，附件上传（PPT/Word/图片），单章节一键打包导出 zip |

## 🚀 快速开始

### 方式一：一键启动（推荐）

双击运行根目录下的 **`启动教学辅助系统.bat`**，会自动启动后端并打开浏览器：
http://localhost:3001

### 方式二：手动启动

```bash
# 1. 启动后端（Express + SQLite，端口 3001，同时托管前端页面）
cd server
npm install        # 首次需要
npm start          # 或 npm run dev（改代码自动重启）

# 2. 浏览器访问
#    http://localhost:3001
```

### 📱 手机端使用（主要使用场景）

系统已针对手机屏幕全面适配（汉堡菜单导航、进度卡片视图、弹窗全屏化、横向滚动表格等）。手机访问方式：

1. 手机与电脑连接**同一个 WiFi**；
2. 电脑上保持本系统运行（双击 `启动教学辅助系统.bat`）；
3. 打开「设置 → 手机访问本系统」，复制显示的局域网地址（如 `http://192.168.1.99:3001`），在手机浏览器打开（也可从「设置」页一键复制）；
4. 若手机打不开：以**管理员身份**运行以下命令放行防火墙后重试：
   ```
   netsh advfirewall firewall add rule name=teachAid dir=in action=allow protocol=TCP localport=3001
   ```

> 服务启动时也会在控制台直接打印手机访问地址。桌面端（≥768px）自动恢复侧边栏与矩阵视图。

### 开发模式（改前端代码热更新）

```bash
cd web
npm install        # 首次需要
npm run dev        # Vite 开发服务器，端口 5173，/api 自动代理到 3001
```

前端改动后若要用于生产（Express 托管），执行 `cd web && npm run build` 即可，重启后端生效。

## ⚙️ 首次使用配置

1. **填 AI Key**：进入「设置」→ AI 模型设置，填入 DeepSeek API Key（[platform.deepseek.com](https://platform.deepseek.com) 申请），保存后可点「测试连接」。不填也能正常使用除 AI 生成外的所有功能。
2. **建课程**：进入「教学进度」→「新建课程」，填课程名与学期，可一次粘贴多行章节（每行 `标题,课时`）。
3. **录课表**：进入「我的课程表」→「添加课程」。
4. **配置专业**：在「设置」中维护你授课的几个专业，AI 生成时会作为选项。

## 🗄️ 数据与备份

- 所有数据位于 `server/data/`：
  - `teachaid.db` —— SQLite 数据库（课程/班级/进度/课表/备课/题库/设置）
  - `uploads/` —— 备课附件
  - `backups/` —— 自动/手动备份 zip
- **备份策略**：每天首次启动服务时自动备份一次；也可在「设置」页手动一键备份、下载、删除。
- 迁移电脑：复制整个 `server/data/` 目录即可。

## 🔌 技术栈

- 前端：Vue 3 + Element Plus + Vue Router + KaTeX（公式渲染）+ marked（Markdown）
- 后端：Node.js Express + 内置 `node:sqlite`（零原生依赖）
- AI：DeepSeek API（OpenAI 兼容协议，`baseUrl`/`model` 可在设置中改为其他兼容服务）

## 📁 项目结构

```
teachAid/
├── server/                  # 后端
│   └── src/
│       ├── index.js         # Express 入口（静态托管 + API）
│       ├── db.js            # SQLite 建库建表 + 种子数据
│       ├── routes/          # 各模块 API
│       │   ├── courses.js   # 课程/班级/章节
│       │   ├── progress.js  # 进度看板与登记
│       │   ├── schedule.js  # 课表
│       │   ├── prep.js      # 备课 + 附件 + 打包
│       │   ├── ai.js        # 导入文案/习题生成
│       │   ├── bank.js      # 本地题库
│       │   ├── settings.js  # 设置
│       │   └── export.js    # 导出 + 备份
│       └── services/
│           ├── aiService.js      # DeepSeek 调用 + 提示词
│           └── exportService.js  # Markdown/Word 生成
└── web/                     # 前端 (Vue 3 + Element Plus)
    └── src/
        ├── views/           # 8 个功能页面
        ├── components/      # MathText / MarkdownView
        ├── api/index.js     # 全部接口封装
        └── utils/math.js    # LaTeX 渲染工具
```

## 🔗 代码同步（GitHub）

- 远程仓库：`git@github.com:bbbaizhou/teachAid.git`（分支 `main`）
- **已配置自动推送**：本地每次 `git commit` 成功后，会自动同步到 GitHub（钩子文件 `.git/hooks/post-commit`）。
  - 若某次提交时未联网，代码仍安全保存在本地，之后手动执行 `git push origin main` 即可补推。
  - 想关闭自动推送：删除或重命名 `.git/hooks/post-commit`。
- 手动推送：`git add -A && git commit -m "说明" && git push origin main`

## 🌐 GitHub Pages 部署（全功能浏览器版）

系统支持**双模式**运行，自动切换：

| 模式 | 数据存储 | 适用场景 |
| --- | --- | --- |
| **服务模式** | 本机 SQLite（`server/data/`） | 本机 / 局域网访问（后端完整功能） |
| **浏览器模式** | 当前浏览器的 IndexedDB | GitHub Pages 静态部署，任何设备打开即用 |

浏览器模式说明（部署到 Pages 后默认启用）：
- 所有数据保存在**当前浏览器的 IndexedDB** 中，不跨设备/跨浏览器互通，请定期到「设置 → 数据备份」导出 JSON 备份；
- AI Key 在「设置」页填写，仅保存在本浏览器中；AI 生成由浏览器直连 DeepSeek；
- 换设备后：在「设置 → 数据备份 → 从备份恢复」导入 JSON 即可迁移。

### 部署步骤（已配置自动部署，仅需开启一次）

1. 代码推送到 GitHub 后，Actions 会自动构建并发布到 `gh-pages` 分支（工作流 `.github/workflows/deploy.yml`）；
2. 打开仓库 **Settings → Pages**，将 **Source** 设为 **Deploy from a branch**，分支选 **`gh-pages`**、目录 **`/ (root)`**，点 Save；
3. 等待 1~2 分钟后访问：**`https://bbbaizhou.github.io/teachAid/`**。

以后每次推送 `main` 分支代码，页面都会自动重新构建发布。

## 📝 使用提示

- 数学公式用 LaTeX 语法 `$...$`（行内）/ `$$...$$`（独立），系统会自动渲染，导出 Word 时公式以 LaTeX 源码形式保留。
- 生成的题目请**快速复核一遍答案**再发给学生（AI 偶尔会在复杂计算上出错，提示词已加入严格校验约束）。
- 调课/停课直接在课表卡片上点对应按钮，备注自动记录。
