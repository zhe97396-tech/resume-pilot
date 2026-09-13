#!/usr/bin/env python3
"""
首次运行初始化（init_data.py）

作用：把示例模板复制为可用的数据文件，让首次使用者一键完成初始化。
数据文件写入路径由 paths.py 统一决定（skill 安装 → ~/.resume-pilot/；克隆为项目 → 项目目录）。
- config/profile.example.yml            → <数据根>/config/profile.yml
- references/project-library.example.md  → <数据根>/references/project-library.md
- references/interview-story-bank.example.md    → <数据根>/references/interview-story-bank.md
- references/interview-question-bank.example.md → <数据根>/references/interview-question-bank.md
- ENVIRONMENT.example.md                 → <数据根>/ENVIRONMENT.md（若不存在）

已存在的文件不会被覆盖（安全）。
用法：python scripts/init_data.py
"""
import shutil


from paths import DATA_ROOT, SKILL_ROOT, describe

PAIRS = [
    ("config/profile.example.yml", "config/profile.yml"),
    ("references/project-library.example.md", "references/project-library.md"),
    ("references/interview-story-bank.example.md", "references/interview-story-bank.md"),
    ("references/interview-question-bank.example.md", "references/interview-question-bank.md"),
    ("ENVIRONMENT.example.md", "ENVIRONMENT.md"),
]


def sync_data_files():
    """把示例模板复制为数据文件（已存在则跳过，不覆盖）。

    返回 (created, skipped, missing)，三个列表均为相对路径。
    由本模块与 setup.py 共用，避免“模板清单”在两处各维护一份。
    """
    created, skipped, missing = [], [], []
    for src_rel, dst_rel in PAIRS:
        src = SKILL_ROOT / src_rel
        dst = DATA_ROOT / dst_rel
        if not src.exists():
            missing.append(src_rel)
            continue
        if dst.exists():
            skipped.append(dst_rel)
            continue
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dst)
        created.append(dst_rel)
    return created, skipped, missing


def main():
    created, skipped, missing = sync_data_files()

    print("初始化结果：")
    for f in created:
        print(f"  ✅ 已创建 {f}（示例内容，请替换为你的真实信息）")
    for f in skipped:
        print(f"  ⏭️  已存在，跳过 {f}")
    for f in missing:
        print(f"  ⚠️  模板缺失 {f}")

    print()
    print("数据存放位置：")
    print(describe())

    if created:
        print()
        print("下一步：")
        print(f"  1. 编辑 {DATA_ROOT / 'config' / 'profile.yml'}")
        print("       —— 填你的基本信息/职业经历/优势维度/工具栈")
        print(f"  2. 编辑 {DATA_ROOT / 'references' / 'project-library.md'}")
        print("       —— 填你的真实项目素材")
        print("  3. 完成后对 AI 说「帮我根据这个 JD 定制简历」并粘贴 JD")


if __name__ == "__main__":
    main()
