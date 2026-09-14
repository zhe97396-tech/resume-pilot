# 环境适配说明（ENVIRONMENT.example.md）

> 本文件说明本技能包对**运行环境的要求**与**常见适配点**。
> 复制为 `ENVIRONMENT.md` 并按你的实际环境修改（或直接参考即可，多数情况无需改）。
> 本文件只讲环境事实，不涉及简历方法论。

## 数据目录（先看这里）

用户数据（真实档案/弹药库/故事库/问题库/生成产物）**不在技能目录内**，位置由 `scripts/paths.py` 统一决定：

| 使用方式 | 数据目录 |
|---------|---------|
| 作为 skill 安装（`npx skills add -g`） | `~/.resume-pilot/` |
| 克隆为独立项目（`git clone`） | 项目目录内 |

- 查看当前解析结果：`python scripts/paths.py` 或 `python scripts/check-data.py --where`
- 指定其他数据目录：环境变量 `RESUME_PILOT_HOME`（便于多套数据/测试隔离）
- **不要把数据写回技能目录**：`skills update` 会 `rm -rf` 该目录后重装，数据会丢

## 运行前提

- **Python 3.9+**（推荐 3.10+）。脚本仅依赖标准库 + **PyYAML**：
  ```bash
  pip install -r requirements.txt
  ```
- **编辑器前端依赖已本地化**（`editor/vendor/`：markdown-it / Monaco / Tailwind / dom-to-image），**无需联网**。

## 启动简历编辑器（可视化预览/编辑/导出）

**Windows**：双击 `start-editor.bat`
**macOS / Linux**：
```bash
./start-editor.sh
```
**通用命令行**：
```bash
python scripts/start_editor.py     # 扫描端口 → 启动服务 → 开浏览器（端口占用自动往后选）
python scripts/server.py           # 仅启动服务（默认 3201），手动打开 http://localhost:3201/editor/
```
> 端口默认 3201，被占用时自动向后选择；若已有本项目的服务在跑则直接复用。

- 顶部「简历」下拉可切换不同公司/岗位的简历（读取 `output/<公司>/<岗位>/resume.md`）
- 支持：实时预览（自适应窗口宽度）、9 套样式模板、字体/边距/配色调整、显示/隐藏照片、换照片、导出 PDF（浏览器打印）与长图 PNG
- 模板清单 `editor/templates/manifest.json` 是模板元数据的**单一事实源**（中文名、适用场景、条目头骨架声明）；新增模板 = 清单加一条 + `templates/` 加同名 `.css`。下拉框由清单生成，加载失败时回退到 `index.html` 里的静态选项
- 条目头骨架（`features.itemHeader`）决定公司行 / 教育行怎么排：`inline` = 三列同行（公司名右对齐、长名不折行）、`split` = 两行两列。骨架样式统一在 `templates/_base.css`
- **联系方式图标**：编辑器按内容自动识别类型（邮箱 / 电话 / 网址 / 城市 / 工作年限）并加图标，无需配置；**ATS 友好**款已单独关掉图标
- **技能等级**：在 `config/profile.yml` 的 `tool_stack.tools` 里给工具名加括号等级（如 `Python（熟练）`）→ 编辑器渲染成 5 点等级点阵；等级可用词：精通 / 熟练 / 熟悉 / 掌握 / 了解 / 入门，也可直接写 1-5；不写则只显示名称
- **分节容器**：渲染时每个 `## 标题` 会包成 `<section class="resume-section" data-section="标题">`（分页器已配合：长分节仍可跨页拆分，每页各一个片段）。模板据此可做**分节卡片、部内多列、分节内独立间距**；例：「标题延长线」款把技能排成两列。需按内容定位时用 `:has(...)`（标题可被 layout 改写）
- **模块顺序**：右侧面板「模块顺序」用 ▲▼ 调整后点「保存顺序」→ 写入该简历 `resume.json` 的 `layout`，并由服务端**重新生成 `resume.md`**（旧 md 备份到 `output/_backup/<公司>-<岗位>-resume.prev.md`）。优先级：该份 JSON 的 `layout` ＞ `profile.yml` 的 `resume_layout` ＞ 生成器默认；「恢复默认」只是把默认顺序填进面板，仍需点「保存顺序」才生效
- 照片只有一张 `config/photo.jpg`（所有简历共用），三种换法效果相同（旧图备份到 `output/_backup/photo-prev.jpg`）：编辑器「换照片」按钮、直接用同名文件替换、或 `python scripts/set_photo.py <图片路径>`（可压缩，压缩需可选依赖 Pillow：`pip install Pillow`；不加 `--no-compress` 时若不装会明确报错。走这条路请把图片的**文件路径**给 AI，对话里直接贴图 AI 读不到字节）。刷新页面即生效
- 服务为前台进程，Ctrl+C 或关闭窗口停止

## 能力需求与工具映射（按你的 agent 环境替换）

本技能包需要以下**能力**；不同 agent / 平台上对应的**工具名不同**，按你所用环境替换：

| 能力 | 用途 | 常见实现（示例） |
|------|------|-----------------|
| 网页抓取 | 抓取 JD 链接、公司页面 | 各 agent 的 web fetch 工具 / MCP |
| 联网搜索 | 调研目标公司 | 各 agent 的 web search 工具 / MCP |
| 文档转文本 | 读取 PDF / Word 简历 | markitdown / pdf、docx 类工具 |
| 图像转文本 | 读取 JD 截图 | OCR 工具（或让用户贴文字） |

> SKILL.md 的流程不绑定具体工具名，按其提供的**能力**在你的环境中对位即可。

## 路径与平台注意

- **跨工具传文件用完整绝对路径**：某些环境（如 Git Bash 与文件工具之间）对 `/tmp` 的解释不同，易导致「文件找不到」。
- **模型不支持图像时**：JD / 简历截图需先转文本或请用户粘贴文字，不要依赖模型直接读图。
- **中文路径**：仓库与输出目录支持中文路径，但跨 shell 调用时注意编码。

## 脚本清单

均位于技能目录 `scripts/`，**统一通过 `paths.py` 解析数据路径**（不得自行拼接）。

| 脚本 | 作用 |
|------|------|
| `paths.py` | **数据根目录解析（单一事实源）**。优先级：`RESUME_PILOT_HOME` > 项目目录已有 `config/profile.yml` > 形如 `.../skills/<name>`（判为 skill 安装 → `~/.resume-pilot/`）> 否则项目目录。查看：`python scripts/paths.py` |
| `setup.py` | 一键安装/初始化（新用户入口）：查环境 → 装依赖 → 从模板生成数据文件 |
| `init_data.py` | 首次初始化：从示例模板复制数据文件（已存在不覆盖；setup.py 内部复用其逻辑） |
| `check-data.py` | 数据完整性校验。`--where` 只看数据目录；`--quiet` 只输出结论行 |
| `generate_md.py` | 简历渲染：`--data <resume.json> --company "<公司>" --position "<岗位>"` → `<数据目录>/output/<公司>/<岗位>/resume.md` |
| `server.py` | 编辑器本地服务（零依赖）：`/editor/` 页面 + 简历读写 API，默认 3201 |
| `start_editor.py` | 一键启动：扫端口 → 启服务 → 开浏览器（`start-editor.bat` / `.sh` 调它） |

## 目录用途

**技能目录**（规则与工具）：

- `config/profile.example.yml` — 基础档案模板（`setup.py` 据此生成数据目录下的 `profile.yml`）
- `references/*.md` — 方法论与模板（**数据文件** `project-library.md`、`interview-story-bank.md`、`interview-question-bank.md` 则在数据目录）
- `scripts/` — 路径解析（`paths.py`）、一键安装（`setup.py`）、初始化（`init_data.py`）、校验（`check-data.py`）、渲染器（`generate_md.py`）、换照片（`set_photo.py`）、本地服务（`server.py`）、一键启动（`start_editor.py`）
- `editor/` — MD 简历编辑器前端（含本地化 vendor）

**数据目录**（你的真实信息与产物）：

- `config/profile.yml` — 基础档案；`config/photo.jpg` — 可选头像（换照片直接替换此文件）
- `references/project-library.md` — 项目弹药库；`interview-story-bank.md` / `interview-question-bank.md` — 面试资产
- `ENVIRONMENT.md` — 你的环境适配说明（由本模板生成）
- `output/<公司>/<岗位>/` — 生成产物：`resume.md` + `resume.json` + `interview_prep.md`
