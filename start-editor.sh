#!/usr/bin/env bash
# 简历编辑器一键启动（macOS / Linux）
# 等价于 start-editor.bat（Windows）
set -e
cd "$(dirname "$0")"

if ! command -v python3 >/dev/null 2>&1; then
  echo "[ERROR] 未找到 python3，请先安装 Python 3。"
  exit 1
fi

python3 scripts/start_editor.py
