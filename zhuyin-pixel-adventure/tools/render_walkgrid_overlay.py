#!/usr/bin/env python3
"""Render walk mask over island art (red = blocked / non-walkable cell)."""
from __future__ import annotations

import struct
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "static" / "island"
ART = Path("/opt/cursor/artifacts")
STEP = 4


def load_mask(path: Path) -> tuple[int, int, bytes]:
    data = path.read_bytes()
    mw, mh = struct.unpack_from("<II", data, 0)
    return mw, mh, data[8:]


def render(mode: str, webp: str, bin_name: str, tag: str) -> str:
    img = Image.open(OUT / webp).convert("RGBA")
    w, h = img.size
    mw, mh, bits = load_mask(OUT / bin_name)
    overlay = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    opx = overlay.load()
    for my in range(mh):
        for mx in range(mw):
            i = my * mw + mx
            walk = bool(bits[i // 8] & (1 << (i % 8)))
            if walk:
                continue
            x0, y0 = mx * STEP, my * STEP
            for dy in range(STEP):
                for dx in range(STEP):
                    x, y = x0 + dx, y0 + dy
                    if x >= w or y >= h:
                        continue
                    opx[x, y] = (220, 40, 40, 140)
    out = Image.alpha_composite(img, overlay)
    dest = ART / f"{tag}-walkgrid-{mode}.png"
    dest.parent.mkdir(parents=True, exist_ok=True)
    out.save(dest, format="PNG")
    return str(dest)


def main() -> int:
    ART.mkdir(parents=True, exist_ok=True)
    tag = sys.argv[1] if len(sys.argv) > 1 else "v9.21h"
    paths = {
        "portrait": render(mode, *pair, tag)
        for mode, pair in [
            ("portrait", ("island-portrait-1080x1920.webp", "walk-portrait.bin")),
            ("landscape", ("island-landscape-2560x1440.webp", "walk-landscape.bin")),
        ]
    }
    print(paths)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
