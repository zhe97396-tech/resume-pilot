#!/usr/bin/env python3
"""
简历编辑器本地服务（server.py）

提供：
- 静态文件服务：/editor/*（编辑器前端 + 本地化依赖）
- API：
  - GET  /api/resumes                      列出所有简历（公司/岗位/标题）
  - GET  /api/resume/<company>/<position>  读取某份简历 md
  - POST /api/resume/<company>/<position>  保存某份简历 md
  - GET  /api/photo                        读取简历照片（config/photo.jpg，带 ETag/304）
  - POST /api/photo                        换照片：直接替换 config/photo.jpg（旧图备份）
  - GET  /api/templates                    列出样式模板

启动：python scripts/server.py  → 浏览器打开 http://localhost:3201/editor/
零第三方依赖（Python 标准库）。
"""
import json
import os
import shutil
import sys
import urllib.parse
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

from paths import BACKUP_DIR, DATA_ROOT, OUTPUT_DIR, PHOTO_PATH, SKILL_ROOT

EDITOR_DIR = SKILL_ROOT / "editor"
PORT = 3201
APP_ID = "resume-pilot"  # 身份标识（供 start_editor 判断端口上的是否本服务）

# 照片文件名固定为 photo.jpg（约定），实际可能是 PNG/WebP/GIF，服务时按文件头判类型
_IMAGE_MAGIC = ((b"\xff\xd8\xff", "image/jpeg"), (b"\x89PNG\r\n\x1a\n", "image/png"), (b"GIF8", "image/gif"))


def photo_mime(path) -> str:
    """按文件头判断图片 MIME（不依赖扩展名）。"""
    try:
        head = path.open("rb").read(12)
    except OSError:
        return "image/jpeg"
    for magic, mime in _IMAGE_MAGIC:
        if head.startswith(magic):
            return mime
    if head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return "image/webp"
    return "image/jpeg"


def is_image_bytes(data: bytes) -> bool:
    """上传内容是否为可识别的图片（JPEG/PNG/GIF/WebP）。"""
    if any(data.startswith(magic) for magic, _ in _IMAGE_MAGIC):
        return True
    return data[:4] == b"RIFF" and data[8:12] == b"WEBP"


def list_resumes():
    """扫描 output/<公司>/<岗位>/resume.md，返回简历清单。"""
    items = []
    if not OUTPUT_DIR.exists():
        return items
    for company_dir in sorted(OUTPUT_DIR.iterdir()):
        if not company_dir.is_dir() or company_dir.name.startswith("."):
            continue
        for pos_dir in sorted(company_dir.iterdir()):
            if not pos_dir.is_dir():
                continue
            md = pos_dir / "resume.md"
            if md.exists():
                items.append({
                    "company": company_dir.name,
                    "position": pos_dir.name,
                    "title": f"{company_dir.name} · {pos_dir.name}",
                    "mtime": md.stat().st_mtime,
                })
    return items


def resolve_resume(company, position):
    """解析简历 md 路径（防路径穿越）。"""
    for part in (company, position):
        if not part or "/" in part or "\\" in part or part in (".", ".."):
            return None
    path = OUTPUT_DIR / company / position / "resume.md"
    try:
        path.resolve().relative_to(OUTPUT_DIR.resolve())
    except ValueError:
        return None
    return path


class QuietHTTPServer(ThreadingHTTPServer):
    """多线程处理请求（避免浏览器空闲连接阻塞），并忽略客户端断开导致的无害异常。"""

    daemon_threads = True

    def handle_error(self, request, client_address):
        exc = sys.exc_info()[1]
        if isinstance(exc, (ConnectionError, BrokenPipeError)):
            return
        super().handle_error(request, client_address)


class Handler(SimpleHTTPRequestHandler):
    # ── 安全：主机名白名单（防 DNS Rebinding） 〒
    # 攻击者用自己域名解析到 127.0.0.1，浏览器发请求时 Host 头是攻击者域名。
    # 只接受本机名 → 阻隔此类攻击。
    ALLOWED_HOSTNAMES = {"localhost", "127.0.0.1", "::1", "[::1]"}
    # 上传体积上限（防内存耗尽） 〒
    MAX_UPLOAD_BYTES = 10 * 1024 * 1024  # 10MB

    def _hostname_of(self, value):
        """从 URL/Host 值里提取主机名（去掉端口）。"""
        if not value:
            return ""
        v = value.strip()
        # 去掉 scheme（Origin/Referer 是完整 URL）
        if "://" in v:
            v = v.split("://", 1)[1]
        v = v.split("/", 1)[0]  # 去掉路径
        # 去掉 userinfo
        if "@" in v:
            v = v.rsplit("@", 1)[1]
        # IPv6 字面量 [::1]:3201
        if v.startswith("["):
            end = v.find("]")
            return v[: end + 1] if end != -1 else v
        return v.split(":", 1)[0]

    def _host_ok(self):
        """Host 头必须是本机名，否则拒绝（防 DNS Rebinding）。"""
        hostname = self._hostname_of(self.headers.get("Host", ""))
        return hostname.lower() in self.ALLOWED_HOSTNAMES

    def _origin_ok(self):
        """变更类请求的来源校验（防恶意网页 CSRF 写入）。

        - 带 Origin/Referer 且非本机 → 拒绝（浏览器下的跨站表单攻击）
        - 两者都没有 → 放行（curl / 本机脚本等非浏览器调用）
        """
        for hdr in ("Origin", "Referer"):
            value = self.headers.get(hdr)
            if not value:
                continue
            if value == "null":
                # 沙箱/本地文件页面发来的请求，保守拒绝
                return False
            return self._hostname_of(value).lower() in self.ALLOWED_HOSTNAMES
        return True

    def _guard(self, mutating=False):
        """统一安全门。返回 True 表示已拒绝并已响应。"""
        if not self._host_ok():
            self._send_json({"success": False, "error": "拒绝：非法 Host"}, 403)
            return True
        if mutating and not self._origin_ok():
            self._send_json({"success": False, "error": "拒绝：请求来源非法"}, 403)
            return True
        return False

    def _send_json(self, obj, status=200):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        # 安全响应头：禁缓存、禁 MIME 猜测、禁内嵌框架
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Referrer-Policy", "no-referrer")
        self.end_headers()
        self.wfile.write(body)

    def _read_body(self, limit=None):
        length = int(self.headers.get("Content-Length", 0))
        if limit is not None and length > limit:
            return None
        return self.rfile.read(length).decode("utf-8") if length else ""

    def do_GET(self):
        if self._guard():
            return
        parsed = urllib.parse.urlparse(self.path)
        path = urllib.parse.unquote(parsed.path)

        if path == "/api/version":
            return self._send_json({
                "success": True,
                "app": APP_ID,
                "port": self.server.server_address[1],
                "root": str(DATA_ROOT),
            })

        if path == "/api/resumes":
            return self._send_json({"success": True, "resumes": list_resumes()})

        if path == "/api/templates":
            tdir = EDITOR_DIR / "templates"
            templates = []
            if tdir.exists():
                for f in sorted(tdir.glob("*.css")):
                    if f.name.startswith("_"):
                        continue
                    templates.append({
                        "id": f.stem,
                        "name": f.stem,
                        "url": f"/editor/templates/{f.name}",
                    })
            return self._send_json({"success": True, "templates": templates})

        if path.startswith("/api/resume/"):
            parts = path[len("/api/resume/"):].split("/")
            if len(parts) != 2:
                return self._send_json({"success": False, "error": "路径格式应为 /api/resume/<公司>/<岗位>"}, 400)
            md_path = resolve_resume(parts[0], parts[1])
            if md_path is None:
                return self._send_json({"success": False, "error": "非法路径"}, 400)
            if not md_path.exists():
                return self._send_json({"success": False, "error": "简历不存在"}, 404)
            return self._send_json({"success": True, "markdown": md_path.read_text(encoding="utf-8")})

        # 简历照片：只有一张，就是 config/photo.jpg（不需要替换时由用户直接换文件）
        if path == "/api/photo":
            if not PHOTO_PATH.exists():
                return self._send_json({"success": False, "error": "无照片：config/photo.jpg 不存在"}, 404)
            stat = PHOTO_PATH.stat()
            etag = f'"{int(stat.st_mtime)}-{stat.st_size}"'
            # 带 ETag 校验：未变则 304（几十字节），变了则马上返回新图。
            # 因此「直接在文件系统里换 config/photo.jpg」刷新即生效，无需等缓存过期。
            if self.headers.get("If-None-Match") == etag:
                self.send_response(304)
                self.send_header("ETag", etag)
                self.send_header("Cache-Control", "no-cache")
                self.end_headers()
                return
            data = PHOTO_PATH.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", photo_mime(PHOTO_PATH))
            self.send_header("ETag", etag)
            self.send_header("Cache-Control", "no-cache")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return

        # 根路径 → 编辑器
        if path in ("/", "/editor", "/editor/"):
            return self._serve_file(EDITOR_DIR / "index.html")

        # 静态文件：/editor/*
        if path.startswith("/editor/"):
            rel = path[len("/editor/"):]
            target = (EDITOR_DIR / rel).resolve()
            try:
                target.relative_to(EDITOR_DIR.resolve())
            except ValueError:
                return self._send_json({"success": False, "error": "非法路径"}, 400)
            return self._serve_file(target)

        return self._send_json({"success": False, "error": "Not Found"}, 404)

    def do_HEAD(self):
        """不提供 HEAD。

        若不定制此方法，请求会落回 SimpleHTTPRequestHandler.do_HEAD → send_head，
        从服务端工作目录提供静态文件：既绕过 _guard 的 Host/来源校验（DNS 重绑定
        场景下攻击者同源可读响应头），又暴露仓内文件是否存在与体积。
        本服务无任何需要 HEAD 的场景，直接拒绝。
        """
        if self._guard():
            return
        self.send_response(405)
        self.send_header("Allow", "GET, POST, OPTIONS")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_POST(self):
        if self._guard(mutating=True):
            return
        parsed = urllib.parse.urlparse(self.path)
        path = urllib.parse.unquote(parsed.path)

        # 换照片：POST /api/photo —— 直接替换 config/photo.jpg
        # （全站只有这一张照片；旧图先备份到 output/_backup/photo-prev.jpg）
        if path == "/api/photo":
            length = int(self.headers.get("Content-Length", 0))
            if length > self.MAX_UPLOAD_BYTES:
                return self._send_json(
                    {"success": False, "error": f"文件过大（上限 {self.MAX_UPLOAD_BYTES // 1024 // 1024}MB）"}, 413
                )
            data = self.rfile.read(length) if length else b""
            if not data:
                return self._send_json({"success": False, "error": "空文件"}, 400)
            if not is_image_bytes(data):
                return self._send_json(
                    {"success": False, "error": "不是可识别的图片（支持 JPEG / PNG / GIF / WebP）"}, 400
                )
            backup_rel = None
            if PHOTO_PATH.exists():
                BACKUP_DIR.mkdir(parents=True, exist_ok=True)
                prev = BACKUP_DIR / "photo-prev.jpg"
                shutil.copy2(PHOTO_PATH, prev)
                backup_rel = str(prev.relative_to(DATA_ROOT))
            PHOTO_PATH.parent.mkdir(parents=True, exist_ok=True)
            tmp = PHOTO_PATH.with_name("photo.uploading")
            tmp.write_bytes(data)
            os.replace(tmp, PHOTO_PATH)   # 原子替换，避免留下半截文件
            return self._send_json({"success": True, "message": "照片已替换", "backup": backup_rel})

        if path.startswith("/api/resume/"):
            parts = path[len("/api/resume/"):].split("/")
            if len(parts) != 2:
                return self._send_json({"success": False, "error": "路径格式应为 /api/resume/<公司>/<岗位>"}, 400)
            md_path = resolve_resume(parts[0], parts[1])
            if md_path is None:
                return self._send_json({"success": False, "error": "非法路径"}, 400)
            try:
                raw = self._read_body(limit=self.MAX_UPLOAD_BYTES)
                if raw is None:
                    return self._send_json({"success": False, "error": "内容过大"}, 413)
                payload = json.loads(raw or "{}")
            except json.JSONDecodeError:
                return self._send_json({"success": False, "error": "请求体不是合法 JSON"}, 400)
            markdown = payload.get("markdown")
            if not isinstance(markdown, str):
                return self._send_json({"success": False, "error": "缺少 markdown 字段"}, 400)
            md_path.parent.mkdir(parents=True, exist_ok=True)
            md_path.write_text(markdown, encoding="utf-8")
            return self._send_json({"success": True, "message": "保存成功"})
        return self._send_json({"success": False, "error": "Not Found"}, 404)

    def do_OPTIONS(self):
        # 不提供 CORS 预检：跨源写入会被浏览器阻止（本服务仅限本机页面使用）
        self._send_json({"success": False, "error": "不支持跨源请求"}, 403)

    def _serve_file(self, path):
        if not path.exists() or not path.is_file():
            return self._send_json({"success": False, "error": f"文件不存在: {path.name}"}, 404)
        ext = path.suffix.lower()
        ctypes = {
            ".html": "text/html; charset=utf-8",
            ".js": "application/javascript; charset=utf-8",
            ".css": "text/css; charset=utf-8",
            ".json": "application/json; charset=utf-8",
            ".png": "image/png",
            ".jpg": "image/jpeg",
            ".svg": "image/svg+xml",
            ".woff": "font/woff",
            ".woff2": "font/woff2",
            ".ttf": "font/ttf",
        }
        data = path.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", ctypes.get(ext, "application/octet-stream"))
        self.send_header("Content-Length", str(len(data)))
        # 安全响应头
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Referrer-Policy", "no-referrer")
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, fmt, *args):
        # 精简日志：只记录 API 调用
        if "/api/" in (self.path or ""):
            sys.stderr.write("[api] %s\n" % (self.path,))


def main():
    import argparse

    parser = argparse.ArgumentParser(description="简历编辑器本地服务")
    parser.add_argument("--port", type=int, default=PORT, help=f"监听端口（默认 {PORT}）")
    args = parser.parse_args()
    port = args.port

    if not EDITOR_DIR.exists():
        print(f"错误：编辑器目录不存在 {EDITOR_DIR}", file=sys.stderr)
        sys.exit(1)
    try:
        server = QuietHTTPServer(("127.0.0.1", port), Handler)
    except OSError as e:
        print(f"错误：端口 {port} 无法绑定（{e}）", file=sys.stderr)
        sys.exit(1)
    url = f"http://localhost:{port}/editor/"
    print(f"简历编辑器已启动：{url}")
    print("（Ctrl+C 停止）")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n已停止")
        server.server_close()


if __name__ == "__main__":
    main()
