#!/usr/bin/env python3
"""
数据根目录解析（单一事实源）

为什么需要本模块
----------------
本技能包有两种使用方式，**用户数据的存放位置不同**：

| 方式 | 数据放在哪 | 原因 |
|------|-----------|------|
| A. 作为 skill 安装（`npx skills add -g`） | `~/.resume-pilot/` | skill 目录由包管理器管辖：`skills update` / 再次 `skills add` 会 `rm -rf` 整个 skill 目录后重装（见 skills CLI `cleanAndCreateDirectory`）。数据放在里面**必然丢失**。 |
| B. 克隆为独立项目（`git clone`） | 项目目录内 | 数据已被 `.gitignore` 保护，且随项目走，符合预期。 |

因此**所有脚本一律通过本模块取路径**，不得再自行拼接 `ROOT / "config" / ...`。
新增脚本时同样从本模块导入，保证两种方式下行为一致。

解析优先级（自上而下，命中即返回）
----------------------------------
1. 环境变量 `RESUME_PILOT_HOME`（显式指定，最高优先，便于多套数据/测试隔离）
2. 项目目录内已存在 `config/profile.yml` → 用项目目录（方式 B，也是旧版本用户的向后兼容路径）
3. 项目目录形如 `.../skills/<name>` → 判定为 skill 安装 → 用 `~/.resume-pilot/`（方式 A）
4. 其余情况（用户把仓库克隆到任意目录）→ 用项目目录（方式 B）

用法
----
    from paths import DATA_ROOT, PROFILE_PATH, PROJECT_LIBRARY, STORY_BANK, \
                      QUESTION_BANK, ENVIRONMENT_PATH, OUTPUT_DIR, BACKUP_DIR, PHOTO_PATH, SKILL_ROOT
"""
import os
from pathlib import Path

# ── skill/项目目录：本文件所在 scripts/ 的上一级（规则、脚本、编辑器所在处）──
SKILL_ROOT = Path(__file__).resolve().parent.parent

# 方式 A 的数据目录名（位于用户主目录下）
DATA_DIR_NAME = ".resume-pilot"

# 数据文件名（相对数据根目录）
PROFILE_REL = Path("config") / "profile.yml"
PHOTO_REL = Path("config") / "photo.jpg"
PROJECT_LIBRARY_REL = Path("references") / "project-library.md"
STORY_BANK_REL = Path("references") / "interview-story-bank.md"
QUESTION_BANK_REL = Path("references") / "interview-question-bank.md"
ENVIRONMENT_REL = Path("ENVIRONMENT.md")


def _looks_like_skill_install(root: Path) -> bool:
    """判断 root 是否为 skill 目录（形如 ~/.agents/skills/<name> 或 ~/.pi/agent/skills/<name>）。"""
    return root.parent.name == "skills"


def resolve_data_root() -> Path:
    """按上述优先级解析数据根目录。"""
    env = os.environ.get("RESUME_PILOT_HOME")
    if env and env.strip():
        return Path(env).expanduser().resolve()
    if (SKILL_ROOT / PROFILE_REL).exists():
        return SKILL_ROOT
    if _looks_like_skill_install(SKILL_ROOT):
        return Path.home() / DATA_DIR_NAME
    return SKILL_ROOT


DATA_ROOT = resolve_data_root()

PROFILE_PATH = DATA_ROOT / PROFILE_REL
PHOTO_PATH = DATA_ROOT / PHOTO_REL
PROJECT_LIBRARY = DATA_ROOT / PROJECT_LIBRARY_REL
STORY_BANK = DATA_ROOT / STORY_BANK_REL
QUESTION_BANK = DATA_ROOT / QUESTION_BANK_REL
ENVIRONMENT_PATH = DATA_ROOT / ENVIRONMENT_REL
OUTPUT_DIR = DATA_ROOT / "output"
# 照片等资产的旧版备份（在 output/ 内，因此被 git 忽略、也不导出到公开仓）
BACKUP_DIR = OUTPUT_DIR / "_backup"

# 是否为 skill 安装方式（数据在 SKILL_ROOT 之外）
IS_SKILL_INSTALL = DATA_ROOT != SKILL_ROOT


def describe() -> str:
    """人类可读的环境说明，供 setup / check 等脚本打印。"""
    mode = "skill 安装方式（数据在 skill 目录外，skills update 不会影响数据）" \
        if IS_SKILL_INSTALL else "项目方式（数据在项目目录内）"
    lines = [
        f"  使用方式：{mode}",
        f"  技能目录：{SKILL_ROOT}",
        f"  数据目录：{DATA_ROOT}",
    ]
    if IS_SKILL_INSTALL:
        lines.append("  提示：可用环境变量 RESUME_PILOT_HOME 指定其他数据目录。")
    return "\n".join(lines)


if __name__ == "__main__":
    print(describe())
    print()
    for label, path in [
        ("profile.yml", PROFILE_PATH),
        ("project-library.md", PROJECT_LIBRARY),
        ("story-bank", STORY_BANK),
        ("question-bank", QUESTION_BANK),
        ("ENVIRONMENT.md", ENVIRONMENT_PATH),
        ("output/", OUTPUT_DIR),
    ]:
        mark = "✅" if path.exists() else "—"
        print(f"  {mark} {label:22} {path}")
