#!/usr/bin/env python3
"""Fail if any visibly water pixel lies in a walkable mask cell (no pad overrides)."""
from __future__ import annotations

import json
import struct
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "static" / "island"
CFG = ROOT / "src" / "map_config.json"
ART = Path("/opt/cursor/artifacts")
STEP = 4


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


def load_mask(path: Path) -> tuple[int, int, bytes]:
    data = path.read_bytes()
    mw, mh = struct.unpack_from("<II", data, 0)
    return mw, mh, data[8:]


def cell_walkable(bits, mw, x: int, y: int) -> bool:
    mx, my = x // STEP, y // STEP
    i = my * mw + mx
    return bool(bits[i // 8] & (1 << (i % 8)))


TREASURE_BOX = {
    "portrait": (500, 880, 670, 1060),
    "landscape": (1080, 680, 1240, 830),
}


def verify_mode(mode: str, webp: str, bin_name: str) -> dict:
    img = Image.open(OUT / webp).convert("RGBA")
    w, h = img.size
    px = img.load()
    mw, mh, bits = load_mask(OUT / bin_name)
    x0, y0, x1, y1 = TREASURE_BOX[mode]
    water_walk = 0
    samples = []
    for my in range(mh):
        for mx in range(mw):
            x, y = mx * STEP, my * STEP
            if not (x0 <= x < x1 and y0 <= y < y1):
                continue
            if not cell_walkable(bits, mw, x, y):
                continue
            water_px = 0
            total = 0
            for dy in range(STEP):
                for dx in range(STEP):
                    xx, yy = x + dx, y + dy
                    if xx >= w or yy >= h:
                        continue
                    total += 1
                    if is_water(*px[xx, yy]):
                        water_px += 1
            if total and water_px >= total // 2:
                water_walk += 1
                if len(samples) < 12:
                    samples.append([x, y, water_px, total])
    ok = water_walk == 0
    report = {"mode": mode, "waterWalkCells": water_walk, "samples": samples, "ok": ok}
    return report


def main() -> int:
    ART.mkdir(parents=True, exist_ok=True)
    reports = [
        verify_mode("portrait", "island-portrait-1080x1920.webp", "walk-portrait.bin"),
        verify_mode("landscape", "island-landscape-2560x1440.webp", "walk-landscape.bin"),
    ]
    out = {"ok": all(r["ok"] for r in reports), "modes": reports}
    (ART / "v9.21h-water-walk-verify.json").write_text(json.dumps(out, indent=2))
    print(json.dumps(out, indent=2))
    return 0 if out["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
