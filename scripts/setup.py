#!/usr/bin/env python3
"""
一键安装 / 初始化（setup.py）

作用：新用户只需运行本脚本，自动完成：
  1. 检查 Python 版本
  2. 检查并安装依赖（PyYAML）
  3. 从示例模板生成数据文件到数据根目录
  4. 在数据目录生成编辑器启动器（双击即用）
  5. 安装 git 钩子（仅 git 仓库）

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
TOTAL_STEPS = 5


def step(n, text):
    print(f"\n[{n}/{TOTAL_STEPS}] {text}")


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


def write_launcher() -> list:
    """在数据目录生成编辑器启动器（Windows .bat / POSIX .sh）。

    启动器内写死 skill 的**绝对路径**，让用户不必知道 skill 装在哪；
    数据目录是用户可见且稳定的位置，双击即可启动编辑器。
    已存在则跳过——克隆方式下项目根已有仓库版启动器，不覆盖。
    skill 位置变化后：删除该文件重跑本脚本即可刷新路径。
    """
    skill_root = str(SKILL_ROOT.resolve())
    skill_root_posix = skill_root.replace("\\", "/")
    results = []

    bat = DATA_ROOT / "start-editor.bat"
    if bat.exists():
        results.append((bat, "exists"))
    else:
        # newline="" → 保留手写的 \r\n，避免 Python 再翻译成 \r\r\n
        with bat.open("w", encoding="utf-8", newline="") as f:
            f.write(
                "@echo off\r\n"
                "chcp 65001 >nul\r\n"
                f'cd /d "{skill_root}"\r\n'
                "echo ============================================\r\n"
                "echo   Resume Editor\r\n"
                "echo ============================================\r\n"
                "where python >nul 2>nul\r\n"
                "if errorlevel 1 (\r\n"
                "  echo [ERROR] Python not found in PATH. Please install Python 3.\r\n"
                "  pause\r\n"
                "  exit /b 1\r\n"
                ")\r\n"
                "python scripts\\start_editor.py\r\n"
                "echo.\r\n"
                "echo Editor stopped. Press any key to close.\r\n"
                "pause >nul\r\n"
            )
        results.append((bat, "created"))

    sh = DATA_ROOT / "start-editor.sh"
    if sh.exists():
        results.append((sh, "exists"))
    else:
        # newline="\n" → 强制 LF（CRLF 会让 POSIX shell 把 \r 当命令的一部分）
        # 路径用正斜杠：Windows 上也可能在 Git Bash 里执行
        with sh.open("w", encoding="utf-8", newline="\n") as f:
            f.write(
                "#!/usr/bin/env bash\n"
                "# resume-pilot 编辑器启动器（setup.py 生成；skill 位置变化后删掉本文件重跑 setup.py）\n"
                "set -e\n"
                f'cd "{skill_root_posix}"\n'
                "# POSIX 上通常只有 python3，Windows 的 Git Bash 里通常只有 python\n"
                "if command -v python3 >/dev/null 2>&1; then\n"
                "  exec python3 scripts/start_editor.py\n"
                "fi\n"
                "exec python scripts/start_editor.py\n"
            )
        try:
            sh.chmod(0o755)
        except OSError:
            pass
        results.append((sh, "created"))

    return results


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

    # 4. 编辑器启动器
    step(4, "生成编辑器启动器（数据目录内，双击即用）")
    for path, status in write_launcher():
        if status == "created":
            print(f"  ✅ 已生成 {path}")
        else:
            print(f"  ⏭️  已存在，未覆盖 {path}")

    # 5. 安装 git 钩子（仅 git 仓库）
    step(5, "安装 git 钩子（防污染/防数据覆盖）")
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
    print("  安装完成！它能为你做什么：")
    print("=" * 56)
    print("  · 岗位适配分析  —— 「分析一下这个岗位适不适合我」+ 粘贴 JD")
    print("  · 定制简历      —— 「根据这个 JD 定制简历」+ 公司名 + 粘贴 JD")
    print("  · 优化已有简历  —— 「帮我改一下这份简历」+ 简历文本")
    print("  · 面试准备      —— 「帮我准备这个岗位的面试」+ 粘贴 JD")
    print("  · 换简历照片 / 打开可视化编辑器（一句话即可）")
    print()
    print("  下一步：")
    print(f"  1. 编辑 {DATA_ROOT / 'config' / 'profile.yml'}")
    print("       —— 填你的基本信息 / 职业经历 / 优势维度 / 工具栈")
    print(f"  2. 编辑 {DATA_ROOT / 'references' / 'project-library.md'}")
    print("       —— 填你的真实项目素材")
    print("  3. 对 AI 说：「帮我根据这个 JD 定制简历」+ 粘贴 JD")
    print("  4.（可选）打开可视化编辑器（预览 / 换模板 / 导出）：")
    print("       · 对 AI 说「打开简历编辑器」；或发命令 /skill:resume-pilot 打开编辑器")
    print(f"       · 或双击数据目录里的启动器：{DATA_ROOT / 'start-editor.bat'}")
    print()
    print("  ⚠️ profile.yml 现在是示例内容（张三），务必替换为你的真实信息。")
    if IS_SKILL_INSTALL:
        print("     你的数据不在 skill 目录内，因此 skills update 不会删除它。")
    else:
        print("     该文件已被 .gitignore 保护，不会提交到仓库。")


if __name__ == "__main__":
    main()
