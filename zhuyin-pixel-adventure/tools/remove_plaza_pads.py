#!/usr/bin/env python3
"""Erase baked elliptical door pads from v9.21g island art; keep layout unchanged."""
from __future__ import annotations

import json
import shutil
import struct
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "static" / "island"
DIST = ROOT / "dist" / "island"
CFG = ROOT / "src" / "map_config.json"
ART = Path("/opt/cursor/artifacts")

PLAZA_RADIUS = {"portrait": 52, "landscape": 64}


def is_water(r: int, g: int, b: int) -> bool:
    if b > 95 and b > r + 18 and b > g + 8:
        return True
    if b > 60 and r < 80 and g < 120 and b > r + 30:
        return True
    return False


def is_pathish(r: int, g: int, b: int) -> bool:
    if is_water(r, g, b):
        return False
    if r > 105 and g > 82 and b < r - 4 and g < r and r < 210:
        return True
    return False


def ellipse_mask(w: int, h: int, cx: float, cy: float, radius: int) -> Image.Image:
    mask = Image.new("L", (w, h), 0)
    d = ImageDraw.Draw(mask)
    d.ellipse(
        (cx - radius, cy - radius * 0.75, cx + radius, cy + radius * 0.55),
        fill=255,
    )
    return mask


def ring_samples(px, w, h, cx, cy, radius, mode: str) -> list[tuple[int, int, int]]:
    """Colors in an annulus just outside the painted pad — grass/path around the door."""
    samples: list[tuple[int, int, int]] = []
    r0 = int(radius * 0.95)
    r1 = int(radius * 1.45)
    for y in range(int(cy - r1), int(cy + r1), 3):
        for x in range(int(cx - r1), int(cx + r1), 3):
            if x < 0 or y < 0 or x >= w or y >= h:
                continue
            dx = (x - cx) / max(r1, 1)
            dy = (y - cy) / max(r1 * 0.75, 1)
            d2 = dx * dx + dy * dy
            if d2 < (r0 / r1) ** 2 or d2 > 1.0:
                continue
            c = px[x, y]
            if is_water(*c):
                continue
            # Prefer non-pad grass; still allow path from spine connectors.
            if is_pathish(*c) and mode == "erase_pad":
                pass
            samples.append(c)
    return samples


def remove_pad_at(img: Image.Image, cx: float, cy: float, radius: int) -> int:
    w, h = img.size
    mask = ellipse_mask(w, h, cx, cy, radius)
    px = img.load()
    samples = ring_samples(px, w, h, cx, cy, radius, "erase_pad")
    if len(samples) < 40:
        samples = ring_samples(px, w, h, cx, cy, radius, "wide")
    if not samples:
        return 0
    n_changed = 0
    mpx = mask.load()
    import random

    random.seed(int(cx) * 17 + int(cy))
    for y in range(h):
        for x in range(w):
            if mpx[x, y] < 128:
                continue
            n_changed += 1
            px[x, y] = random.choice(samples)
    return n_changed


def main() -> None:
    cfg = json.loads(CFG.read_text())
    files = {
        "portrait": ("island-portrait-1080x1920.webp", cfg["door_points_portrait"]),
        "landscape": ("island-landscape-2560x1440.webp", cfg["door_points_landscape"]),
    }
    ART.mkdir(parents=True, exist_ok=True)
    log = []
    for mode, (fname, doors) in files.items():
        path = OUT / fname
        img = Image.open(path).convert("RGB")
        radius = PLAZA_RADIUS[mode]
        before = img.copy()
        for key, (dx, dy) in doors.items():
            n = remove_pad_at(img, float(dx), float(dy), radius)
            log.append({"mode": mode, "building": key, "door": [dx, dy], "pixels_erased": n})
        img.save(path, format="WEBP", quality=84, method=6)
        DIST.mkdir(parents=True, exist_ok=True)
        shutil.copy2(path, DIST / fname)
        # audit overlay
        out = before.copy().convert("RGBA")
        d = ImageDraw.Draw(out)
        for key, (dx, dy) in doors.items():
            d.ellipse(
                (dx - radius, dy - radius * 0.75, dx + radius, dy + radius * 0.55),
                outline=(255, 0, 128, 220),
                width=3,
            )
            d.text((dx - 40, dy - radius - 30), key, fill=(255, 0, 128, 255))
        tag = f"v9.21h-pad-erase-{mode}"
        out.save(ART / f"{tag}.png")

    # regen walk masks
    import subprocess

    subprocess.check_call(["python3", str(ROOT / "tools" / "regen_walk_masks.py")])
    (ART / "v9.21h-pad-erase-log.json").write_text(json.dumps(log, indent=2), encoding="utf-8")
    print(json.dumps(log, indent=2))


if __name__ == "__main__":
    main()
