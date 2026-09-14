#!/usr/bin/env python3
"""
简历 JSON → Markdown 渲染器（generate_md.py）

输入：
  - resume JSON（JD 定制后的语义内容：summary / work_experience）
  - profile.yml（骨架权威源：头部 / 教育 / 专业技能 tool_stack；位于数据目录）
输出：
  <数据目录>/output/<公司>/<岗位>/resume.md
（数据目录由 paths.py 决定：skill 安装 → ~/.resume-pilot/；克隆为项目 → 项目目录）

格式（移植自 career-pilot）：
  - 头部：# 姓名 + 电话/邮箱/年限 + JD 注释
  - 核心优势：**标签**：内容
  - 工作经历：公司行（全角空格对齐）+ ▶ 项目N + 融合句 bullets
  - 教育背景：全角空格对齐
  - 专业技能：核心工具栈（工具 | 能力 | 认证）
零第三方依赖（仅 PyYAML）。
"""
import argparse
import json
import sys
from datetime import datetime
from pathlib import Path

import yaml

from paths import OUTPUT_DIR, PROFILE_PATH

FWSP = "　"  # 全角空格
CHINESE_NUMS = ["一", "二", "三", "四", "五", "六", "七", "八", "九", "十"]


# ── 工具函数 ────────────────────────────────────────────────────────────

def ensure_period(text: str) -> str:
    """句末确保句号。"""
    if not text:
        return text
    text = text.rstrip()
    if text and text[-1] not in "。.！!？?；;":
        text += "。"
    return text


# ── 渲染函数 ────────────────────────────────────────────────────────────

def render_header(profile: dict, company: str, position: str) -> list:
    """头部：姓名 + 联系方式 + 求职意向 + 生成信息注释。"""
    info = profile["basic_info"]
    lines = [
        f"# {info['name']}",
        f"- {info.get('phone', '')}",
        f"- {info.get('email', '')}",
        f"- {info.get('years_of_experience', '')}年工作经验",
        "",
    ]
    # 求职意向：取 --position / JSON target_position；未提供则不输出该行
    if position:
        lines += [f"**求职意向**：{position}", ""]
    if company or position:
        lines.append(f"<!-- 本简历针对：{company} | {position} -->")
    lines.append(f"<!-- 生成时间：{datetime.now().strftime('%Y-%m-%d')} -->")
    lines += ["", "---", ""]
    return lines


def render_dimensions(summary: list, title: str = "核心优势") -> list:
    """核心优势：**标签**：内容（summary 条目形如 '标签：内容'）。"""
    lines = [f"## {title}", ""]
    for item in summary:
        if "：" in item:
            label, content = item.split("：", 1)
            lines.append(f"**{label}**：{ensure_period(content)}")
        else:
            lines.append(ensure_period(item))
        lines.append("")
    return lines


def render_company_line(period: str, role: str, company: str) -> str:
    """公司行：**时间　　　　岗位　　　　公司**（全角空格对齐）。"""
    sep = FWSP * 15
    return f"**{period}{sep}{role}{sep}{company}**"


def render_project(project: dict, index: int, total: int) -> list:
    """单个项目：同公司 >=2 时带 ▶ 项目N 编号；内容为融合句 bullets。"""
    lines = []
    name = (project.get("name") or "").strip()
    bullets = project.get("bullets") or []

    if name:
        if total >= 2:
            num = CHINESE_NUMS[index] if index < len(CHINESE_NUMS) else str(index + 1)
            lines.append(f"**▶ 项目{num}：{name}**")
        else:
            lines.append(f"**▶ {name}**")
        lines.append("")

    for b in bullets:
        lines.append(f"- {ensure_period(b)}")
    lines.append("")
    return lines


def render_work_experience(work_experience: list, title: str = "工作经历", include_personal: bool = False) -> list:
    """工作经历：按公司渲染，公司内按项目分组。

    include_personal=False（默认）时，跳过 company="个人项目"的段
    （个人项目应放入「项目经历」板块，见 render_project_experience）。
    """
    items = [e for e in work_experience if include_personal or e.get("company") != "个人项目"]
    if not items:
        return []
    lines = [f"## {title}", ""]
    for exp in items:
        company = exp.get("company", "")
        role = exp.get("position", "")
        period = exp.get("period", "")
        lines.append(render_company_line(period, role, company))
        lines.append("")

        projects = exp.get("projects") or []
        if projects:
            total = len(projects)
            for i, proj in enumerate(projects):
                lines.extend(render_project(proj, i, total))
        else:
            for b in exp.get("bullets", []):
                lines.append(f"- {ensure_period(b)}")
            lines.append("")
        lines.append("---")
        lines.append("")
    if lines[-2:] == ["---", ""]:
        lines = lines[:-2]
    return lines


def render_education(profile: dict, title: str = "教育背景") -> list:
    """教育背景：校名按最长校名补齐 + 8 全角空格列分隔。"""
    lines = [f"## {title}", ""]
    records = profile.get("basic_info", {}).get("education", {}).get("records", [])
    if not records:
        return lines
    max_len = max(len(r["school"]) for r in records)
    for rec in records:
        school = rec["school"] + FWSP * (max_len - len(rec["school"]))
        sep = FWSP * 8
        lines.append(f"{school}{sep}{rec['major']}{sep}{rec['degree']}{sep}{rec['period']}")
        lines.append("")
    return lines


def render_skills(profile: dict, title: str = "专业技能") -> list:
    """专业技能：核心工具栈（工具 | 能力 | 认证）。"""
    lines = [f"## {title}", ""]
    ts = profile.get("tool_stack", {})
    tools = "、".join(ts.get("tools", []))
    caps = "、".join(ts.get("capabilities", []))
    certs = "、".join(ts.get("certifications", []))
    parts = [p for p in [tools, caps, (f"认证：{certs}" if certs else "")] if p]
    if parts:
        lines.append(f"**核心工具栈**：{' | '.join(parts)}")
        lines.append("")
    return lines


def render_project_experience(projects: list, title: str = "项目经历") -> list:
    """独立项目经历板块（不受时间序限制，按 JD 匹配度排序）。

    用于：个人项目（如 AI 作品）或近期工作弱相关但过往经历强匹配时。
    每项：{name, role?, period?, bullets?}。
    """
    if not projects:
        return []
    lines = [f"## {title}", ""]
    total = len(projects)
    for i, proj in enumerate(projects):
        lines.extend(render_project(proj, i, total))
    return lines


def render_extra_section(section: dict) -> list:
    """自定义模块：{title, bullets} 或 {title, content}。"""
    title = (section.get("title") or "").strip()
    lines = [f"## {title}", ""] if title else []
    content = section.get("content")
    if content:
        lines.append(ensure_period(str(content)))
        lines.append("")
    for b in section.get("bullets") or []:
        lines.append(f"- {ensure_period(b)}")
    if section.get("bullets"):
        lines.append("")
    return lines


# ── 模块注册表与默认布局 ───────────────────────────────
# 用户可通过 profile.yml `resume_layout` 或 resume JSON `layout` 自定义顺序。
# 模块项支持两种写法：
#   1) 字符串："education"
#   2) 字典：{id: "summary", title: "个人优势"}（可改标题）
DEFAULT_LAYOUT = ["header", "summary", "work_experience", "project_experience", "education", "skills"]

# 内置模块的默认标题。
# 单一来源：渲染时用它做缺省标题，编辑器「模块顺序」面板也用它做显示名——
# 否则两处各写一份中文名，改名时会不一致。
SECTION_TITLES = {
    "header": "基本信息",
    "summary": "核心优势",
    "work_experience": "工作经历",
    "project_experience": "项目经历",
    "education": "教育背景",
    "skills": "专业技能",
}

# 这些模块渲染前插入分隔线（保持既有排版：教育前有分割线）
SEP_BEFORE = {"education"}


def _normalize_section(item) -> tuple:
    """把布局项归一化为 (id, title, sep)。

    sep: True=强制分隔线 / False=不加 / None=默认规则
    （默认规则：education 前有分隔线；自定义模块前有）
    """
    if isinstance(item, dict):
        return item.get("id", ""), item.get("title"), item.get("sep")
    return str(item), None, None


def _resolve_layout(data: dict, profile: dict) -> list:
    """布局优先级：JSON `layout` > profile `resume_layout` > 默认。"""
    layout = data.get("layout") or profile.get("resume_layout") or DEFAULT_LAYOUT
    if not isinstance(layout, list) or not layout:
        return DEFAULT_LAYOUT
    return layout


def render_resume(data: dict, profile: dict, company: str, position: str) -> str:
    """主入口：JSON + profile → 完整 Markdown 简历。

    模块顺序由 layout 决定；未配置时沿用默认
    header → summary → work_experience → education → skills。
    """
    layout = _resolve_layout(data, profile)
    extra = {s.get("title", ""): s for s in (data.get("extra_sections") or []) if s.get("title")}

    lines = []
    placed = set()
    for i, item in enumerate(layout):
        sec_id, title, sep = _normalize_section(item)
        placed.add(sec_id)

        # 分隔线（首项不加）
        if i > 0:
            want_sep = sep if sep is not None else (sec_id in SEP_BEFORE or sec_id in extra)
            if want_sep:
                lines += ["---", ""]

        if sec_id == "header":
            lines.extend(render_header(profile, company, position))
        elif sec_id == "summary":
            if data.get("summary"):
                lines.extend(render_dimensions(data["summary"], title or SECTION_TITLES["summary"]))
        elif sec_id == "work_experience":
            if data.get("work_experience"):
                lines.extend(render_work_experience(
                    data["work_experience"],
                    title or SECTION_TITLES["work_experience"],
                    include_personal=bool(data.get("include_personal_project")),
                ))
        elif sec_id == "project_experience":
            if data.get("project_experience"):
                lines.extend(render_project_experience(data["project_experience"], title or SECTION_TITLES["project_experience"]))
        elif sec_id == "education":
            lines.extend(render_education(profile, title or SECTION_TITLES["education"]))
        elif sec_id == "skills":
            lines.extend(render_skills(profile, title or SECTION_TITLES["skills"]))
        elif sec_id in extra:
            lines.extend(render_extra_section(extra[sec_id]))
        # 未知 id 静默跳过（容错）

    # 未在 layout 中出现的 extra_sections → 追加到末尾
    for t, s in extra.items():
        if t not in placed:
            lines += ["---", ""]
            lines.extend(render_extra_section(s))

    return "\n".join(lines).rstrip() + "\n"


EXAMPLE_MARKERS = ("张三", "zhangsan@example.com", "某某大学", "甲公司")


def warn_if_example(profile: dict) -> None:
    """检测档案是否仍为示例内容，是则提醒（不阻断）。"""
    info = profile.get("basic_info", {})
    hit = []
    if info.get("name") in EXAMPLE_MARKERS:
        hit.append(f"姓名（{info.get('name')}）")
    if str(info.get("email", "")) in EXAMPLE_MARKERS:
        hit.append(f"邮箱（{info.get('email')}）")
    for rec in info.get("education", {}).get("records", []) or []:
        if rec.get("school") in EXAMPLE_MARKERS:
            hit.append(f"学校（{rec.get('school')}）")
    if hit:
        print("\n" + "!" * 56)
        print("⚠️  提醒：profile.yml 仍是示例数据，包含：" + "、".join(hit))
        print("    生成的简历会带上这些示例信息。请先替换为你的真实资料。")
        print("!" * 56)


def main():
    parser = argparse.ArgumentParser(description="简历 JSON → Markdown 渲染器")
    parser.add_argument("--data", required=True, help="resume JSON 文件路径")
    parser.add_argument("--company", default="", help="目标公司（用于注释与输出路径）")
    parser.add_argument("--position", default="", help="目标岗位（用于注释与输出路径）")
    parser.add_argument("--output", help="输出 md 路径（默认 <数据目录>/output/<公司>/<岗位>/resume.md）")
    args = parser.parse_args()

    data = json.loads(Path(args.data).read_text(encoding="utf-8"))
    if not PROFILE_PATH.exists():
        print(f"❌ 未找到 {PROFILE_PATH}", file=sys.stderr)
        print("   请先运行：python scripts/setup.py", file=sys.stderr)
        sys.exit(1)
    profile = yaml.safe_load(PROFILE_PATH.read_text(encoding="utf-8"))
    warn_if_example(profile)

    company = args.company or data.get("target_company", "")
    position = args.position or data.get("target_position", "")

    result = render_resume(data, profile, company, position)

    if args.output:
        output_path = Path(args.output)
    else:
        output_path = OUTPUT_DIR / company / position / "resume.md"
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(result, encoding="utf-8")

    # 同步保存源 JSON（便于后续重新渲染）
    if not args.output:
        json_copy = output_path.parent / "resume.json"
        json_copy.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"渲染完成：{output_path}")


if __name__ == "__main__":
    main()
