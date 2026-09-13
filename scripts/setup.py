#!/usr/bin/env python3
"""
一键安装 / 初始化（setup.py）

作用：新用户只需运行本脚本，自动完成：
  1. 检查 Python 版本
  2. 检查并安装依赖（PyYAML）
  3. 从示例模板生成数据文件到数据根目录
  4. 打印数据存放位置与下一步指引

数据位置由 paths.py 统一决定（skill 安装 → ~/.resume-pilot/；克隆为项目 → 项目目录）。

用法：python scripts/setup.py
"""
import importlib.util
import shutil
import subprocess
import sys

from init_data import sync_data_files
from paths import DATA_ROOT, IS_SKILL_INSTALL, SKILL_ROOT, describe

MIN_PY = (3, 9)


def step(n, text):
    print(f"\n[{n}/4] {text}")


def install_git_hook() -> str:
    """在 git 仓库中安装 pre-commit 钩子（防污染/防数据覆盖）。

    .git/hooks 不受版本控制，因此每次克隆后需重装；无 .git 时跳过（skill 安装方式
    不在 skill 目录内提交，钩子无意义）。已存在同名钩子则不覆盖。
    """
    git_dir = SKILL_ROOT / ".git"
    src = SKILL_ROOT / "scripts" / "hooks" / "pre-commit"
    if not git_dir.is_dir():
        return "not-a-repo"
    if not src.is_file():
        return "no-source"
    dst = git_dir / "hooks" / "pre-commit"
    if dst.exists():
        return "exists"
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dst)
    try:
        dst.chmod(0o755)
    except OSError:
        pass
    return "installed"


def main():
    print("=" * 56)
    print("  resume-pilot 安装向导")
    print("=" * 56)

    # 1. Python 版本
    step(1, "检查 Python 版本")
    if sys.version_info < MIN_PY:
        print(f"  ❌ 需要 Python {MIN_PY[0]}.{MIN_PY[1]}+，当前 {sys.version.split()[0]}")
        sys.exit(1)
    print(f"  ✅ Python {sys.version.split()[0]}")

    # 2. 依赖
    step(2, "检查依赖（PyYAML）")
    if importlib.util.find_spec("yaml") is not None:
        print("  ✅ PyYAML 已安装")
    else:
        print("  ⏳ 未安装 PyYAML，正在安装…")
        try:
            subprocess.check_call([sys.executable, "-m", "pip", "install", "PyYAML>=6.0"])
            print("  ✅ PyYAML 安装完成")
        except subprocess.CalledProcessError as e:
            print(f"  ❌ 依赖安装失败（{e}）")
            print("     请手动执行：pip install -r requirements.txt")
            sys.exit(1)

    # 3. 生成数据文件（与 init_data.py 共用同一份模板清单，不在此重复维护）
    step(3, "生成数据文件")
    created, skipped, missing = sync_data_files()

    for f in created:
        print(f"  ✅ 已创建 {f}")
    for f in skipped:
        print(f"  ⏭️  已存在，跳过 {f}")
    for f in missing:
        print(f"  ⚠️  模板缺失 {f}")

    print()
    print("数据存放位置：")
    print(describe())

    # 4. 安装 git 钩子（仅 git 仓库）
    step(4, "安装 git 钩子（防污染/防数据覆盖）")
    hook_result = install_git_hook()
    if hook_result == "installed":
        print("  ✅ 已安装 pre-commit 钩子（提交前自动校验数据完整性）")
    elif hook_result == "exists":
        print("  ⏭️  已有 pre-commit 钩子，未覆盖（如需更新：手动替换 .git/hooks/pre-commit）")
    elif hook_result == "not-a-repo":
        print("  ⏭️  非 git 仓库（未从仓库克隆），跳过")
    else:
        print("  ⚠️  未找到钩子源文件 scripts/hooks/pre-commit，跳过")

    print("\n" + "=" * 56)
    print("  安装完成！下一步：")
    print("=" * 56)
    print(f"  1. 编辑 {DATA_ROOT / 'config' / 'profile.yml'}")
    print("       —— 填你的基本信息 / 职业经历 / 优势维度 / 工具栈")
    print(f"  2. 编辑 {DATA_ROOT / 'references' / 'project-library.md'}")
    print("       —— 填你的真实项目素材")
    print("  3. 对 AI 说：「帮我根据这个 JD 定制简历」+ 粘贴 JD")
    print("  4.（可选）启动可视化编辑器：")
    print("       Windows:      双击 start-editor.bat")
    print("       macOS/Linux:  ./start-editor.sh")
    print("       通用:         python scripts/start_editor.py")
    print()
    print("  ⚠️ profile.yml 现在是示例内容（张三），务必替换为你的真实信息。")
    if IS_SKILL_INSTALL:
        print("     你的数据不在 skill 目录内，因此 skills update 不会删除它。")
    else:
        print("     该文件已被 .gitignore 保护，不会提交到仓库。")


if __name__ == "__main__":
    main()
