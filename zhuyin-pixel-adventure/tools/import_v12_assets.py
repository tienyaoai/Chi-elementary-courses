#!/usr/bin/env python3
"""Import map-art-v12 + sprites into static assets with walk masks."""
from __future__ import annotations

import json
import shutil
import struct
import sys
import zipfile
from io import BytesIO
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT_MAP = ROOT / "static" / "island"
OUT_CHAR = ROOT / "static" / "characters"
OUT_LM = ROOT / "static" / "landmarks"
OUT_RS = ROOT / "src" / "map_config.json"


def is_water(r: int, g: int, b: int, a: int) -> bool:
    if a < 128:
        return True
    # lake / sea / creek blues and cyans
    if b > 95 and b > r + 18 and b > g + 8:
        return True
    if b > 170 and g > 140 and r > 100 and b >= r:
        return True
    # deeper navy
    if b > 60 and r < 80 and g < 120 and b > r + 30:
        return True
    return False


def build_walk_mask(img: Image.Image, step: int = 4) -> tuple[int, int, bytes]:
    w, h = img.size
    mw, mh = (w + step - 1) // step, (h + step - 1) // step
    bits = bytearray((mw * mh + 7) // 8)
    px = img.convert("RGBA").load()
    for my in range(mh):
        for mx in range(mw):
            xs, ys = mx * step, my * step
            walk = False
            for dy in range(step):
                for dx in range(step):
                    x, y = xs + dx, ys + dy
                    if x >= w or y >= h:
                        continue
                    r, g, b, a = px[x, y]
                    if not is_water(r, g, b, a):
                        walk = True
                        break
                if walk:
                    break
            i = my * mw + mx
            if walk:
                bits[i // 8] |= 1 << (i % 8)
    return mw, mh, bytes(bits)


def save_webp(src: Path, dst: Path, max_w: int | None = None) -> None:
    im = Image.open(src).convert("RGBA")
    if max_w and im.width > max_w:
        nh = im.height * max_w // im.width
        im = im.resize((max_w, nh), Image.Resampling.LANCZOS)
    dst.parent.mkdir(parents=True, exist_ok=True)
    im.save(dst, format="WEBP", quality=82, method=6)


def main() -> None:
    map_zip = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(
        "/home/ubuntu/.cursor/projects/workspace/uploads/v12-maps_3ee9.zip"
    )
    spr_zip = Path(sys.argv[2]) if len(sys.argv) > 2 else Path(
        "/home/ubuntu/.cursor/projects/workspace/uploads/v12-sprites_fbcb.zip"
    )
    for d in (OUT_MAP, OUT_CHAR, OUT_LM):
        if d.exists():
            shutil.rmtree(d)
        d.mkdir(parents=True)

    with zipfile.ZipFile(map_zip) as zf:
        manifest = json.loads(zf.read("manifest.json"))
        for key, meta in manifest["maps"].items():
            if key.endswith("native.png"):
                continue
            name = Path(meta["path"]).name
            raw = zf.read(meta["path"])
            webp_name = name.replace(".png", ".webp")
            if "portrait-1080" in name:
                im = Image.open(BytesIO(raw))
                im.save(OUT_MAP / webp_name, format="WEBP", quality=84, method=6)
            elif "landscape-2560" in name:
                im = Image.open(BytesIO(raw))
                im.save(OUT_MAP / webp_name, format="WEBP", quality=84, method=6)
            else:
                im = Image.open(BytesIO(raw))
                im.save(OUT_MAP / webp_name, format="WEBP", quality=82, method=6)

        portrait = Image.open(BytesIO(zf.read("map/island-portrait-1080x1920.png")))
        landscape = Image.open(BytesIO(zf.read("map/island-landscape-2560x1440.png")))

    mw_p, mh_p, mask_p = build_walk_mask(portrait)
    mw_l, mh_l, mask_l = build_walk_mask(landscape)
    (OUT_MAP / "walk-portrait.bin").write_bytes(struct.pack("<II", mw_p, mh_p) + mask_p)
    (OUT_MAP / "walk-landscape.bin").write_bytes(struct.pack("<II", mw_l, mh_l) + mask_l)

    lm_coords = manifest["landmark_suggested_coords_on_portrait_1080x1920"]
    landscape_cfg = {}
    pw, ph = 1080, 1920
    lw, lh = 2560, 1440
    for k, v in lm_coords.items():
        if not isinstance(v, dict) or "x_norm" not in v:
            continue
        landscape_cfg[k] = {
            "x": round(v["x_norm"] * lw),
            "y": round(v["y_norm"] * lh),
            "x_norm": v["x_norm"],
            "y_norm": v["y_norm"],
        }

    with zipfile.ZipFile(spr_zip) as zf:
        for name in (
            "schoolhouse-chinese.png",
            "lighthouse-english.png",
            "workshop-math.png",
            "treasure-chest.png",
        ):
            raw = zf.read(f"landmarks/{name}")
            im = Image.open(BytesIO(raw)).convert("RGBA")
            th = 320
            tw = im.width * th // im.height
            im = im.resize((tw, th), Image.Resampling.LANCZOS)
            im.save(OUT_LM / name.replace(".png", ".webp"), format="WEBP", lossless=True)

        char_defs = []
        for i in range(1, 13):
            prefix = f"char{i}-"
            bust = None
            full = None
            for n in zf.namelist():
                if not n.startswith("characters/"):
                    continue
                base = Path(n).name
                if base.startswith(prefix) and base.endswith("-bust.png"):
                    bust = base
                if base.startswith(prefix) and base.endswith("-full.png"):
                    full = base
            if not bust or not full:
                raise SystemExit(f"missing char{i}")
            raw_b = zf.read(f"characters/{bust}")
            raw_f = zf.read(f"characters/{full}")
            ib = Image.open(BytesIO(raw_b)).convert("RGBA")
            ib = ib.resize((min(480, ib.width * 2), min(640, ib.height * 2)), Image.Resampling.LANCZOS)
            ib.save(OUT_CHAR / bust.replace(".png", ".webp"), format="WEBP", lossless=True)
            iff = Image.open(BytesIO(raw_f)).convert("RGBA")
            th = 220
            tw = iff.width * th // iff.height
            iff = iff.resize((tw, th), Image.Resampling.LANCZOS)
            iff.save(OUT_CHAR / full.replace(".png", ".webp"), format="WEBP", lossless=True)
            cid = f"char{i}"
            slug = bust.replace("-bust.png", "").replace(f"char{i}-", "")
            char_defs.append({"id": cid, "slug": slug, "bust": bust.replace(".png", ".webp"), "full": full.replace(".png", ".webp")})

    chars_meta = [
        ("char1", "草帽", "ㄋㄧˇ", "男"),
        ("char2", "藍巾", "ㄋㄧˇ", "男"),
        ("char3", "粉妮", "ㄋㄧˇ", "女"),
        ("char4", "小黃", "ㄋㄧˇ", "男"),
        ("char5", "小博", "ㄋㄧˇ", "男"),
        ("char6", "小青", "ㄋㄧˇ", "男"),
        ("char7", "小橘", "ㄋㄧˇ", "女"),
        ("char8", "小紅", "ㄋㄧˇ", "女"),
        ("char9", "小葵", "ㄋㄧˇ", "女"),
        ("char10", "紫丸", "ㄋㄧˇ", "女"),
        ("char11", "薄荷", "ㄋㄧˇ", "女"),
        ("char12", "小帽", "ㄋㄧˇ", "男"),
    ]
    names = {c[0]: {"short": c[1], "zhuyin": c[2], "gender": c[3]} for c in chars_meta}
    for c in char_defs:
        c.update(names.get(c["id"], {"short": c["id"], "zhuyin": "", "gender": ""}))

    bridge_p = manifest["bridge"]["portrait"]
    bridge_l = manifest["bridge"]["landscape"]
    dock_p = manifest["dock"]["portrait"]
    dock_l = manifest["dock"]["landscape"]

    cfg = {
        "portrait": {
            "src": "/island/island-portrait-1080x1920.webp",
            "width": 1080,
            "height": 1920,
            "walk": "walk-portrait.bin",
            "step": 4,
        },
        "landscape": {
            "src": "/island/island-landscape-2560x1440.webp",
            "width": 2560,
            "height": 1440,
            "walk": "walk-landscape.bin",
            "step": 4,
        },
        "spawn_portrait": {
            "x": dock_p["x"],
            "y": max(60, dock_p["y"] - 90),
        },
        "spawn_landscape": {
            "x": dock_l["x"],
            "y": max(60, dock_l["y"] - 90),
        },
        "landmarks_portrait": {
            "chinese": lm_coords["schoolhouse-chinese"],
            "english": lm_coords["lighthouse-english"],
            "math": lm_coords["workshop-math"],
            "treasure": lm_coords["treasure-chest"],
        },
        "landmarks_landscape": {
            "chinese": landscape_cfg["schoolhouse-chinese"],
            "english": landscape_cfg["lighthouse-english"],
            "math": landscape_cfg["workshop-math"],
            "treasure": landscape_cfg["treasure-chest"],
        },
        "landmark_files": {
            "chinese": "schoolhouse-chinese.webp",
            "english": "lighthouse-english.webp",
            "math": "workshop-math.webp",
            "treasure": "treasure-chest.webp",
        },
        "characters": char_defs,
        "enter_radius": 140,
        "walk_overrides_portrait": [
            {
                "x": bridge_p["x"] - 110,
                "y": bridge_p["y"] - 45,
                "w": 220,
                "h": 90,
            },
            {
                "x": dock_p["x"] - 55,
                "y": dock_p["y"] - 170,
                "w": 110,
                "h": 190,
            },
        ],
        "walk_overrides_landscape": [
            {
                "x": bridge_l["x"] - 140,
                "y": bridge_l["y"] - 55,
                "w": 280,
                "h": 110,
            },
            {
                "x": dock_l["x"] - 70,
                "y": dock_l["y"] - 200,
                "w": 140,
                "h": 220,
            },
        ],
    }
    OUT_RS.write_text(json.dumps(cfg, ensure_ascii=False, indent=2), encoding="utf-8")

    total = sum(f.stat().st_size for f in ROOT.glob("static/**/*") if f.is_file())
    print(f"Assets OK; static total {total / 1024 / 1024:.2f} MiB")
    print(f"Config -> {OUT_RS}")


if __name__ == "__main__":
    main()
