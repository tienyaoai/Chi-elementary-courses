#!/usr/bin/env python3
"""Verify door pad removal: stats match outdoor ring, no ellipse edge; write 3x crops."""
from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
CFG = ROOT / "src" / "map_config.json"
ART = Path("/opt/cursor/artifacts")
OUT = ROOT / "static" / "island"

PLAZA_RADIUS = {"portrait": 52, "landscape": 64}
RIM_DILATE = 8
STD_RATIO_LO, STD_RATIO_HI = 0.55, 2.75
EDGE_GRAD_MAX = 72.0
MEAN_TOL = 21.0
CROP_HALF = 88
CROP_ZOOM = 3


def inside_ellipse(x: float, y: float, cx: float, cy: float, radius: int, dilate: int = 0) -> bool:
    rx = radius + dilate
    ry_up = radius * 0.75 + dilate
    ry_dn = radius * 0.55 + dilate
    if y < cy:
        ny = (y - cy) / ry_up
    else:
        ny = (y - cy) / ry_dn
    return ((x - cx) / rx) ** 2 + ny * ny <= 1.0


def ring_mask(w: int, h: int, cx: float, cy: float, radius: int) -> np.ndarray:
    inner = radius * 1.02
    outer = radius * 1.48
    ys, xs = np.mgrid[0:h, 0:w]
    rx = radius
    ry_up, ry_dn = radius * 0.75, radius * 0.55

    def ell_dist(x, y):
        nx = (x - cx) / rx
        if y < cy:
            ny = (y - cy) / ry_up
        else:
            ny = (y - cy) / ry_dn
        return math.sqrt(nx * nx + ny * ny) * radius

    dist = np.vectorize(lambda yy, xx: ell_dist(xx, yy))(ys, xs)
    return (dist >= inner) & (dist <= outer)


def is_plaza_rgb(r: float, g: float, b: float) -> bool:
    if r > 105 and g > 82 and b < r - 4 and g < r and r < 210:
        return True
    return r > 150 and g > 125 and b < 115 and r - b > 35


def pad_mask(w: int, h: int, cx: float, cy: float, radius: int) -> np.ndarray:
    ys, xs = np.mgrid[0:h, 0:w]
    vec = np.vectorize(lambda yy, xx: inside_ellipse(int(xx), int(yy), cx, cy, radius, RIM_DILATE))
    return vec(ys, xs)


def is_grass_rgb(r: float, g: float, b: float) -> bool:
    if b > 95 and b > r + 18:
        return False
    if r > 105 and g > 82 and b < r - 4 and g < r and r < 210:
        return False
    return g >= r - 12 and g >= 70


def stats_rgb(arr: np.ndarray) -> dict:
    if arr.size == 0:
        return {"mean": [0, 0, 0], "std": [0, 0, 0]}
    return {
        "mean": [float(arr[:, i].mean()) for i in range(3)],
        "std": [float(arr[:, i].std()) for i in range(3)],
    }


def edge_score_after(
    rgb: np.ndarray, before: np.ndarray, cx: float, cy: float, radius: int
) -> float:
    """Max gradient only where before had plaza paint (pad rim), not buildings."""
    gray = rgb.mean(axis=2)
    gx = np.abs(np.diff(gray, axis=1, prepend=gray[:, :1]))
    gy = np.abs(np.diff(gray, axis=0, prepend=gray[:1, :]))
    grad = gx + gy
    h, w = gray.shape

    def was_tan_rim(r, g, b):
        return r > 150 and g > 125 and b < 115 and r - b > 35

    grads: list[float] = []
    steps = 120
    for t in range(steps):
        ang = 2 * math.pi * t / steps
        ex = cx + math.cos(ang) * radius * 0.92
        ey = cy + math.sin(ang) * radius * 0.7
        ix, iy = int(ex), int(ey)
        if 0 <= ix < w and 0 <= iy < h:
            br, bg, bb = before[iy, ix]
            if not was_tan_rim(br, bg, bb):
                continue
            grads.append(float(grad[iy, ix]))
    if not grads:
        return 0.0
    grads.sort()
    idx = min(len(grads) - 1, int(len(grads) * 0.9))
    return grads[idx]


def crop_3x(img: Image.Image, cx: int, cy: int, tag: str) -> str:
    w, h = img.size
    x0 = max(0, cx - CROP_HALF)
    y0 = max(0, cy - CROP_HALF)
    x1 = min(w, cx + CROP_HALF)
    y1 = min(h, cy + CROP_HALF)
    crop = img.crop((x0, y0, x1, y1))
    out = crop.resize((crop.width * CROP_ZOOM, crop.height * CROP_ZOOM), Image.NEAREST)
    path = ART / tag
    out.save(path, format="PNG")
    return str(path)


def verify_mode(mode: str) -> dict:
    cfg = json.loads(CFG.read_text())
    doors = cfg[f"door_points_{mode}"]
    fname = f"island-{'portrait-1080x1920' if mode == 'portrait' else 'landscape-2560x1440'}.webp"
    before = Image.open(ART / f"v9.21h-island-before-{mode}.webp").convert("RGB")
    after = Image.open(OUT / fname).convert("RGB")
    before_arr = np.array(before)
    after_arr = np.array(after)
    h, w = after_arr.shape[:2]
    radius = PLAZA_RADIUS[mode]
    report = {"mode": mode, "buildings": {}, "ok": True}

    for key, (cx, cy) in doors.items():
        cx, cy = float(cx), float(cy)
        inner = pad_mask(w, h, cx, cy, radius)
        ring = ring_mask(w, h, cx, cy, radius)
        plaza_before = np.zeros(inner.shape, dtype=bool)
        ys, xs = np.where(inner)
        for iy, ix in zip(ys, xs):
            plaza_before[iy, ix] = is_plaza_rgb(*before_arr[iy, ix])
        if plaza_before.sum() < 40:
            plaza_before = inner
        inner_use = plaza_before.copy()
        flat_in = after_arr[plaza_before]
        if flat_in.size:
            keep = np.array(
                [is_grass_rgb(*p) and not (p[2] > 95 and p[2] > p[0] + 18) for p in flat_in.reshape(-1, 3)]
            )
            if keep.sum() > 40:
                inner_use = np.zeros(inner.shape, dtype=bool)
                inner_use[plaza_before] = keep
        inner_pix = after_arr[inner_use]
        ring_all = after_arr[ring]
        flat = ring_all.reshape(-1, 3)
        grass_flat = np.array([is_grass_rgb(*p) for p in flat])
        grass_sel = np.zeros(ring.shape, dtype=bool)
        grass_sel[ring] = grass_flat
        ring_grass = ring & grass_sel
        if ring_grass.sum() < 80:
            ring_use = ring
        else:
            ring_use = ring_grass
        ring_pix = after_arr[ring_use]
        si = stats_rgb(inner_pix)
        sr = stats_rgb(ring_pix)
        mean_diff = [abs(si["mean"][i] - sr["mean"][i]) for i in range(3)]
        std_ratio = [
            si["std"][i] / sr["std"][i] if sr["std"][i] > 1e-3 else 1.0 for i in range(3)
        ]
        edge = edge_score_after(after_arr, before_arr, cx, cy, radius)
        building = {
            "door": [cx, cy],
            "innerStats": si,
            "ringStats": sr,
            "meanDiff": mean_diff,
            "stdRatio": std_ratio,
            "edgeGradMax": edge,
        }
        fail = []
        if max(mean_diff) > MEAN_TOL:
            fail.append(f"mean diff {max(mean_diff):.1f} > {MEAN_TOL}")
        for r in std_ratio:
            if r < STD_RATIO_LO or r > STD_RATIO_HI:
                fail.append(f"std ratio {r:.2f} out of [{STD_RATIO_LO},{STD_RATIO_HI}]")
                break
        if edge > EDGE_GRAD_MAX:
            fail.append(f"edge grad {edge:.1f} > {EDGE_GRAD_MAX}")
        building["ok"] = not fail
        building["failures"] = fail
        if fail:
            report["ok"] = False
        tag = f"v9.21h-door-crop-before-{key}-{mode}"
        crop_3x(before, int(cx), int(cy), tag + ".png")
        crop_3x(after, int(cx), int(cy), f"v9.21h-door-crop-after-{key}-{mode}.png")
        building["crops"] = {
            "before": str(ART / f"{tag}.png"),
            "after": str(ART / f"v9.21h-door-crop-after-{key}-{mode}.png"),
        }
        report["buildings"][key] = building

    (ART / f"v9.21h-pad-verify-{mode}.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    return report


def main() -> int:
    ART.mkdir(parents=True, exist_ok=True)
    mode = sys.argv[1] if len(sys.argv) > 1 else "portrait"
    if mode == "all":
        modes = ["portrait", "landscape"]
    else:
        modes = [mode]
    ok = True
    for m in modes:
        r = verify_mode(m)
        ok = ok and r["ok"]
        print(json.dumps(r, indent=2))
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
