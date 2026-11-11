#!/usr/bin/env python3
"""v9.19 island path audit, plaza paint, walk-mask regen, map_config refresh."""
from __future__ import annotations

import json
import math
import shutil
import struct
import sys
import zipfile
from dataclasses import dataclass
from io import BytesIO
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT_MAP = ROOT / "static" / "island"
CFG_PATH = ROOT / "src" / "map_config.json"
ART = Path("/opt/cursor/artifacts")
MAP_ZIP = Path(
    "/home/ubuntu/.cursor/projects/workspace/uploads/v12-maps_3ee9.zip"
)

# Door offsets match map_config.rs door_point()
DOOR_OFF = {
    "chinese": {"landscape": (22, 252), "portrait": (8, 102)},
    "english": {"landscape": (-22, 88), "portrait": (-12, 70)},
    "math": {"landscape": (10, 108), "portrait": (4, 96)},
    "treasure": {"landscape": (0, 42), "portrait": (0, 38)},
}

LABELS = {
    "chinese": "國語學校",
    "english": "英文燈塔",
    "math": "數學工坊",
    "treasure": "寶箱",
}

# v9.19: slight offsets off path spine; treasure stays off bridge (v9.18).
LANDMARK_V919 = {
    "portrait": {
        "chinese": {"x": 296, "y": 1098},
        "english": {"x": 896, "y": 654},
        "math": {"x": 728, "y": 1188},
        "treasure": {"x": 570, "y": 950},
    },
    "landscape": {
        "chinese": {"x": 784, "y": 824},
        "english": {"x": 2096, "y": 487},
        "math": {"x": 1688, "y": 891},
        "treasure": {"x": 1180, "y": 720},
    },
}

PLAZA_RADIUS = {"portrait": 52, "landscape": 64}


def is_water(r: int, g: int, b: int, a: int) -> bool:
    if a < 128:
        return True
    if b > 95 and b > r + 18 and b > g + 8:
        return True
    if b > 170 and g > 140 and r > 100 and b >= r:
        return True
    if b > 60 and r < 80 and g < 120 and b > r + 30:
        return True
    return False


def is_pathish(r: int, g: int, b: int, a: int) -> bool:
    if a < 128 or is_water(r, g, b, a):
        return False
    # tan/dirt trail
    if r > 105 and g > 82 and b < r - 4 and g < r and r < 210:
        return True
    return False


def door_xy(key: str, mode: str, cfg: dict) -> tuple[float, float]:
    lm = cfg[f"landmarks_{mode}"][key]
    ox, oy = DOOR_OFF[key][mode]
    return lm["x"] + ox, lm["y"] + oy


def build_walk_mask(img: Image.Image, step: int = 4) -> tuple[int, int, bytes]:
    w, h = img.size
    mw, mh = (w + step - 1) // step, (h + step - 1) // step
    bits = bytearray((mw * mh + 7) // 8)
    px = img.convert("RGBA").load()
    for my in range(mh):
        for mx in range(mw):
            walk = False
            for dy in range(step):
                for dx in range(step):
                    x, y = mx * step + dx, my * step + dy
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


def sample_path_color(img: Image.Image, x: int, y: int, r: int = 40) -> tuple[int, int, int]:
    px = img.convert("RGB").load()
    w, h = img.size
    samples = []
    for dy in range(-r, r + 1, 6):
        for dx in range(-r, r + 1, 6):
            xx, yy = x + dx, y + dy
            if 0 <= xx < w and 0 <= yy < h:
                p = px[xx, yy]
                if is_pathish(*p, 255):
                    samples.append(p)
    if not samples:
        return (168, 138, 98)
    return tuple(sum(c[i] for c in samples) // len(samples) for i in range(3))


def paint_plaza(img: Image.Image, cx: float, cy: float, radius: int) -> None:
    col = sample_path_color(img, int(cx), int(cy))
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    d.ellipse(
        (cx - radius, cy - radius * 0.75, cx + radius, cy + radius * 0.55),
        fill=(*col, 255),
    )
    d.ellipse(
        (cx - radius + 6, cy - radius * 0.7, cx + radius - 6, cy + radius * 0.5),
        fill=(min(255, col[0] + 12), min(255, col[1] + 10), min(255, col[2] + 8), 255),
    )
    base = img.convert("RGBA")
    base.alpha_composite(layer)
    img.paste(base.convert("RGB"))


def carve_path_connector(img: Image.Image, x0: float, y0: float, x1: float, y1: float, width: int = 22) -> None:
    col = sample_path_color(img, int(x0), int(y0))
    d = ImageDraw.Draw(img)
    d.line((x0, y0, x1, y1), fill=col, width=width)


@dataclass
class Issue:
    mode: str
    key: str
    kind: str
    detail: str
    xy: tuple[float, float]


def standable_mask_point(mask_bits, mw, mh, step, x, y, blocked, overrides, portrait: bool) -> bool:
    if any(r["x"] <= x <= r["x"] + r["w"] and r["y"] <= y <= r["y"] + r["h"] for r in blocked):
        return False
    if any(r["x"] <= x <= r["x"] + r["w"] and r["y"] <= y <= r["y"] + r["h"] for r in overrides):
        return True
    mx = int(x // step)
    my = int(y // step)
    if mx < 0 or my < 0 or mx >= mw or my >= mh:
        return False
    i = my * mw + mx
    walk = bool(mask_bits[i // 8] & (1 << (i % 8)))
    if portrait and walk:
        buf = 12
        hits = 0
        for dx, dy in ((buf, 0), (-buf, 0), (0, buf), (0, -buf)):
            xx, yy = x + dx, y + dy
            mx2, my2 = int(xx // step), int(yy // step)
            if 0 <= mx2 < mw and 0 <= my2 < mh:
                j = my2 * mw + mx2
                if not (mask_bits[j // 8] & (1 << (j % 8))):
                    hits += 1
        if hits >= 3:
            return False
    pts = [(0, 0), (-10, 0), (10, 0), (0, -12), (0, 12), (-8, 8), (8, 8)]
    for dx, dy in pts:
        px, py = x + dx, y + dy
        if any(r["x"] <= px <= r["x"] + r["w"] and r["y"] <= py <= r["y"] + r["h"] for r in blocked):
            return False
        if any(r["x"] <= px <= r["x"] + r["w"] and r["y"] <= py <= r["y"] + r["h"] for r in overrides):
            continue
        mx2, my2 = int(px // step), int(py // step)
        if mx2 < 0 or my2 < 0 or mx2 >= mw or my2 >= mh:
            return False
        j = my2 * mw + mx2
        if not (mask_bits[j // 8] & (1 << (j % 8))):
            return False
    return walk


def audit(cfg: dict, portrait: Image.Image, landscape: Image.Image) -> list[Issue]:
    issues: list[Issue] = []
    imgs = {"portrait": portrait, "landscape": landscape}
    spawns = {
        "portrait": (cfg["spawn_portrait"]["x"], cfg["spawn_portrait"]["y"]),
        "landscape": (cfg["spawn_landscape"]["x"], cfg["spawn_landscape"]["y"]),
    }
    for mode in ("portrait", "landscape"):
        img = imgs[mode]
        mw, mh, bits = build_walk_mask(img)
        blocked = cfg.get(f"walk_blocked_{mode}", [])
        overrides = cfg.get(f"walk_overrides_{mode}", [])
        sx, sy = spawns[mode]
        for key in ("chinese", "english", "math", "treasure"):
            dx, dy = door_xy(key, mode, cfg)
            if not standable_mask_point(bits, mw, mh, 4, dx, dy, blocked, overrides, mode == "portrait"):
                issues.append(Issue(mode, key, "door_not_walkable", "door plaza blocked", (dx, dy)))
            lm = cfg[f"landmarks_{mode}"][key]
            lx, ly = lm["x"], lm["y"]
            px = img.convert("RGBA").load()
            path_here = 0
            for oy in range(-60, 40, 10):
                for ox in range(-40, 40, 10):
                    x, y = lx + ox, ly + oy
                    if 0 <= x < img.width and 0 <= y < img.height:
                        p = px[x, y]
                        if is_pathish(p[0], p[1], p[2], p[3]):
                            path_here += 1
            door_path = 0
            for oy in range(-20, 24, 8):
                for ox in range(-20, 24, 8):
                    x, y = int(dx) + ox, int(dy) + oy
                    if 0 <= x < img.width and 0 <= y < img.height:
                        p = px[x, y]
                        if is_pathish(p[0], p[1], p[2], p[3]):
                            door_path += 1
            if path_here > 24 and door_path < 4:
                issues.append(
                    Issue(mode, key, "path_through_facade", "building on trail without plaza", (lx, ly))
                )
            # ray from spawn toward door — blocked rect across corridor
            steps = 48
            for t in range(1, steps):
                rx = sx + (dx - sx) * t / steps
                ry = sy + (dy - sy) * t / steps
                if any(
                    r["x"] <= rx <= r["x"] + r["w"] and r["y"] <= ry <= r["y"] + r["h"] for r in blocked
                ):
                    issues.append(
                        Issue(mode, key, "block_on_approach", "blocked zone on route from dock", (rx, ry))
                    )
                    break
    return issues


def annotate(img: Image.Image, cfg: dict, mode: str, issues: list[Issue], tag: str) -> Image.Image:
    out = img.copy().convert("RGBA")
    d = ImageDraw.Draw(out)
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 28)
        font_s = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 22)
    except OSError:
        font = ImageFont.load_default()
        font_s = font
    for key in ("chinese", "english", "math", "treasure"):
        lm = cfg[f"landmarks_{mode}"][key]
        lx, ly = lm["x"], lm["y"]
        dx, dy = door_xy(key, mode, cfg)
        d.rectangle((lx - 80, ly - 200, lx + 80, ly + 20), outline=(255, 40, 40, 220), width=3)
        d.ellipse((dx - 14, dy - 14, dx + 14, dy + 14), fill=(255, 220, 40, 220))
        d.text((lx - 70, ly - 230), LABELS[key], fill=(255, 80, 80, 255), font=font_s)
        carve = PLAZA_RADIUS[mode]
        d.ellipse(
            (dx - carve, dy - carve, dx + carve, dy + carve),
            outline=(60, 200, 255, 200),
            width=2,
        )
    for iss in [i for i in issues if i.mode == mode]:
        x, y = iss.xy
        d.line((x - 20, y - 20, x + 20, y + 20), fill=(255, 0, 255, 255), width=4)
        d.line((x - 20, y + 20, x + 20, y - 20), fill=(255, 0, 255, 255), width=4)
        d.text((x + 24, y), f"{iss.key}:{iss.kind}", fill=(255, 0, 255, 255), font=font_s)
    d.text((24, 24), tag, fill=(255, 255, 255, 255), font=font)
    return out


def plaza_rect(cx: float, cy: float, w: int, h: int) -> dict:
    return {"x": int(cx - w / 2), "y": int(cy - h / 2), "w": w, "h": h}


def apply_v919_blocked(cfg: dict) -> None:
    """Building bodies off spine; door plazas + bridge/dock overrides."""
    cfg["walk_blocked_portrait"] = [
        {"x": 248, "y": 988, "w": 92, "h": 148},
        {"x": 868, "y": 548, "w": 78, "h": 118},
        {"x": 652, "y": 1118, "w": 112, "h": 98},
        {"x": 538, "y": 898, "w": 58, "h": 48},
    ]
    cfg["walk_blocked_landscape"] = [
        {"x": 718, "y": 768, "w": 158, "h": 218},
        {"x": 1618, "y": 838, "w": 132, "h": 108},
        {"x": 2058, "y": 438, "w": 92, "h": 108},
        {"x": 1148, "y": 688, "w": 72, "h": 58},
    ]
    # Bridge deck + both bank approaches (portrait creek axis is mostly E–W at y≈1267).
    bridges_p = {"x": 380, "y": 1180, "w": 320, "h": 140}
    dock_p = {"x": 254, "y": 1422, "w": 110, "h": 190}
    bridges_l = {"x": 1120, "y": 920, "w": 520, "h": 160}
    dock_l = {"x": 798, "y": 1052, "w": 110, "h": 190}
    plazas_p = []
    plazas_l = []
    for key in ("chinese", "english", "math", "treasure"):
        dx, dy = door_xy(key, "portrait", cfg)
        plazas_p.append(plaza_rect(dx, dy, 84, 56))
        dx, dy = door_xy(key, "landscape", cfg)
        plazas_l.append(plaza_rect(dx, dy, 96, 64))
    cfg["walk_overrides_portrait"] = [
        bridges_p,
        dock_p,
        {"x": 300, "y": 1176, "w": 58, "h": 42},
        {"x": 328, "y": 1186, "w": 52, "h": 44},
        {"x": 684, "y": 1268, "w": 48, "h": 40},
        {"x": 838, "y": 698, "w": 72, "h": 40},
        {"x": 538, "y": 968, "w": 88, "h": 52},
        {"x": 468, "y": 1272, "w": 112, "h": 28},
        *plazas_p,
    ]
    cfg["walk_overrides_landscape"] = [
        bridges_l,
        {"x": 672, "y": 1056, "w": 168, "h": 44},
        {"x": 798, "y": 1052, "w": 88, "h": 56},
        {"x": 2026, "y": 558, "w": 52, "h": 42},
        {"x": 1152, "y": 698, "w": 72, "h": 80},
        *plazas_l,
    ]


def main() -> None:
    ART.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(MAP_ZIP) as zf:
        portrait = Image.open(BytesIO(zf.read("map/island-portrait-1080x1920.png"))).convert("RGB")
        landscape = Image.open(BytesIO(zf.read("map/island-landscape-2560x1440.png"))).convert("RGB")

    cfg = json.loads(CFG_PATH.read_text())
    # Merge proposed anchors before audit on pristine art for BEFORE report
    cfg_before = json.loads(Path("/tmp/map_config_before.json").read_text()) if Path("/tmp/map_config_before.json").is_file() else cfg
    issues_before = audit(cfg_before, portrait, landscape)
    report = [
        {"mode": i.mode, "key": i.key, "kind": i.kind, "detail": i.detail, "xy": i.xy}
        for i in issues_before
    ]
    (ART / "v9.19-audit-before.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    annotate(portrait, cfg_before, "portrait", issues_before, "v9.19 BEFORE — portrait").save(
        ART / "v9.19-map-audit-before-portrait.png"
    )
    annotate(landscape, cfg_before, "landscape", issues_before, "v9.19 BEFORE — landscape").save(
        ART / "v9.19-map-audit-before-landscape.png"
    )

    issues = audit(cfg, portrait, landscape)
    # Apply landmark moves
    for mode in ("portrait", "landscape"):
        pw, ph = (1080, 1920) if mode == "portrait" else (2560, 1440)
        for key, pos in LANDMARK_V919[mode].items():
            cfg[f"landmarks_{mode}"][key].update(pos)
            cfg[f"landmarks_{mode}"][key]["x_norm"] = round(pos["x"] / pw, 3)
            cfg[f"landmarks_{mode}"][key]["y_norm"] = round(pos["y"] / ph, 3)

    apply_v919_blocked(cfg)
    cfg["door_points_portrait"] = {
        k: [int(door_xy(k, "portrait", cfg)[0]), int(door_xy(k, "portrait", cfg)[1])]
        for k in ("chinese", "english", "math", "treasure")
    }
    cfg["door_points_landscape"] = {
        k: [int(door_xy(k, "landscape", cfg)[0]), int(door_xy(k, "landscape", cfg)[1])]
        for k in ("chinese", "english", "math", "treasure")
    }

    # v9.21h: do not paint elliptical ground pads (paths/overrides stay in map_config).

    issues_after = audit(cfg, portrait, landscape)
    after_p = annotate(portrait, cfg, "portrait", issues_after, "v9.19 AFTER — portrait")
    after_l = annotate(landscape, cfg, "landscape", issues_after, "v9.19 AFTER — landscape")
    after_p.save(ART / "v9.19-map-audit-after-portrait.png")
    after_l.save(ART / "v9.19-map-audit-after-landscape.png")

    OUT_MAP.mkdir(parents=True, exist_ok=True)
    portrait.save(OUT_MAP / "island-portrait-1080x1920.webp", format="WEBP", quality=84, method=6)
    landscape.save(OUT_MAP / "island-landscape-2560x1440.webp", format="WEBP", quality=84, method=6)

    mw_p, mh_p, mask_p = build_walk_mask(portrait)
    mw_l, mh_l, mask_l = build_walk_mask(landscape)
    (OUT_MAP / "walk-portrait.bin").write_bytes(struct.pack("<II", mw_p, mh_p) + mask_p)
    (OUT_MAP / "walk-landscape.bin").write_bytes(struct.pack("<II", mw_l, mh_l) + mask_l)

    CFG_PATH.write_text(json.dumps(cfg, indent=2) + "\n", encoding="utf-8")
    # sync e2e walk_mask hardcoded rects from cfg
    e2e = ROOT / "e2e" / "walk_mask.mjs"
    text = e2e.read_text()
    for src, dst in (
        ("walk_overrides_portrait", "PORTRAIT_OVERRIDES"),
        ("walk_overrides_landscape", "LANDSCAPE_OVERRIDES"),
        ("walk_blocked_portrait", "PORTRAIT_BLOCKED"),
        ("walk_blocked_landscape", "LANDSCAPE_BLOCKED"),
    ):
        block = json.dumps(cfg[src], indent=2)
        import re

        pat = rf"const {dst} = \[[\s\S]*?\];"
        rep = f"const {dst} = {block};"
        text, n = re.subn(pat, rep, text, count=1)
        if n != 1:
            raise SystemExit(f"failed to patch {dst}")
    e2e.write_text(text)

    print("issues_before", len(issues), "issues_after", len(issues_after))
    print("wrote", CFG_PATH, OUT_MAP)


if __name__ == "__main__":
    main()
