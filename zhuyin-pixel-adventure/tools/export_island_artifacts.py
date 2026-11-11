#!/usr/bin/env python3
"""Export 1x full portrait island PNG and 3x pad crops for review artifacts."""
from __future__ import annotations

import json
import shutil
import subprocess
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
CFG = ROOT / "src" / "map_config.json"
OUT = ROOT / "static" / "island"
ART = Path("/opt/cursor/artifacts")
CROP_HALF = 88
CROP_ZOOM = 3


def crop_3x(img: Image.Image, cx: int, cy: int, dest: Path) -> None:
    w, h = img.size
    x0 = max(0, cx - CROP_HALF)
    y0 = max(0, cy - CROP_HALF)
    x1 = min(w, cx + CROP_HALF)
    y1 = min(h, cy + CROP_HALF)
    crop = img.crop((x0, y0, x1, y1))
    out = crop.resize((crop.width * CROP_ZOOM, crop.height * CROP_ZOOM), Image.NEAREST)
    dest.parent.mkdir(parents=True, exist_ok=True)
    out.save(dest, format="PNG")


def main() -> int:
    ART.mkdir(parents=True, exist_ok=True)
    cfg = json.loads(CFG.read_text())
    portrait = Image.open(OUT / "island-portrait-1080x1920.webp").convert("RGB")
    full_png = ART / "v9.21h-portrait-island-1x-full.png"
    portrait.save(full_png, format="PNG", compress_level=3)
    shutil.copy2(full_png, ART / "v9.21h-portrait-map-1x-stitched.png")

    files = {
        "portrait": ("island-portrait-1080x1920.webp", cfg["door_points_portrait"]),
        "landscape": ("island-landscape-2560x1440.webp", cfg["door_points_landscape"]),
    }
    before_mode: dict[str, Image.Image] = {}
    after_mode: dict[str, Image.Image] = {}
    for mode, (fname, doors) in files.items():
        after_mode[mode] = Image.open(OUT / fname).convert("RGB")
        bpath = ART / f"v9.21h-island-before-{mode}.webp"
        if bpath.exists():
            before_mode[mode] = Image.open(bpath).convert("RGB")
        else:
            before_mode[mode] = after_mode[mode].copy()

        for key, (cx, cy) in doors.items():
            crop_3x(
                before_mode[mode],
                int(cx),
                int(cy),
                ART / f"v9.21h-pad-crop-3x-before-{key}-{mode}.png",
            )
            crop_3x(
                after_mode[mode],
                int(cx),
                int(cy),
                ART / f"v9.21h-pad-crop-3x-after-{key}-{mode}.png",
            )

    manifest = {
        "portrait1x": str(full_png),
        "padCrops3x": {
            mode: {
                key: {
                    "before": str(ART / f"v9.21h-pad-crop-3x-before-{key}-{mode}.png"),
                    "after": str(ART / f"v9.21h-pad-crop-3x-after-{key}-{mode}.png"),
                }
                for key in files[mode][1]
            }
            for mode in files
        },
    }
    (ART / "v9.21h-island-export-manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
