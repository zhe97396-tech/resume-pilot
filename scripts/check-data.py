#!/usr/bin/env python3
"""
数据完整性校验（check-data.py）

作用：快速判断「当前数据目录是否完整可用」，防止：
  1. 示例数据（张三/某某大学）被当成真实档案使用
  2. 数据文件被误覆盖/清空

数据目录由 paths.py 统一决定（skill 安装 → ~/.resume-pilot/；克隆为项目 → 项目目录）。

用法：
  python scripts/check-data.py          # 校验并输出报告；数据异常时退出码 1
  python scripts/check-data.py --quiet  # 只输出结论行
  python scripts/check-data.py --where  # 只输出数据目录解析结果

填完 profile.yml 与 project-library.md 后跑一次，可确认数据无遗漏。
"""
import re
import sys

import yaml

from paths import DATA_ROOT, PROFILE_PATH, PROJECT_LIBRARY, STORY_BANK, describe

# 示例模板中出现过的标识（出现即说明是示例数据，不是真实档案）
EXAMPLE_MARKERS = {"张三", "zhangsan@example.com", "某某大学", "甲公司", "乙公司", "13800000000"}

MIN_PROJECTS = 3      # 弹药库至少应有这么多项目
MIN_STAGES = 1        # 职业阶段至少应有这么多段


def check() -> tuple:
    """返回（问题列表，检查详情）。空问题列表 = 全部通过。"""
    problems = []
    details = []

    # ── 1. profile.yml ─────────────────────────────
    if not PROFILE_PATH.exists():
        problems.append(f"{PROFILE_PATH} 不存在（未初始化？运行 python scripts/setup.py）")
    else:
        try:
            p = yaml.safe_load(PROFILE_PATH.read_text(encoding="utf-8")) or {}
        except Exception as e:
            problems.append(f"profile.yml 解析失败：{e}")
            p = {}

        info = p.get("basic_info", {}) or {}
        name = str(info.get("name", ""))
        email = str(info.get("email", ""))
        stages = p.get("career_stages") or []

        if name in EXAMPLE_MARKERS:
            problems.append(f"profile.yml 仍是示例数据（姓名：{name}）")
        if email in EXAMPLE_MARKERS:
            problems.append(f"profile.yml 仍是示例数据（邮箱：{email}）")
        if len(stages) < MIN_STAGES:
            problems.append(f"profile.yml 职业阶段为 {len(stages)} 段（至少应有 {MIN_STAGES} 段）")

        details.append(f"档案：{name or '(空)'} | {len(stages)} 段职业经历")

    # ── 2. project-library.md ──────────────────────────
    if not PROJECT_LIBRARY.exists():
        problems.append(f"{PROJECT_LIBRARY} 不存在")
    else:
        lib = PROJECT_LIBRARY.read_text(encoding="utf-8")
        n_projects = len(re.findall(r"^### 项目\d+", lib, re.M))
        if n_projects < MIN_PROJECTS:
            problems.append(
                f"弹药库项目数异常：{n_projects} 个（至少应有 {MIN_PROJECTS} 个）"
                "—— 可能被示例数据覆盖"
            )
        details.append(f"弹药库：{n_projects} 个项目")

    # ── 3. story-bank / question-bank ──────────────────────
    if STORY_BANK.exists():
        n_stories = len(re.findall(r"^### 故事STAR", STORY_BANK.read_text(encoding="utf-8"), re.M))
        details.append(f"故事库：{n_stories} 个故事")
    else:
        details.append("故事库：文件不存在")

    return problems, details


def main():
    if "--where" in sys.argv:
        print("数据目录解析结果：")
        print(describe())
        return

    quiet = "--quiet" in sys.argv
    problems, details = check()

    if not quiet:
        print("── 数据完整性校验 ──")
        print(f"  · 数据目录：{DATA_ROOT}")
        for d in details:
            print(f"  · {d}")
        print()

    if problems:
        print("❌ 数据异常，请先修复：")
        for p in problems:
            print(f"  · {p}")
        print("\n（若确为首次使用且尚未填写档案，请运行 python scripts/setup.py）")
        sys.exit(1)

    print("✅ 数据完整（真实档案 / 弹药库 / 故事库均正常）")


if __name__ == "__main__":
    main()
