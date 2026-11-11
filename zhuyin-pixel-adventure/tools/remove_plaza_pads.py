#!/usr/bin/env python3
"""
DEPRECATED — user island art is source of truth (v921h-art.zip). Do not run in CI/deliver.

Erase / touch up baked door plaza pads on v9.21g island art.

Offset-clones grass and path from outside the pad (lossless WebP). Touch-up mode
fixes specific doors on the current map without resetting approved landscape areas.
"""
from __future__ import annotations

import json
import math
import shutil
import subprocess
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "static" / "island"
DIST = ROOT / "dist" / "island"
CFG = ROOT / "src" / "map_config.json"
ART = Path("/opt/cursor/artifacts")
HOTFIX = "origin/cursor/v921g-hotfix-autorepeat-0459"

PLAZA_RADIUS = {"portrait": 52, "landscape": 64}
RIM_DILATE = 10
PATH_HALF_W = 16
SOURCE_MIN_N = 1.2

# Stronger erase for doors that still show rim / stray path pixels in review.
DOOR_PARAMS: dict[tuple[str, str], dict] = {
    ("portrait", "math"): {
        "paint_inner_norm": 1.12,
        "plaza_rim": 18,
        "path_half_w": 13,
        "cleanup_norm": 1.2,
        "geo_dilate": 16,
        "full_grass_geo": True,
        "scrub_passes": 4,
        "scrub_path_half_w": 8,
        "halo_norm": 1.24,
        "paint_outer_norm": 1.4,
    },
    ("portrait", "english"): {
        "paint_inner_norm": 1.12,
        "plaza_rim": 18,
        "path_half_w": 13,
        "cleanup_norm": 1.2,
        "geo_dilate": 16,
        "full_grass_geo": True,
        "scrub_passes": 4,
        "scrub_path_half_w": 8,
        "halo_norm": 1.24,
        "paint_outer_norm": 1.4,
    },
    ("landscape", "treasure"): {
        "paint_inner_norm": 1.04,
        "plaza_rim": 12,
        "path_half_w": 16,
        "cleanup_norm": 1.06,
        "geo_dilate": 10,
        "scrub_passes": 1,
    },
}


def is_water(r: int, g: int, b: int) -> bool:
    if b > 95 and b > r + 18 and b > g + 8:
        return True
    if b > 60 and r < 80 and g < 120 and b > r + 30:
        return True
    return False


def is_wood(r: int, g: int, b: int) -> bool:
    return 70 < r < 165 and 45 < g < 115 and b < 95 and r > g


def is_pathish(r: int, g: int, b: int) -> bool:
    if is_water(r, g, b):
        return False
    if r > 105 and g > 82 and b < r - 4 and g < r and r < 210:
        return True
    return False


def is_grass(r: int, g: int, b: int) -> bool:
    if is_water(r, g, b) or is_pathish(r, g, b) or is_wood(r, g, b):
        return False
    return g >= r - 12 and g >= 70


def is_tan_rim(r: int, g: int, b: int) -> bool:
    return r > 150 and g > 125 and b < 115 and r - b > 35


def is_warm_stray(r: int, g: int, b: int) -> bool:
    return r > 112 and g > 88 and b < 100 and r > g + 6 and g > b + 8


def is_plaza_paint(r: int, g: int, b: int) -> bool:
    if is_pathish(r, g, b):
        return True
    return is_tan_rim(r, g, b)


def inside_ellipse(x: int, y: int, cx: float, cy: float, radius: int, dilate: int = 0) -> bool:
    rx = radius + dilate
    ry_up = radius * 0.75 + dilate
    ry_dn = radius * 0.55 + dilate
    if rx <= 0 or ry_up <= 0 or ry_dn <= 0:
        return False
    nx = (x - cx) / rx
    if y < cy:
        ny = (y - cy) / ry_up
    else:
        ny = (y - cy) / ry_dn
    return nx * nx + ny * ny <= 1.0


def ellipse_norm(x: float, y: float, cx: float, cy: float, radius: int, dilate: int = RIM_DILATE) -> float:
    rx = radius + dilate
    ry_up = radius * 0.75 + dilate
    ry_dn = radius * 0.55 + dilate
    nx = (x - cx) / rx
    if y < cy:
        ny = (y - cy) / ry_up
    else:
        ny = (y - cy) / ry_dn
    return math.sqrt(nx * nx + ny * ny)


def build_geo_mask(w: int, h: int, cx: float, cy: float, radius: int, geo_dilate: int) -> list[list[bool]]:
    mask = [[False] * w for _ in range(h)]
    x0 = max(0, int(cx - radius - geo_dilate - 4))
    x1 = min(w - 1, int(cx + radius + geo_dilate + 4))
    y0 = max(0, int(cy - radius * 0.85 - geo_dilate - 4))
    y1 = min(h - 1, int(cy + radius * 0.65 + geo_dilate + 4))
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            if inside_ellipse(x, y, cx, cy, radius, geo_dilate):
                mask[y][x] = True
    return mask


def ring_mean_g(px, w: int, h: int, cx: float, cy: float, radius: int) -> float:
    acc: list[int] = []
    for deg in range(0, 360, 8):
        rad = math.radians(deg)
        tx = int(cx + math.cos(rad) * radius * 1.28)
        ty = int(cy + math.sin(rad) * radius * 0.95)
        if 0 <= tx < w and 0 <= ty < h and is_grass(*px[tx, ty]):
            acc.append(px[tx, ty][1])
    return sum(acc) / len(acc) if acc else 140.0


def score_shift(
    px, w: int, h: int, mask, cx: float, cy: float, radius: int, ox: int, oy: int, target_g: float
) -> float:
    score = 0.0
    n = 0
    for deg in range(0, 360, 12):
        rad = math.radians(deg)
        tx = int(cx + math.cos(rad) * radius * 0.55)
        ty = int(cy + math.sin(rad) * radius * 0.42)
        if not (0 <= tx < w and 0 <= ty < h) or not mask[ty][tx]:
            continue
        sx, sy = tx + ox, ty + oy
        if not (0 <= sx < w and 0 <= sy < h) or mask[sy][sx]:
            continue
        if ellipse_norm(sx, sy, cx, cy, radius) < SOURCE_MIN_N:
            continue
        col = px[sx, sy]
        if is_water(*col) or is_wood(*col) or is_plaza_paint(*col):
            continue
        if is_grass(*col):
            score += 4.0 - abs(col[1] - target_g) * 0.04
            n += 1
        elif is_pathish(*col):
            score += 0.5
    return score if n >= 6 else -1e9


def align_shift(ox: int, oy: int) -> tuple[int, int]:
    ax = int(round(ox / 8)) * 8
    ay = int(round(oy / 8)) * 8
    if ax == 0 and ay == 0:
        ax = 8 if ox >= 0 else -8
    return ax, ay


def best_shift(px, w: int, h: int, mask, cx: float, cy: float, radius: int) -> tuple[int, int]:
    target_g = ring_mean_g(px, w, h, cx, cy, radius)
    span = int(radius * 1.45)
    best = (int(radius * 1.32), 0)
    best_sc = -1e9
    for ox in range(-span, span + 1, 4):
        for oy in range(-span, span + 1, 4):
            if ox * ox + oy * oy < (radius * 0.85) ** 2:
                continue
            sc = score_shift(px, w, h, mask, cx, cy, radius, ox, oy, target_g)
            if sc > best_sc:
                best_sc = sc
                best = (ox, oy)
    return align_shift(best[0], best[1])


def dist_to_segment(px: int, py: int, x1: int, y1: int, x2: int, y2: int) -> float:
    dx, dy = x2 - x1, y2 - y1
    if dx == dy == 0:
        return math.hypot(px - x1, py - y1)
    t = max(0, min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)))
    qx, qy = x1 + t * dx, y1 + t * dy
    return math.hypot(px - qx, py - qy)


def path_axis(px, mask, w: int, h: int, cx: float, cy: float, radius: int) -> tuple[int, int, int, int] | None:
    pts = []
    r = int(radius * 2.4)
    for y in range(max(0, int(cy) - r), min(h, int(cy) + r)):
        for x in range(max(0, int(cx) - r), min(w, int(cx) + r)):
            if mask[y][x]:
                continue
            if is_pathish(*px[x, y]):
                pts.append((x, y))
    if len(pts) < 6:
        return None
    pts.sort(key=lambda p: (p[1] - cy) ** 2 + (p[0] - cx) ** 2, reverse=True)
    far = pts[0]
    return far[0], far[1], int(cx), int(cy)


def on_path_corridor(x: int, y: int, path_ln, path_half_w: float) -> bool:
    return bool(path_ln and dist_to_segment(x, y, *path_ln) <= path_half_w)


def copy_shifted(
    px, w: int, h: int, mask, cx: float, cy: float, radius: int, x: int, y: int, ox: int, oy: int, want_path: bool
) -> tuple[int, int, int] | None:
    trials = (
        (ox, oy),
        (ox + 1, oy),
        (ox, oy + 1),
        (ox - 1, oy + 1),
        (-ox, -oy),
        (ox + 37, oy - 11),
        (ox - 19, oy + 31),
        (ox + 48, oy + 8),
        (ox - 32, oy - 24),
    )
    for tox, toy in trials:
        sx, sy = x + tox, y + toy
        if not (0 <= sx < w and 0 <= sy < h) or mask[sy][sx]:
            continue
        if ellipse_norm(sx, sy, cx, cy, radius) < SOURCE_MIN_N:
            continue
        col = px[sx, sy]
        if is_water(*col) or is_wood(*col):
            continue
        if want_path:
            if is_pathish(*col):
                return col
        elif is_grass(*col):
            return col
    return None


def build_paint_mask(
    bpx,
    geo_mask,
    w: int,
    h: int,
    cx: float,
    cy: float,
    radius: int,
    paint_inner_norm: float,
    plaza_rim: int,
    full_grass_geo: bool = False,
    paint_outer_norm: float = 1.28,
) -> list[list[bool]]:
    paint = [[False] * w for _ in range(h)]
    plaza: list[tuple[int, int]] = []
    for y in range(h):
        for x in range(w):
            br, bg, bb = bpx[x, y]
            if is_water(br, bg, bb) or is_wood(br, bg, bb):
                continue
            norm = ellipse_norm(x, y, cx, cy, radius, 0)
            if full_grass_geo:
                if norm <= paint_outer_norm:
                    paint[y][x] = True
                    if is_plaza_paint(br, bg, bb):
                        plaza.append((x, y))
                continue
            if not geo_mask[y][x]:
                continue
            if is_plaza_paint(br, bg, bb):
                paint[y][x] = True
                plaza.append((x, y))
            elif ellipse_norm(x, y, cx, cy, radius, 0) <= paint_inner_norm:
                paint[y][x] = True
    for x, y in plaza:
        for dy in range(-plaza_rim, plaza_rim + 1):
            for dx in range(-plaza_rim, plaza_rim + 1):
                if dx * dx + dy * dy > plaza_rim * plaza_rim:
                    continue
                nx, ny = x + dx, y + dy
                if not (0 <= nx < w and 0 <= ny < h) or not geo_mask[ny][nx]:
                    continue
                br, bg, bb = bpx[nx, ny]
                if is_water(br, bg, bb) or is_wood(br, bg, bb):
                    continue
                paint[ny][nx] = True
    return paint


def scrub_residuals(
    img: Image.Image,
    before: Image.Image,
    cx: float,
    cy: float,
    radius: int,
    geo_mask,
    ox: int,
    oy: int,
    path_ln,
    path_half_w: float,
    cleanup_norm: float,
    halo_norm: float = 0.0,
    scrub_path_half_w: float | None = None,
) -> int:
    path_hw = scrub_path_half_w if scrub_path_half_w is not None else path_half_w
    w, h = img.size
    px = img.load()
    bpx = before.load()
    changed = 0
    for y in range(h):
        for x in range(w):
            norm = ellipse_norm(x, y, cx, cy, radius, 0)
            in_halo = halo_norm > 0 and norm <= halo_norm
            if not geo_mask[y][x] and not in_halo:
                continue
            if geo_mask[y][x] and norm > cleanup_norm and not in_halo:
                continue
            if in_halo and norm > halo_norm:
                continue
            br, bg, bb = bpx[x, y]
            if is_water(br, bg, bb) or is_wood(br, bg, bb):
                continue
            cr, cg, cb = px[x, y]
            on_path = on_path_corridor(x, y, path_ln, path_hw)
            stray_path = is_pathish(cr, cg, cb) and not (
                on_path and (is_pathish(br, bg, bb) or is_tan_rim(br, bg, bb))
            )
            stray_plaza = is_plaza_paint(cr, cg, cb) or is_tan_rim(cr, cg, cb)
            center_stray = norm < 1.05 and (
                is_pathish(cr, cg, cb) or is_tan_rim(cr, cg, cb) or is_warm_stray(cr, cg, cb)
            )
            rim_disc = (
                ellipse_norm(x, y, cx, cy, radius, 0) > 0.92
                and ellipse_norm(x, y, cx, cy, radius, 0) <= cleanup_norm
                and (is_plaza_paint(br, bg, bb) or is_tan_rim(br, bg, bb))
            )
            if not (stray_path or stray_plaza or rim_disc or center_stray):
                continue
            want_path = on_path and (is_pathish(br, bg, bb) or is_tan_rim(br, bg, bb))
            col = copy_shifted(px, w, h, geo_mask, cx, cy, radius, x, y, ox, oy, want_path)
            if col is None and want_path:
                col = copy_shifted(px, w, h, geo_mask, cx, cy, radius, x, y, ox, oy, False)
            if col is None:
                continue
            px[x, y] = col
            changed += 1
    return changed


def remove_pad_at(
    img: Image.Image,
    before: Image.Image,
    cx: float,
    cy: float,
    radius: int,
    *,
    paint_inner_norm: float = 1.03,
    plaza_rim: int = 10,
    path_half_w: float = PATH_HALF_W,
    cleanup_norm: float = 1.1,
    geo_dilate: int = RIM_DILATE,
    scrub_passes: int = 2,
    full_grass_geo: bool = False,
    scrub_path_half_w: float | None = None,
    halo_norm: float = 0.0,
    paint_outer_norm: float = 1.28,
) -> int:
    w, h = img.size
    px = img.load()
    bpx = before.load()
    geo_mask = build_geo_mask(w, h, cx, cy, radius, geo_dilate)
    paint_mask = build_paint_mask(
        bpx,
        geo_mask,
        w,
        h,
        cx,
        cy,
        radius,
        paint_inner_norm,
        plaza_rim,
        full_grass_geo,
        paint_outer_norm,
    )
    ox, oy = best_shift(px, w, h, geo_mask, cx, cy, radius)
    path_ln = path_axis(px, geo_mask, w, h, cx, cy, radius)

    changed = 0
    for y in range(h):
        for x in range(w):
            if not paint_mask[y][x]:
                continue
            want_path = False
            if on_path_corridor(x, y, path_ln, path_half_w):
                if is_pathish(*bpx[x, y]) or is_tan_rim(*bpx[x, y]):
                    want_path = True
            col = copy_shifted(px, w, h, geo_mask, cx, cy, radius, x, y, ox, oy, want_path)
            if col is None and want_path:
                col = copy_shifted(px, w, h, geo_mask, cx, cy, radius, x, y, ox, oy, False)
            if col is None:
                continue
            px[x, y] = col
            changed += 1
    for _ in range(scrub_passes):
        changed += scrub_residuals(
            img,
            before,
            cx,
            cy,
            radius,
            geo_mask,
            ox,
            oy,
            path_ln,
            path_half_w,
            cleanup_norm,
            halo_norm,
            scrub_path_half_w,
        )
    return changed


def door_params(mode: str, key: str) -> dict:
    base = {
        "paint_inner_norm": 1.03,
        "plaza_rim": 10,
        "path_half_w": PATH_HALF_W,
        "cleanup_norm": 1.1,
        "geo_dilate": RIM_DILATE,
        "scrub_passes": 2,
        "full_grass_geo": False,
        "scrub_path_half_w": None,
        "halo_norm": 0.0,
        "paint_outer_norm": 1.28,
    }
    base.update(DOOR_PARAMS.get((mode, key), {}))
    return base


def restore_hotfix_portrait() -> None:
    rel = "zhuyin-pixel-adventure/static/island/island-portrait-1080x1920.webp"
    data = subprocess.check_output(["git", "-C", "/workspace", "show", f"{HOTFIX}:{rel}"])
    (OUT / "island-portrait-1080x1920.webp").write_bytes(data)


def save_lossless_webp(img: Image.Image, path: Path) -> None:
    img.save(path, format="WEBP", lossless=True, method=6)


def touch_doors(mode: str, fname: str, doors: dict, keys: list[str], reset_from_hotfix: bool = False) -> None:
    if reset_from_hotfix and mode == "portrait":
        restore_hotfix_portrait()
    before_path = ART / f"v9.21h-island-before-{mode}.webp"
    src = OUT / fname
    shutil.copy2(src, before_path)
    before = Image.open(before_path).convert("RGB")
    img = Image.open(src).convert("RGB")
    radius = PLAZA_RADIUS[mode]
    log = []
    for key in keys:
        if key not in doors:
            continue
        dx, dy = doors[key]
        kw = door_params(mode, key)
        n = remove_pad_at(img, before, float(dx), float(dy), radius, **kw)
        log.append({"building": key, "door": [dx, dy], "pixels": n, "params": kw})
    save_lossless_webp(img, src)
    shutil.copy2(src, DIST / fname)
    (ART / f"v9.21h-pad-erase-{mode}-touch-log.json").write_text(json.dumps(log, indent=2))


def full_erase_all(mode: str, fname: str, doors: dict) -> None:
    """Full pad erase from hotfix source (all four doors)."""
    if mode == "portrait":
        restore_hotfix_portrait()
    else:
        rel = f"zhuyin-pixel-adventure/static/island/{fname}"
        data = subprocess.check_output(["git", "-C", "/workspace", "show", f"{HOTFIX}:{rel}"])
        (OUT / fname).write_bytes(data)
    before_path = ART / f"v9.21h-island-before-{mode}.webp"
    shutil.copy2(OUT / fname, before_path)
    before = Image.open(before_path).convert("RGB")
    img = before.copy()
    radius = PLAZA_RADIUS[mode]
    log = []
    for key, (dx, dy) in doors.items():
        kw = door_params(mode, key)
        n = remove_pad_at(img, before, float(dx), float(dy), radius, **kw)
        log.append({"building": key, "door": [dx, dy], "pixels": n, "params": kw})
    save_lossless_webp(img, OUT / fname)
    shutil.copy2(OUT / fname, DIST / fname)
    (ART / f"v9.21h-pad-erase-{mode}-log.json").write_text(json.dumps(log, indent=2))


def main() -> int:
    ART.mkdir(parents=True, exist_ok=True)
    DIST.mkdir(parents=True, exist_ok=True)
    cfg = json.loads(CFG.read_text())
    full_only = "--full" in sys.argv
    # Default: rebuild portrait from hotfix; touch only treasure on approved landscape.
    full_erase_all("portrait", "island-portrait-1080x1920.webp", cfg["door_points_portrait"])
    if full_only:
        full_erase_all("landscape", "island-landscape-2560x1440.webp", cfg["door_points_landscape"])
    else:
        touch_doors(
            "landscape",
            "island-landscape-2560x1440.webp",
            cfg["door_points_landscape"],
            ["treasure"],
            reset_from_hotfix=False,
        )

    subprocess.check_call([sys.executable, str(ROOT / "tools" / "regen_walk_masks.py")])
    r = subprocess.run(
        [sys.executable, str(ROOT / "tools" / "verify_pad_erase.py"), "all"],
        cwd=str(ROOT),
    )
    subprocess.check_call([sys.executable, str(ROOT / "tools" / "export_island_artifacts.py")])
    portrait_ok = json.loads((ART / "v9.21h-pad-verify-portrait.json").read_text())["ok"]
    landscape_report = json.loads((ART / "v9.21h-pad-verify-landscape.json").read_text())
    landscape_ok = all(
        landscape_report["buildings"][k]["ok"] for k in ("english", "math", "treasure")
    )
    return 0 if portrait_ok and landscape_ok else r.returncode


if __name__ == "__main__":
    raise SystemExit(main())
