#!/usr/bin/env python3
"""
简历编辑器一键启动（start_editor.py）

行为：
  1. 从 3201 起扫描端口
  2. 若某端口上跑着**同一数据目录**的服务 → 直接复用（打开浏览器）
  3. 若端口被**其他程序/其他数据目录**占用 → 换下一个端口
  4. 找到空闲端口 → 启动 server.py（指定端口）→ 打开浏览器

用法：
  python scripts/start_editor.py                # 启动并打开浏览器
  python scripts/start_editor.py --no-browser   # 只启动服务（测试用）
  python scripts/start_editor.py --port 3210    # 指定起始端口
"""
import json
import socket
import subprocess
import sys
import time
import urllib.request
import webbrowser

from paths import DATA_ROOT, SKILL_ROOT

SERVER = SKILL_ROOT / "scripts" / "server.py"
DEFAULT_PORT = 3201
PORT_SCAN_RANGE = 12  # 从起始端口往后尝试的端口数


def port_in_use(port: int) -> bool:
    with socket.socket() as s:
        s.settimeout(0.5)
        return s.connect_ex(("127.0.0.1", port)) == 0


def probe_our_service(port: int):
    """探测端口上是否跑着**本数据目录**的服务。

    返回 "ours"（同一数据目录的）、"foreign"（其他服务/其他数据目录）、None（无服务）。
    """
    try:
        with urllib.request.urlopen(f"http://localhost:{port}/api/version", timeout=1.5) as r:
            data = json.loads(r.read().decode("utf-8"))
    except Exception:
        return None
    if not isinstance(data, dict) or data.get("app") != "resume-pilot":
        return "foreign"
    # 是本服务，但需确认服务的是同一数据目录（避免复用别处的实例）
    if str(data.get("root", "")) == str(DATA_ROOT):
        return "ours"
    return "foreign"


def main():
    args = sys.argv[1:]
    no_browser = "--no-browser" in args
    start_port = DEFAULT_PORT
    if "--port" in args:
        try:
            start_port = int(args[args.index("--port") + 1])
        except (IndexError, ValueError):
            print("[ERROR] --port 需要一个整数端口号", file=sys.stderr)
            sys.exit(1)

    # 扫描端口
    for offset in range(PORT_SCAN_RANGE):
        port = start_port + offset
        url = f"http://localhost:{port}/editor/"

        if not port_in_use(port):
            # 空闲端口 → 启动服务
            print(f"正在端口 {port} 启动简历编辑器服务...")
            proc = subprocess.Popen([sys.executable, str(SERVER), "--port", str(port)])
            for _ in range(30):
                if port_in_use(port):
                    break
                time.sleep(0.2)
            else:
                print("[ERROR] 服务启动超时，请检查 scripts/server.py", file=sys.stderr)
                proc.terminate()
                sys.exit(1)
            print(f"编辑器已启动：{url}")
            if not no_browser:
                webbrowser.open(url)
            print("（关闭本窗口或按 Ctrl+C 停止服务）")
            try:
                proc.wait()
            except KeyboardInterrupt:
                proc.terminate()
            return

        # 端口被占用 → 判断是否本项目服务
        kind = probe_our_service(port)
        if kind == "ours":
            print(f"编辑器服务已在运行：{url}")
            if not no_browser:
                webbrowser.open(url)
            return
        print(f"（端口 {port} 被其他程序占用，尝试下一个）")

    print(
        f"[ERROR] 端口 {start_port}-{start_port + PORT_SCAN_RANGE - 1} 均不可用。\n"
        f"        可用 --port 指定其他起始端口，例如：python scripts/start_editor.py --port 4000",
        file=sys.stderr,
    )
    sys.exit(1)


if __name__ == "__main__":
    main()
