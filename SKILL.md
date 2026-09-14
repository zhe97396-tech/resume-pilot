---
name: resume-pilot
description: "简历定制化生成与面试准备技能。基于求职者真实经历素材（内置项目弹药库 references/project-library.md + 基础档案 config/profile.yml，可选补充个人简历）、目标公司名称及岗位JD，生成与岗位高度匹配的定制化简历与面试准备材料（均为 Markdown，可经本地编辑器预览/导出）。适用场景：个人求职、职业咨询、就业辅导、猎头候选人包装、校园求职指导。触发条件：当用户提供目标公司名称、岗位JD或链接或招聘要求或岗位说明（或补充简历文件/文本），或表达定制简历、优化简历、分析公司、准备面试、生成投递材料、简历匹配岗位、打开简历编辑器（可视化预览/换模板/导出）等意图时调用。关键词：简历定制、简历优化、岗位匹配、面试准备、JD分析、求职、跳槽、投递材料、简历编辑器、预览简历。Resume customization and interview prep skill. Generates a tailored resume and interview preparation doc (both Markdown) from a real experience library, target company info, and job description."
agent_created: true
---

# Resume Customizer

## 首次使用

先初始化：`python scripts/setup.py`（检查环境 → 装依赖 → 从示例模板生成数据文件），
然后把数据目录下的 `config/profile.yml` 与 `references/project-library.md` 换成真实信息。

**数据目录**（由 `scripts/paths.py` 决定）：skill 安装（`npx skills add -g`）→ `~/.resume-pilot/`；克隆为项目 → 项目目录内。
规则文件（`SKILL.md`、方法论文档）随 skill 目录走，**用户数据**（档案/弹药库/故事库/问题库/`output/`）都在数据目录。
**不可把数据写在 skill 目录内**：`skills update` 会 `rm -rf` 该目录（见 `paths.py` 模块注释）。

> 查看当前数据目录：`python scripts/check-data.py --where`｜多套数据/测试隔离：环境变量 `RESUME_PILOT_HOME`。

> ⚠️ **未初始化时**（数据目录无 `config/profile.yml`）：**先按 `references/getting-started.md` 做首次接触引导**——介绍能做什么 → 给三步开始 → 再执行 `scripts/setup.py`；不得直接报错或编造数据。
> ⚠️ **仍为示例数据时**（profile.yml 为张三等）：提醒用户先替换（`generate_md.py` 已内置告警）。

详见 `README.md`。

## Overview

基于求职者真实经历（来源：`references/project-library.md` 项目弹药库 + `config/profile.yml` 基础档案，可选叠加用户提供的简历），结合目标公司公开信息与岗位JD，生成与岗位高度匹配的定制化简历（`resume.md`）及面试准备材料（`interview_prep.md`）。

核心价值：**选择优于优化**——从弹药库为每份 JD 挑选最合适的项目组合（而非在单一旧简历上换措辞），再经写作层按 JD 重写；同时判断岗位适配度、准备针对性面试问答与案例。

**两个数据源（写作前必读，勿在正文复制其内容）：**
- `config/profile.yml` = 简历骨架权威源：基本信息 + 职业阶段时间线（**铁律：AI 不改任职期/归属**）+ 项目分组策略 project_grouping + 个人优势维度库（含 content/applicable）+ 核心工具栈 tool_stack
- `references/project-library.md` = 项目弹药库：全部真实项目的事实层素材（背景/行动/量化结果/关键词/适用岗位）
- 用户提供简历时：用于**核对与补料**（弹药库未覆盖的经历、学历、联系方式等），不是替代弹药库的素材源

## When to Use

当用户提供目标公司名称、岗位JD/招聘要求/岗位链接（可选补充个人简历）时触发；
经历素材内置（弹药库 + 基础档案），**不提供简历也可开始**，提供则结果更贴近最新情况。

具体跑到哪一步由下方「意图路由」判定。

## 意图路由（先定范围，不必跑全流程）

用户一句话往往只对应流程的一段。**先判定意图 → 再决定执行范围**；用户明确说"只做X"时严格照范围执行，不要顺手把简历也生成了。

| 用户意图 | 典型表达 | 执行范围 |
|---------|---------|---------|
| 岗位适配分析 | "分析一下这个岗位适不适合我" | Phase 1（补缺）→ 2 |
| 简历定制（新建） | "根据这个 JD 定制简历" | Phase 1 → 2 → 2.5 → 3 → 5 |
| 简历优化（已有简历） | "帮我优化/改一下这份简历" | Phase 1（读简历）→ 2 → 3 → 5；**以用户简历为素材基准**，Phase 2.5 仅在用户要求从弹药库换/补项目时执行 |
| 面试准备 | "帮我准备这个岗位的面试" | Phase 1 → 2 → 4（已有简历则复用，不重生） |
| 投递材料（全流程） | "帮我准备投递材料" | Phase 1 → 2 → 2.5 → 3 → 5 → 4 |
| 换/传简历照片 | "帮我换张照片/换头像"、"照片怎么传" + 图片或路径 | **先引导，再动手**：按 `ENVIRONMENT.md` 的照片小节向用户说清三条（只有一张 `config/photo.jpg`；三种换法任选；走 AI 这条路需要**图片文件路径**，对话里贴图读不到字节），拿到路径后执行 `python scripts/set_photo.py <路径>`（自动备份旧图、默认压到长边 900px）；**不跑简历流程**，且仅在用户明确要求时更换 |
| 打开简历编辑器 | "打开编辑器"、"预览简历"、"换个模板/导出" | 按 `ENVIRONMENT.md`「启动简历编辑器」执行：agent 直接运行 skill 目录下的 `scripts/start_editor.py`（自动开浏览器）并把 URL 给用户；**不跑简历流程**，也不让用户去翻 skill 目录 |

判定不了就问一句，不要默认跑全流程。已在早前话轮完成过的阶段直接复用结论，不重复执行。

## Required Inputs

| 输入项 | 是否必须 | 说明 |
|--------|---------|------|
| 目标公司名称 | 必须 | 用于公司调研与文化匹配 |
| 岗位JD | 必须 | 文本、截图、链接均可；链接本机用 zhafron-web-search MCP 的 fetch_url 抓取，失败则要求用户贴文本/截图 |
| 个人简历 | 可选 | PDF/Word/文本均可；不提供则用内置弹药库（`references/project-library.md`）+ 基础档案（`config/profile.yml`）；提供则用于核对补料 |
| 补充信息 | 可选 | 个人意向、特殊要求、已有面试安排、需保全的经历等 |

若公司/JD 缺失，先询问用户补充，不要猜测或编造。

## Workflow

### Phase 1: 信息收集与确认

1. 读取用户提供的简历文件（如有）：纯文本直接读取；PDF/Word 用 markitdown MCP（convert_to_markdown）转为文本再解析；无 markitdown 时 PDF 用 pdf skill、Word 用 docx skill 提取。简历用于核对弹药库 + 补料，不作为唯一素材源（模型不能直接读图/PDF，工具用法见 `ENVIRONMENT.md`）
2. 若JD为链接，用 zhafron-web-search MCP 的 fetch_url 抓取完整岗位描述（或 markitdown convert_to_markdown 转文本）；抓取受限/需登录时，请用户提供文本或截图（截图需用户 OCR 或贴文字，勿依赖模型读图）
3. 若JD为图片，请用户 OCR 后贴文字，或用 markitdown/图像转文字工具提取（勿靠模型直接读图，见 `ENVIRONMENT.md`）
4. 确认以下要素已齐全，缺失则向用户询问：
   - 公司全称（避免简称歧义）
   - 完整JD（含岗位职责、任职要求、加分项）
   - 用户是否另有弹药库未覆盖的经历需要加入（如空窗期说明、最新动态）

### Phase 2: 分析与匹配

1. **素材盘点**：读取 `config/profile.yml`（时间线铁律）与 `references/project-library.md` **索引摘要表**（先只读索引，全量详情等选材后再按需读取）；用户提供了简历则解析后与弹药库交叉核对
2. **JD拆解**：参考 `references/jd-analysis-framework.md`，分两步：
   - **结构化提取**：核心硬性要求、岗位职责关键词、加分项/优先条件、隐性要求
   - **JD两层解码**：将JD中每条抽象要求往下拆解两层——第一层拆为可执行的行为类别，第二层拆为具体动作与实绩证据（工作数据+执行动作+沉淀材料）。常规JD有5-6条核心要求，逐条完成解码。
   - **核心相关方识别**：对每条解码后的行为，标注汇报对象和对接部门/人群，用于验证用户是否为真实操盘而非旁观参与。
3. **公司调研**：用搜索工具调研目标公司（本机首选 zhafron-web-search MCP 的 search_web；也可用 agent-reach skill）：
   - 主营业务与行业地位
   - 企业文化与价值观（用于简历语态调整）
   - 近期动态（融资、产品发布、战略方向）
4. **适配度评估**：以弹药库项目为参照，逐条与JD要求对照，输出匹配矩阵：
   - ✅ 已匹配项
   - ⚠️ 部分匹配项（有相关经验但需重新表达）
   - ❌ 缺口项（无直接经验，考虑可迁移能力替代）

### Phase 2.5: 项目选材（产出组合建议，须用户确认）

1. 基于 JD 拆解出的核心要求与关键词，与弹药库项目的「关键词标签 / 适用岗位 / 成果强度」匹配，选出候选项目
2. 按以下规则收敛到 3-4 个项目的组合：
   - **时间线铁律**：公司任职期、归属以 `config/profile.yml` career_stages 为准，不改动
   - **项目分组**：按 `config/profile.yml` 的 `project_grouping` 执行——`fixed` 池默认保留（`fixed_display` 指定从池中呈现几个，未配置则全部）、`incremental` 按 JD 相关性挑选；未配置的公司段，其全部项目按 JD 匹配度自由选材
   - **匹配优先**：优先 JD 关键词直接命中的项目；同一能力维度不重复选
   - **量化强度**：优先含 2 个以上量化成果的项目
   - **适用岗位匹配**：弹药库每个项目标有「适用岗位」——只选与当前 JD 岗位类型匹配的项目；通用项目各岗位可用，标了「限…岗位」的项目仅限所列岗位类型（详见弹药库索引表「适用岗位」列）
   - **个人项目隔离**：company 为「个人项目」的经历仅作为简历「项目经历」板块出现，绝不写入任何公司的工作经历段
   - **覆盖充分**：所选项目应能覆盖 JD 前 5 条核心要求
3. 输出**「项目组合建议」**给用户确认：每个选中项目 + 用途侧重 + 被裁减项目及原因。**用户确认或调整后才进入写作**（用户可能要求保全某段经历 / 增补弹药库外内容）

### Phase 3: 简历定制

> **写作素材**：Phase 2.5 确认的项目组合所对应的弹药库详情条目。弹药库只提供事实层，写入简历的每一条**必须按 JD 重写措辞**，不得照抄原文。

**执行前必读** `references/resume-writing-rules.md`（13 条完整写作规则）。配套细则：`anti-ai-guide.md`（表达质量）、`star-method-guide.md`（STAR/行为链条/证据三件套详解）、`resume-optimization-guide.md`（重排/模块/压缩）。

**执行摘要**（细则以规则文件为准）：

| # | 规则 | 要点 |
|---|------|------|
| 1 | JD解码→行为层重写 | 按解码出的行为类别/动作重写；覆盖行为链条 2-3 环节；嵌入相关方 |
| 2 | STAR 融合句 | 每段 2-3 条，单条≤2 行，数据内嵌 |
| 3 | 证据三件套 | 工作数据 + 执行动作 + 沉淀材料 |
| 4 | 证据重排 | 整体倒序；段内按 JD 关键词重排；弱相关时加「项目经历」板块 |
| 5 | 简历结构 | 模块顺序/取舍/命名按配置：JSON `layout` > profile.yml `resume_layout` > 默认；新增模块用 `extra_sections`；个人项目入 `project_experience` |
| 6 | 核心优势生成 | 从 profile.yml 维度库选 3-4 条；标签锁定；按 JD 加工 content |
| 7 | 关键词优化 | 融入 JD 高频词；专业技能按 JD 排序 |
| 8 | 语态与文化匹配 | 按公司类型调语态；动词开头 |
| 9 | AI 三版本压缩 | 极致/原版/适中，以适中为交付基础 |
| 10 | 项目分组 | 公司行 + ▶项目N；按 profile.yml `project_grouping` 区分固定保留（`fixed_display` 限呈现数）/增量挑选的项目 |
| 11 | 全经历语境化 | 每段都按 JD 调叙事侧重；不编造、不硬拗 |
| 12 | 专业技能生成 | 从 profile.yml tool_stack 读；仅按 JD 排序/裁剪，不新增 |
| 13 | 交付前自审 | 逐项核对，输出 `[自审]` 结果，未通过则回改 |

### Phase 4: 面试准备生成

输出 `output/<公司>/<岗位>/interview_prep.md`（MD 文件），流程见 `references/interview-prep-framework.md`：

1. **前置盘点（Step 0）**：继承 Phase 2 的适配度矩阵/Gap/公司调研；**推导当前职业状态并做时间线连续性检查**（非雇佣期/空窗须生成说明话术，见 `interview-personal-qa.md` §1）；生成 Gap 应对策略（同文件 §3）；**判定岗位类型并取该类型高频题+通用题+盲区题**（`interview-question-bank.md` §5）
2. **人设设计**：价值标题 + 项目证据验证 + **与 Gap 项不矛盾的自洽检查**（`interview-self-intro.md` §1）
3. **故事选择与口语化**：优先复用 `interview-story-bank.md`；无匹配则从选中项目现构并打磨口述版
4. **自我介绍多版本**：1/2/3 分钟 + 面向 HR/业务/高管，嵌入职业路径与钩子（每版 ≥2 个）
5. **项目内容问答**：四类问题 + 追问预判（**核心题 3-5 个做完整 L1-L4 且给答案**，其余 L1-L2）+ 反向验证 + 不会回答 5 步框架 + **核心题口述版**（`interview-qa-bank.md` §2）；**该岗位类型的高频题必覆盖、盲区题必补**
6. **个人内容问答**：职业状态/离职/空窗/公司选择/职业路径/规划/优劣势/薪资 + Gap 应对（`interview-personal-qa.md` §2-§3）
7. **面试攻略**：JD 关键词翻译表 / 招聘背景 / 反问库（覆盖全部面试官角色含 HR）/ 面试心态 / 注意事项 / 前检查清单（`interview-strategy.md`）
8. **公司调研摘要**：3-5 条可引用的真实信息（标注来源）
9. 完成后执行输出前自审（见 `interview-prep-framework.md` 末）；**关键数据/细节须有来源标注，无则标"待补充"**，不得自行补充

### Phase 5: 文档生成

1. 将定制简历内容整理为结构化 JSON。`work_experience[]` 每段支持两种形态（二选一）：
   - **项目分组形态（推荐）**：`{company, position, period, projects:[{name, bullets[流畅STAR融合句2-3条]}, ...]}` → 渲染为「公司行 + ▶项目一/二」
   - **纯列表形态（兼容）**：`{company, position, period, bullets:[...]}`（无项目分组时使用）
   - ⚠️ 写作要求：**项目内容用流畅完整句**（STAR 四要素压缩进同一句子，数据内嵌），**不要**拆成"背景/行动/成果"分段标签
   - 顶层可选 `include_personal_project: true`——仅 AI 产品经理类 JD 设置；非 AI 岗勿设
   - 键名：name/contact/target_position/target_company/summary/work_experience/**project_experience**/education/skills/additional（头部/教育/技能由 profile.yml 提供，JSON 中可省）
   - `project_experience`：独立「项目经历」板块（不受时间序限制）；个人项目应放此处，不放进任何公司的 work_experience
   - 可选结构字段：`layout`（模块顺序，覆盖 profile.yml 默认）+ `extra_sections`（自定义模块，如证书/获奖）+ `include_personal_project`（仅 AI 岗设 true）——详见 Phase 3 规则 5
2. 调用 `scripts/generate_md.py` 生成 Markdown 简历：
   ```bash
   python scripts/generate_md.py --data <resume.json> --company "<公司名>" --position "<岗位名>"
   ```
   输出到 `output/<公司>/<岗位>/resume.md`，同时在该目录保存 `resume.json`（便于后续重渲染）
3. 向用户报告 md 完整路径；如需可视化编辑/换模板/导出，按 `ENVIRONMENT.md`「启动简历编辑器」执行（agent 运行 skill 目录下的 `scripts/start_editor.py`，自动开浏览器 http://localhost:3201/editor/），**不要把路径丢给用户让他自己找**

## 写作红线（不可违背，速查）

| 红线 | 含义 |
|------|------|
| **不编造** | 只重写真实发生的事；"协助"不写"主导"；无数据不虚报 |
| **时间线铁律** | 任职期/项目归属以 `config/profile.yml` 为准 |
| **数据真实归属** | 弹药库数据不张冠李戴（A 项目成果不写进 B 项目） |
| **素材即事实层** | 弹药库是原始素材，写入简历必须按 JD 重写措辞，不照抄原文 |
| **融合句** | 禁用"背景/行动/成果"分段标签；数据内嵌于完整句 |
| **弱点不硬拗** | 与 JD 弱相关的段如实简洁保留，不虚构关联、不夸大 |

> 完整写作方法见 Phase 3，以及 `references/star-method-guide.md`（STAR/行为链条/证据三件套）、`references/anti-ai-guide.md`（去AI化/数据/脱敏）。

## 输出文档结构

**简历**（`resume.md`，渲染器 `scripts/generate_md.py`）：默认顺序 姓名/联系方式 → 求职意向 → 核心优势（3-4 条）→ 工作经历（公司行 + ▶项目N + 融合句）→ 教育背景 → 专业技能（核心工具栈）。
模块顺序/命名/取舍由 `layout` 配置控制（JSON > profile.yml `resume_layout` > 默认），详见 Phase 3 规则 5。

**面试准备**（`interview_prep.md`）：七板块结构见 `references/interview-prep-framework.md` §Step 8。

> JSON 结构见 Phase 5；内容写作规则见 Phase 3。

## 本机环境

运行前提、工具映射、路径注意、目录用途见 **`ENVIRONMENT.md`**（本文件不再重复存放环境事实）。

## References

> **路径约定**：`config/profile.yml`、`references/project-library.md`、`references/interview-story-bank.md`、`references/interview-question-bank.md`、`ENVIRONMENT.md` 是**用户数据文件**（在数据目录，见「首次使用」，不在本 skill 目录内）；其余均为方法论文档。

**首次使用**：`getting-started.md`（**未初始化时的首次接触引导**：能力清单 / 三步开始 / 数据填写对照 / 首句话术）

**数据文件**：`config/profile.yml`（基础档案：基本信息/职业阶段时间线铁律/项目分组 project_grouping/优势维度库/工具栈 tool_stack。简历骨架权威源，用户维护，AI 只读不写）｜`project-library.md`（项目弹药库：事实层素材，选材入口，先读索引再读详情）｜`interview-story-bank.md`（STAR+R 故事库）｜`interview-question-bank.md`（按岗位类型分层的问题库）

**方法论**：`resume-writing-rules.md`（**简历写作 13 条，Phase 3 前必读**）｜`anti-ai-guide.md`（去AI化/数据呈现/脱敏）｜`star-method-guide.md`（STAR/行为链条/证据三件套）｜`jd-analysis-framework.md`（JD 两层解码）｜`resume-optimization-guide.md`（排版/模块/压缩）｜`interview-prep-framework.md`（**面试主流程 Step 0-8**）｜`interview-self-intro.md`（人设/自我介绍）｜`interview-qa-bank.md`（项目向问答）｜`interview-personal-qa.md`（个人向问答/Gap）｜`interview-strategy.md`（JD 翻译表/反问/调研）

## Scripts

> 脚本统一通过 `scripts/paths.py` 解析数据路径，两种使用方式下均可用；不得在脚本内自行拼接数据路径。

`setup.py` 一键安装（见「首次使用」）｜`generate_md.py` 渲染简历（用法见 Phase 5）｜`set_photo.py` 换照片（用法见 `ENVIRONMENT.md`）｜`server.py` + `start_editor.py` 编辑器｜`check-data.py` 数据校验（`--where` 看数据目录）。完整清单与 `paths.py` 解析优先级见 `ENVIRONMENT.md`。
