#!/usr/bin/env python3
"""Normalize 4x4 walk sprite sheets: trim, de-speckle, uniform height, baseline align. Output WebP."""

from __future__ import annotations

import json
import sys
from collections import deque
from pathlib import Path

from PIL import Image

FRAME_W = 96
FRAME_H = 128
COLS = 4
ROWS = 4
BASELINE_Y = 124
SPECK_MAX = 12  # px connected component area


def alpha_bbox(im: Image.Image) -> tuple[int, int, int, int] | None:
    if im.mode != "RGBA":
        im = im.convert("RGBA")
    alpha = im.split()[-1]
    bbox = alpha.getbbox()
    return bbox


def remove_specks(im: Image.Image, max_area: int) -> Image.Image:
    if im.mode != "RGBA":
        im = im.convert("RGBA")
    w, h = im.size
    px = im.load()
    alpha = [[px[x, y][3] for x in range(w)] for y in range(h)]
    visited = [[False] * w for _ in range(h)]
    out = im.copy()

    def neighbors(x: int, y: int):
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h:
                yield nx, ny

    for y in range(h):
        for x in range(w):
            if visited[y][x] or alpha[y][x] < 8:
                continue
            q = deque([(x, y)])
            visited[y][x] = True
            comp = [(x, y)]
            while q:
                cx, cy = q.popleft()
                for nx, ny in neighbors(cx, cy):
                    if not visited[ny][nx] and alpha[ny][nx] >= 8:
                        visited[ny][nx] = True
                        q.append((nx, ny))
                        comp.append((nx, ny))
            if len(comp) < max_area:
                for cx, cy in comp:
                    out.putpixel((cx, cy), (0, 0, 0, 0))
    return out


def process_frame(im: Image.Image) -> Image.Image:
    im = remove_specks(im, SPECK_MAX)
    bbox = alpha_bbox(im)
    if not bbox:
        return Image.new("RGBA", (1, 1), (0, 0, 0, 0))
    cropped = im.crop(bbox)
    return cropped


def place_on_canvas(sprite: Image.Image, target_h: int) -> Image.Image:
    """Scale sprite to target_h keeping aspect; bottom-align on BASELINE_Y."""
    if sprite.width == 0 or sprite.height == 0:
        return Image.new("RGBA", (FRAME_W, FRAME_H), (0, 0, 0, 0))
    scale = target_h / sprite.height
    nw = max(1, int(round(sprite.width * scale)))
    nh = max(1, int(round(sprite.height * scale)))
    scaled = sprite.resize((nw, nh), Image.Resampling.NEAREST)
    canvas = Image.new("RGBA", (FRAME_W, FRAME_H), (0, 0, 0, 0))
    x = (FRAME_W - nw) // 2
    y = BASELINE_Y - nh
    canvas.paste(scaled, (x, y), scaled)
    return canvas


def normalize_sheet(sheet_path: Path) -> Image.Image:
    src = Image.open(sheet_path).convert("RGBA")
    sw, sh = src.size
    assert sw == FRAME_W * COLS and sh == FRAME_H * ROWS, f"bad size {sw}x{sh} for {sheet_path}"

    processed: list[list[Image.Image]] = []
    heights: list[int] = []

    for row in range(ROWS):
        row_frames: list[Image.Image] = []
        for col in range(COLS):
            frame = src.crop(
                (
                    col * FRAME_W,
                    row * FRAME_H,
                    (col + 1) * FRAME_W,
                    (row + 1) * FRAME_H,
                )
            )
            trimmed = process_frame(frame)
            if trimmed.width > 0:
                heights.append(trimmed.height)
            row_frames.append(trimmed)
        processed.append(row_frames)

    target_h = max(heights) if heights else FRAME_H - BASELINE_Y

    out = Image.new("RGBA", (FRAME_W * COLS, FRAME_H * ROWS), (0, 0, 0, 0))
    for row in range(ROWS):
        for col in range(COLS):
            placed = place_on_canvas(processed[row][col], target_h)
            out.paste(placed, (col * FRAME_W, row * FRAME_H))

    return out


def main() -> int:
    repo = Path(__file__).resolve().parents[1]
    src_dir = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("/tmp/walk-sprites-v1/walk-sprites-v1")
    out_dir = repo / "static" / "characters"
    manifest_path = src_dir / "manifest.json"
    map_config_path = repo / "src" / "map_config.json"

    if not manifest_path.is_file():
        print(f"missing {manifest_path}", file=sys.stderr)
        return 1

    with manifest_path.open(encoding="utf-8") as f:
        manifest = json.load(f)

    with map_config_path.open(encoding="utf-8") as f:
        map_cfg = json.load(f)

    slug_by_id = {c["id"]: c["slug"] for c in map_cfg.get("characters", [])}

    for ch in manifest["characters"]:
        cid = ch["id"]
        slug = slug_by_id.get(cid, ch.get("slug", cid))
        sheet_name = ch["sheet"]
        sheet_path = src_dir / sheet_name
        if not sheet_path.is_file():
            print(f"skip missing {sheet_path}")
            continue
        normalized = normalize_sheet(sheet_path)
        out_name = f"{cid}-{slug}-walk.webp"
        out_path = out_dir / out_name
        normalized.save(out_path, "WEBP", lossless=True, quality=100, method=6)
        print(f"wrote {out_path.name}")

        for entry in map_cfg["characters"]:
            if entry["id"] == cid:
                entry["walk"] = out_name
                break

    with map_config_path.open("w", encoding="utf-8") as f:
        json.dump(map_cfg, f, ensure_ascii=False, indent=2)
        f.write("\n")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
