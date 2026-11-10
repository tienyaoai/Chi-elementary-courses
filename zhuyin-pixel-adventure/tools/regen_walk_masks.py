#!/usr/bin/env python3
"""Regenerate walk-*.bin from island map art (only path + lawn; water/trees blocked)."""
from __future__ import annotations

import struct
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "static" / "island"
DIST = ROOT / "dist" / "island"


def is_water(r: int, g: int, b: int, a: int) -> bool:
    if a < 128:
        return True
    if b > 95 and b > r + 18 and b > g + 8:
        return True
    if b > 170 and g > 140 and r > 100 and b >= r:
        return True
    if b > 60 and r < 80 and g < 120 and b > r + 30:
        return True
    if b >= 85 and g >= 85 and b > r + 12 and g > r + 35:
        return True
    return False


def is_pathish(r: int, g: int, b: int, a: int) -> bool:
    if a < 128 or is_water(r, g, b, a):
        return False
    if r > 105 and g > 82 and b < r - 4 and g < r and r < 210:
        return True
    return False


def is_lawn(r: int, g: int, b: int, a: int) -> bool:
    """Open grass tiles (not dark forest canopy)."""
    if a < 128 or is_water(r, g, b, a):
        return False
    if is_pathish(r, g, b, a):
        return True
    if r < 28:
        return False
    if g < 75 or g > 210:
        return False
    if g < r + 12:
        return False
    if b > g - 8:
        return False
    return True


def is_tree_or_cliff(r: int, g: int, b: int, a: int) -> bool:
    if a < 128:
        return True
    if is_water(r, g, b, a):
        return True
    # dark canopy (not bright lawn)
    if g >= 90:
        return False
    if g >= 50 and r <= 55 and b <= 85 and g > r + 15 and g < 88:
        return True
    return False


def is_walk_surface(r: int, g: int, b: int, a: int) -> bool:
    if is_tree_or_cliff(r, g, b, a):
        return False
    return is_lawn(r, g, b, a)


def build_walk_mask(img: Image.Image, step: int = 4) -> tuple[int, int, bytes]:
    w, h = img.size
    mw, mh = (w + step - 1) // step, (h + step - 1) // step
    bits = bytearray((mw * mh + 7) // 8)
    px = img.convert("RGBA").load()
    for my in range(mh):
        for mx in range(mw):
            samples = [
                (mx * step + step // 2, my * step + step // 2),
                (mx * step + 1, my * step + step // 2),
                (mx * step + step - 1, my * step + step // 2),
                (mx * step + step // 2, my * step + 1),
                (mx * step + step // 2, my * step + step - 1),
            ]
            walk = True
            for x, y in samples:
                if x >= w or y >= h or not is_walk_surface(*px[x, y]):
                    walk = False
                    break
            i = my * mw + mx
            if walk:
                bits[i // 8] |= 1 << (i % 8)
    return mw, mh, bytes(bits)


def main() -> int:
    pairs = [
        ("island-portrait-1080x1920.webp", "walk-portrait.bin"),
        ("island-landscape-2560x1440.webp", "walk-landscape.bin"),
    ]
    for src_name, bin_name in pairs:
        src = OUT / src_name
        if not src.is_file():
            print(f"missing {src}", file=sys.stderr)
            return 1
        img = Image.open(src)
        mw, mh, bits = build_walk_mask(img)
        blob = struct.pack("<II", mw, mh) + bits
        (OUT / bin_name).write_bytes(blob)
        DIST.mkdir(parents=True, exist_ok=True)
        (DIST / bin_name).write_bytes(blob)
        print(f"wrote {bin_name} {mw}x{mh} from {src_name}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
