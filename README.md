# resume-pilot 简历定制器

> 把真实经历**按目标 JD 重新组装**成定制简历，并生成配套面试准备 —— 核心理念：**选择优于优化**。

运行在 AI coding agent（Pi / Claude Code / Codex）中的技能包：输入**目标公司 + 岗位 JD**，输出匹配该岗位的 **Markdown 简历**与**面试准备材料**。

---

## 为什么用它

传统做法的问题：一份简历投所有岗位 → 匹配度低；逐岗位手改措辞 → 耗时且容易失真。

本项目把简历拆成「**素材库** + **组装规则**」两层：

| 层 | 内容 | 特点 |
|---|---|---|
| 素材库（弹药库） | 你的真实经历：背景 / 行动 / 量化结果 | 一次沉淀，反复复用 |
| 组装规则 | 按 JD 选材 + 按 JD 重写 | 每份 JD 产出不同简历 |

**核心优势**

- 🎯 **按 JD 选材**：为每份 JD 从素材库挑最相关的 3-4 个项目组合，而非同一份简历换措辞
- ✍️ **事实不变、表达重写**：只调整叙事角度与语言，**绝不编造经历或数据**
- 🔍 **JD 深度拆解**：两层解码（抽象要求 → 行为类别 → 具体动作）+ 适配度矩阵 + Gap 识别
- 🎭 **去 AI 味**：数据三要素、空洞词控制、金额脱敏，读起来像真人写的
- 🎤 **配套面试准备**：人设定位、自我介绍多版本、项目问答（含 4 层追问预判）、反问清单
- 📈 **越用越强**：故事库 + 问题库随面试复盘持续累积

---

## 效果示例

输入一份 JD 后，产出 `output/<公司>/<岗位>/resume.md`（节选）：

```markdown
# 张三
- 13800000000
- zhangsan@example.com
- 6年工作经验

<!-- 本简历针对：某电商公司 | 电商产品经理 -->

## 核心优势

**商业化增长力**：主导从需求对接到流量分发再到转化闭环的变现路径设计，推动累计营收超 1500 万。

## 工作经历

**2022.03 - 至今　　　　　　　　　　　　　　　产品经理　　　　　　　　　　　　　　　甲公司**

**▶ 项目一：核心转化链路优化**

- 主导核心链路重构：通过漏斗分析逐层定位流失节点，重构关键入口与引导路径，转化率提升 35%。
```

同时产出 `interview_prep.md`（自我介绍逐字稿、问答提纲、JD 关键词翻译表、反问清单）。

---

## 前置条件（重要）

本项目是**放大器**，不是"无中生有器"——产出质量取决于你填入素材的质量：

| 你提供的素材 | 得到的产出 |
|---|---|
| 只有岗位职责描述 | 平实的职责罗列 |
| 有量化数据 + 具体动作 + 业务背景 | 有说服力、经得起面试深挖的经历 |

**建议**：填 `project-library.md` 时，每个项目写清 **背景（业务问题/约束）+ 动作（怎么做的）+ 结果（量化数据）**。素材不全也可以先跑一遍看效果，再逐步补充。

---

## 快速开始

### 1. 获取本项目

**方式 A：作为 Skill 安装（推荐，多 agent 通用）**

```bash
npx skills add zhe97396-tech/resume-pilot -g -y --agent '*'
```

装到 `~/.agents/skills/`（全局，跨 agent 共享）。不加 `-g` 则装到当前目录的项目级 skill，且会被询问装给哪些 agent。

> **你的数据存在 `~/.resume-pilot/`**（不在 skill 目录内）。这是刻意的设计：`skills update` 会 `rm -rf` 整个 skill 目录后重装（见 skills CLI 的 `cleanAndCreateDirectory`），数据放在里面**必然丢失**。脚本通过 `scripts/paths.py` 自动定位，你无需手工配置。

**方式 B：克隆为独立项目（推荐给想改规则/用编辑器的用户）**

```bash
git clone https://github.com/zhe97396-tech/resume-pilot.git
cd resume-pilot
```

此方式下数据就在项目目录内（已被 `.gitignore` 保护）。

### 2. 安装与初始化（必做一次）

```bash
python scripts/setup.py
```

一键完成：检查 Python 版本 → 安装依赖（PyYAML）→ 从示例模板生成数据文件 → 安装 git 钩子（若从 git 仓库克隆）。

> **git 钩子做什么**：提交前自动校验数据完整性，防止把「被示例内容覆盖的数据」误提交（真实事故防护）。如需绕过：`git commit --no-verify`。

想知道数据到底放在哪，随时运行 `python scripts/check-data.py --where`。

然后编辑这两份文件，填入**你的真实信息**（由 `.example` 模板生成，带注释）：

| 文件（相对数据目录） | 填什么 |
|------|--------|
| `config/profile.yml` | 基本信息、职业经历（时间线）、项目分组、优势维度、工具栈 |
| `references/project-library.md` | 你的真实项目素材（时间/公司/背景/行动与结果/关键词） |

### 3. 使用

两种方式任选，**效果相同**：

**方式 1：直接说话**（推荐，所有 agent 通用）

skill 的描述常驻 agent 上下文，agent 自行判断任务匹配后加载完整规则：

> 帮我根据这个 JD 定制简历
> 目标公司：XX公司
> JD：{粘贴完整 JD}

**方式 2：命令调用**（支持技能命令的 harness）

部分 agent 会把 skill 注册为 `/skill:<名称>` 命令，用于**强制加载**（绕开模型判断）：

```
/skill:resume-pilot 帮我根据这个 JD 定制简历
```

已在 Pi 验证可用（默认开启，设置项 `enableSkillCommands`）。其余 agent 有无此语法见下方「多 Agent 兼容」。

**按意图分步调用**（不必每次跑全流程）——skill 会按你的意图决定执行范围：

| 你说 | 它做什么 |
|------|---------|
| 分析一下这个岗位适不适合我 | 只做 JD 拆解 + 适配度评估（不写简历） |
| 根据这个 JD 定制简历 | 选材 → 写作 → 生成简历 |
| 帮我优化/改一下这份简历 | 以你的简历为基准改写（不从弹药库重新选材） |
| 帮我准备这个岗位的面试 | 出题 → 追问预判 → 自我介绍 → 反问清单（不重生简历） |
| 帮我准备投递材料 | 全流程：简历 + 面试准备 |

**没被识别怎么办**：见「多 Agent 兼容 → 验证与排查」。

### 4. （可选）打开可视化编辑器

| 平台 | 命令 |
|------|------|
| Windows | 双击 `start-editor.bat` |
| macOS / Linux | `./start-editor.sh` |
| 通用 | `python scripts/start_editor.py` |

自动打开浏览器（默认 `http://localhost:3201/editor/`；端口被占自动往后选，也可 `--port 4000` 指定）。支持实时预览、13 套样式模板、字体/边距/配色、显示/隐藏照片、换照片、导出 PDF 与长图。

---

## 适用场景

| ✅ 适合 | ❌ 不适合 |
|--------|----------|
| 有 2 段以上完整经历，想针对性投递 | 没有可写的经历（工具不会替你编造） |
| 想针对不同岗位产出不同简历 | 只想要一份"万能简历" |
| 需要配套的面试问题预判与准备 | 需要自动投递/自动打招呼等机器人功能 |

**支持的岗位**：方法论通用，**非技术类岗位效果最好** —— 产品、运营、市场、HR、销售、职能管理、项目管理等。

---

## 使用技巧

1. **素材越细，产出越强**：每个项目写清「遇到什么问题 → 怎么解决 → 什么结果」。
2. **优先补量化数据**：没有精确数据就写清量级或相对变化（如"效率提升约一倍"）。
3. **不必等档案完美**：先出一版看效果，再逐步补素材。
4. **善用「项目分组」**：在 `profile.yml` 的 `project_grouping` 声明"哪些项目必保留、哪些按 JD 挑"，产出更稳。
5. **结构也可自由定制**：改 `profile.yml` 的 `resume_layout` 可调整模块顺序（如教育前置）、改名（如"核心优势"→"个人优势"）、删模块（不想要的直接移除）；新增模块用 `extra_sections`（如"证书与培训""获奖经历"）。也支持在单份简历的 JSON 里用 `layout` 临时覆盖。
6. **面试后记得复盘**：把面试官问的问题发回给 agent，会沉淀进问题库，下次准备更准。

---

## FAQ

**Q：数据安全吗？** 全部在本地处理，**不采集、不上传任何数据**。服务仅监听 `127.0.0.1`（本机回环地址）——**同局域网/外网无法访问**。你的真实信息存于数据目录的 `config/profile.yml` 与 `references/project-library.md`（方式 A：`~/.resume-pilot/`；方式 B：项目目录内，已被 `.gitignore` 保护）。

**Q：`skills update` 会删掉我的数据吗？** **不会**。数据存在 `~/.resume-pilot/`，不在 skill 目录内。但注意：**不要把数据手工放回 skill 目录**，那样更新时会被删（脚本已全部改用 `scripts/paths.py` 定位，无需你干预）。

**Q：编辑器服务会不会被别人看到？** 不会。服务仅本机可访问（非局域网）；已启用 Host 头校验（防 DNS 重绑定）、来源校验（防恶意网页写入）、路径穿越防护。**不用时关闭服务窗口即可。**

**Q：需要联网吗？** 运行本身不需要（编辑器依赖已本地化）；AI 调研目标公司时需要。

**Q：能帮我编一些经历吗？** **不能**。核心约束就是"只重写表达、不编造事实"——虚构经历在面试深挖时必然穿帮。

**Q：为什么产出里姓名是"张三"？** 说明还没替换示例档案，请编辑 `config/profile.yml`（渲染时会提醒）。

**Q：技术岗适用吗？** 通用，但**产品/运营/市场/HR/销售/职能类**效果最好；技术岗对技术深度（架构、算法）的表达支持较弱。

**Q：可以自定义简历结构吗？** 可以。在 `config/profile.yml` 的 `resume_layout` 里调整模块顺序（如把教育背景放到前面）、改模块标题、删除不要的模块；用 `extra_sections` 新增模块（证书/获奖/作品集等）。默认顺序不变；单份简历也可在 JSON 里用 `layout` 临时覆盖。

**Q：可以自定义样式吗？** 可以。编辑器内置 13 套模板，支持调字体/字号/边距/行距/配色，还有 CSS 标签页可直接改样式并实时预览。

**Q：可以只准备面试吗？** 可以。直接说"帮我准备 XX 岗位的面试"+ 粘贴 JD。

---

## 多 Agent 兼容

遵循 [Agent Skills 标准](https://agentskills.io/specification)。

### 安装落点

`npx skills add -g` 把 skill 装进 **Universal 目录** `~/.agents/skills/resume-pilot/`（本体），并视 agent 情况接入其自身目录：

| 接入方式 | 说明 | 代表 agent |
|---------|------|-----------|
| **直接读 Universal 目录** | 装完即可见，无需额外步骤 | Cline、Cursor、Codex、OpenCode、Warp、Zed、Dexto、Loaf 等 |
| **符号链接到各自目录** | 安装器自动建（Windows 下为 junction） | Pi → `~/.pi/agent/skills/`；Claude Code → `~/.claude/skills/` |

> Pi 同时扫描 `~/.agents/skills/` 与 `~/.pi/agent/skills/`，两种方式对它都生效。
> Windows 上建链可能因权限失败，安装器会自动退化为**复制**（效果相同，但更新时需重新安装）。

### 命令语法

| Agent | `/skill:` 命令 | 说明 |
|-------|--------------|------|
| Pi | ✅ 有 | `/skill:resume-pilot`；默认开启，设置项 `enableSkillCommands` 可关 |
| 其他 agent | 视实现而定 | 不保证有；**自然语言始终可用**，两者等效 |

### 验证与排查

装完建议做一次验证：

```bash
npx skills list -g              # 应列出 resume-pilot（Scope=global）
ls ~/.agents/skills/resume-pilot/SKILL.md   # 应存在
```

再直接问你的 agent：「你现在能看到哪些 skill？」——能报出 `resume-pilot` 即识别成功。

**若没被识别**，按顺序排查：

1. **指定该 agent 重装**：`npx skills add zhe97396-tech/resume-pilot -g -a <agent>`（agent 名如 `pi`、`claude-code`、`codex`、`cursor`）
2. **全量安装**：`npx skills add zhe97396-tech/resume-pilot -a '*' -y`（含建链）
3. **手动引用**：把 `~/.agents/skills`（或 `~/.agents/skills/resume-pilot`）加进该 agent 的 skills 设置。例如 Pi 的 `settings.json`：
   ```json
   { "skills": ["~/.agents/skills/resume-pilot"] }
   ```
4. **兜底（一定可行）**：不走 skill 机制，改用「克隆为独立项目」方式，直接告诉 agent 路径：
   > 读 `D:\path\to\resume-pilot\SKILL.md` 并按它执行

> 项目级 skill（`.pi/skills/`、`.agents/skills/`）在 Pi 中需先信任该项目才会加载；全局安装无此限制。

---

## 项目结构

分**技能目录**（规则与工具，随仓库走）与**数据目录**（你的真实信息，与仓库分离）两部分。

**技能目录**（方式 A：`~/.agents/skills/resume-pilot/`；方式 B：项目目录）：

```
resume-pilot/
├── SKILL.md                          # 主流程（阶段 + 意图路由 + 红线）
├── README.md                         # 本文件
├── ENVIRONMENT.example.md            # 环境适配说明模板
├── config/profile.example.yml        # 基础档案模板
├── references/                       # 方法论文档 + 数据文件模板
│   ├── project-library.example.md    # 项目弹药库模板
│   ├── resume-writing-rules.md       # 简历写作 13 条规则
│   ├── star-method-guide.md          # STAR / 行为链条 / 证据三件套
│   ├── jd-analysis-framework.md      # JD 两层解码
│   ├── anti-ai-guide.md              # 去 AI 味 / 数据呈现 / 脱敏
│   ├── resume-optimization-guide.md  # 重排 / 模块 / 压缩
│   └── interview-*.md                # 面试体系（人设/问答/攻略）
├── scripts/                          # paths.py 路径解析｜setup.py 初始化
│   ├── generate_md.py               # 简历渲染
│   └── server.py / start_editor.py   # 编辑器本地服务与启动器
└── editor/                           # MD 简历编辑器前端（依赖已本地化，可离线）
```

**数据目录**（方式 A：`~/.resume-pilot/`；方式 B：项目目录内）：

```
.resume-pilot/
├── config/
│   ├── profile.yml                   # ← setup.py 生成，你填真实信息
│   └── photo.jpg                     # 可选：简历头像（编辑器可换图，或直接替换此文件）
├── references/
│   ├── project-library.md            # ← 你填真实项目素材
│   ├── interview-story-bank.md       # 随面试复盘累积
│   └── interview-question-bank.md    # 随面试复盘累积
├── ENVIRONMENT.md                    # 你的环境适配说明
└── output/                           # 生成产物
    └── <公司>/<岗位>/                 # resume.md + resume.json + interview_prep.md
```

这样分离的理由：`skills update` 会重建整个技能目录，用户数据放在里面会丢。

---

## 环境要求

- **Python 3.9+**（推荐 3.10+），唯一依赖 `PyYAML`
- 编辑器前端依赖已本地化，无需联网
- 支持 **Windows / macOS / Linux**
- 需要一个支持 Skill 机制的 AI coding agent（或按 `SKILL.md` 手动执行流程）

---

## License

[MIT](LICENSE)
