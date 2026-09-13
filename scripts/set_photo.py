#!/usr/bin/env python3
"""
换简历照片（set_photo.py）

把一张图片替换为简历照片（数据目录下的 config/photo.jpg）。
编辑器里的「换照片」按钮做的是同一件事；本脚本额外支持**压缩**，供命令行与 AI 使用。

用法：
  python scripts/set_photo.py <图片路径>                  # 默认压到长边 900px、质量 85
  python scripts/set_photo.py <图片路径> --max-px 1200    # 换压缩尺寸
  python scripts/set_photo.py <图片路径> --no-compress    # 原样拷贝，不压缩
  python scripts/set_photo.py <图片路径> --dry-run        # 只打印将做什么，不改任何文件

行为（顺序固定）：
  1. 校验：按文件头判断是否图片（JPEG / PNG / GIF / WebP）；压缩路径还会用 Pillow 实际解码
  2. 压缩（可选）：应用 EXIF 方向 → 长边缩到 --max-px → 存为 JPEG
  3. 备份：旧照片复制到 <数据目录>/output/_backup/photo-prev.jpg（覆盖上一份备份）
  4. 写入：先写临时文件再原子替换 config/photo.jpg，避免出现半截文件

压缩需要 Pillow（`pip install Pillow`）；不压缩则无第三方依赖。
"""
import argparse
import os
import shutil
import sys

from paths import BACKUP_DIR, PHOTO_PATH

MAGIC = ((b"\xff\xd8\xff", "JPEG"), (b"\x89PNG\r\n\x1a\n", "PNG"), (b"GIF8", "GIF"))


def sniff_format(path: str):
    """按文件头判断图片格式；不是图片返回 None。"""
    head = open(path, "rb").read(12)
    for magic, name in MAGIC:
        if head.startswith(magic):
            return name
    if head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return "WebP"
    return None


def human(size: int) -> str:
    return f"{size / 1024:.1f} KB" if size < 1024 * 1024 else f"{size / 1024 / 1024:.1f} MB"


def _compress(src: str, max_px: int, quality: int, dst: str):
    """压缩到 dst；返回 ((原宽,原高), (新宽,新高))，失败返回 None。"""
    try:
        from PIL import Image, ImageOps
    except ImportError:
        print("❌ 需要 Pillow 才能压缩：pip install Pillow（或用 --no-compress 原样拷贝）", file=sys.stderr)
        return None
    try:
        im = Image.open(src)
        im = ImageOps.exif_transpose(im).convert("RGB")
    except Exception as e:
        print(f"❌ 无法解码图片：{e}", file=sys.stderr)
        return None
    before = im.size
    im.thumbnail((max_px, max_px), Image.LANCZOS)
    im.save(dst, "JPEG", quality=quality, optimize=True, progressive=True)
    return before, im.size


def main():
    ap = argparse.ArgumentParser(description="替换简历照片（config/photo.jpg）")
    ap.add_argument("image", help="新照片路径")
    ap.add_argument("--max-px", type=int, default=900, help="长边最大像素（默认 900）")
    ap.add_argument("--quality", type=int, default=85, help="JPEG 质量（默认 85）")
    ap.add_argument("--no-compress", action="store_true", help="原样拷贝，不压缩")
    ap.add_argument("--dry-run", action="store_true", help="只显示将执行的动作")
    args = ap.parse_args()

    src = os.path.abspath(args.image)
    if not os.path.isfile(src):
        print(f"❌ 找不到文件：{src}", file=sys.stderr)
        sys.exit(1)
    fmt = sniff_format(src)
    if not fmt:
        print("❌ 不是可识别的图片（支持 JPEG / PNG / GIF / WebP）", file=sys.stderr)
        sys.exit(1)
    print(f"新照片：{src}\n  格式 {fmt}，{human(os.path.getsize(src))}")
    if PHOTO_PATH.exists():
        print(f"现有照片：{human(os.path.getsize(PHOTO_PATH))}（{PHOTO_PATH}）")
        print(f"  → 将备份到 {BACKUP_DIR / 'photo-prev.jpg'}")
    else:
        print(f"现有照片：无（{PHOTO_PATH} 不存在，将直接写入）")

    if args.dry_run:
        print("（--dry-run：未做任何修改）")
        return

    PHOTO_PATH.parent.mkdir(parents=True, exist_ok=True)
    tmp = PHOTO_PATH.parent / "photo.uploading"
    if args.no_compress:
        shutil.copy2(src, tmp)
    else:
        result = _compress(src, args.max_px, args.quality, str(tmp))
        if result is None:
            tmp.unlink(missing_ok=True)
            sys.exit(1)
        (w0, h0), (w1, h1) = result
        print(f"  压缩：{w0}×{h0} → {w1}×{h1}（长边 {args.max_px}px，质量 {args.quality}）")

    if PHOTO_PATH.exists():
        BACKUP_DIR.mkdir(parents=True, exist_ok=True)
        shutil.copy2(PHOTO_PATH, BACKUP_DIR / "photo-prev.jpg")
    os.replace(tmp, PHOTO_PATH)
    print(f"✅ 已替换：{PHOTO_PATH}（{human(os.path.getsize(PHOTO_PATH))}）")
    print("   刷新编辑器页面即生效。")


if __name__ == "__main__":
    main()
