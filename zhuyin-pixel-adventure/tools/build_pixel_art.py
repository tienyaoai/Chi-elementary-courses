#!/usr/bin/env python3
"""Build 32x32 pixel art catalog from grade1-chinese.json image descriptions."""
from __future__ import annotations

import json
import math
import textwrap
from pathlib import Path
from typing import Callable

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
JSON_PATH = ROOT / "static/data/grade1-chinese.json"
OUT_RS = ROOT / "src/pixel_art_catalog.rs"
GALLERY_PATH = Path("/opt/cursor/artifacts/learning-adventure-pixel-art-gallery-v6.png")
UNCERTAIN_PATH = Path("/opt/cursor/artifacts/pixel-art-uncertain-v6.txt")

OUTLINE = 1
OUTLINE_HEX = "#1a1a2e"


class Grid:
    __slots__ = ("data",)

    def __init__(self) -> None:
        self.data = [0] * 1024

    def set(self, x: int, y: int, c: int) -> None:
        if 0 <= x < 32 and 0 <= y < 32:
            self.data[y * 32 + x] = c

    def get(self, x: int, y: int) -> int:
        return self.data[y * 32 + x]

    def fill_rect(self, x: int, y: int, w: int, h: int, c: int) -> None:
        for dy in range(h):
            for dx in range(w):
                self.set(x + dx, y + dy, c)

    def box(self, x: int, y: int, w: int, h: int, fill: int) -> None:
        self.fill_rect(x, y, w, h, OUTLINE)
        if w > 2 and h > 2:
            self.fill_rect(x + 1, y + 1, w - 2, h - 2, fill)

    def circle(self, cx: int, cy: int, r: int, fill: int) -> None:
        for y in range(cy - r - 1, cy + r + 2):
            for x in range(cx - r - 1, cx + r + 2):
                d2 = (x - cx) ** 2 + (y - cy) ** 2
                if (r - 1) ** 2 <= d2 <= (r + 1) ** 2:
                    self.set(x, y, OUTLINE)
                elif d2 <= (r - 1) ** 2:
                    self.set(x, y, fill)

    def ellipse(self, cx: int, cy: int, rx: int, ry: int, fill: int) -> None:
        for y in range(cy - ry - 1, cy + ry + 2):
            for x in range(cx - rx - 1, cx + rx + 2):
                if not rx or not ry:
                    continue
                d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2
                if 0.90 <= d <= 1.10:
                    self.set(x, y, OUTLINE)
                elif d < 0.90:
                    self.set(x, y, fill)

    def tri(self, cx: int, top: int, w: int, h: int, fill: int) -> None:
        for row in range(h):
            half = max(1, (w * (h - row - 1) + h - 1) // h)
            self.fill_rect(cx - half, top + row, half * 2 + 1, 1, fill)
        for row in range(h):
            half = max(1, (w * (h - row - 1) + h - 1) // h)
            for x in (cx - half, cx + half):
                self.set(x, top + row, OUTLINE)
        self.fill_rect(cx - w // 2, top + h - 1, w + 1, 1, OUTLINE)

    def rays(self, cx: int, cy: int, n: int, dist: int, c: int) -> None:
        for i in range(n):
            a = math.pi * 2 * i / n
            x = int(cx + math.cos(a) * dist)
            y = int(cy + math.sin(a) * dist)
            self.fill_rect(x - 1, y - 1, 2, 2, c)

    def stamp_scaled(self, ox: int, oy: int, ink: "Grid", num: int, den: int) -> None:
        for y in range(32):
            for x in range(32):
                c = ink.get(x, y)
                if not c:
                    continue
                nx, ny = ox + x * num // den, oy + y * num // den
                if 0 <= nx < 32 and 0 <= ny < 32:
                    self.set(nx, ny, c)

    def coverage(self) -> float:
        nz = [i for i, v in enumerate(self.data) if v]
        if not nz:
            return 0.0
        xs = [i % 32 for i in nz]
        ys = [i // 32 for i in nz]
        area = (max(xs) - min(xs) + 1) * (max(ys) - min(ys) + 1)
        return len(nz) / area

    def bounds(self) -> tuple[int, int, int, int] | None:
        nz = [(i % 32, i // 32) for i, v in enumerate(self.data) if v]
        if not nz:
            return None
        xs = [p[0] for p in nz]
        ys = [p[1] for p in nz]
        return min(xs), min(ys), max(xs), max(ys)


Builder = Callable[[], tuple[list[str], Grid]]

BUILDERS: dict[str, Builder] = {}

def build_86a363() -> tuple[list[str], Grid]:
    g = Grid()
    # 一件藍色上衣
    g.box(10, 10, 12, 16, 2)
    g.fill_rect(8, 10, 4, 5, 2)
    g.fill_rect(20, 10, 4, 5, 2)
    g.fill_rect(12, 8, 8, 3, 3)
    return ['#3b82f6', '#60a5fa', '#2563eb'], g

BUILDERS['一件藍色上衣'] = build_86a363

def build_73769a() -> tuple[list[str], Grid]:
    g = Grid()
    # 一位微笑的媽媽
    g.circle(16, 10, 6, 2)
    g.fill_rect(10, 10, 12, 8, 3)
    g.box(10, 14, 12, 12, 3)
    g.circle(13, 9, 1, OUTLINE)
    g.circle(19, 9, 1, OUTLINE)
    g.fill_rect(14, 12, 4, 2, 4)
    return ['#fecaca', '#ec4899', '#92400e'], g

BUILDERS['一位微笑的媽媽'] = build_73769a

def build_6f1ef0() -> tuple[list[str], Grid]:
    g = Grid()
    # 一個圓圓的鼻子
    g.ellipse(16, 17, 7, 9, 2)
    g.ellipse(16, 19, 3, 4, 3)
    g.circle(14, 15, 1, OUTLINE)
    g.circle(18, 15, 1, OUTLINE)
    return ['#fecaca', '#f9a8d4', '#fda4af'], g

BUILDERS['一個圓圓的鼻子'] = build_6f1ef0

def build_16a343() -> tuple[list[str], Grid]:
    g = Grid()
    # 一個小朋友在跑步
    g.circle(16, 8, 5, 2)
    g.box(12, 13, 8, 10, 3)
    g.fill_rect(9, 17, 4, 8, 4)
    g.fill_rect(19, 15, 4, 9, 4)
    g.fill_rect(11, 23, 6, 3, 4)
    return ['#fecaca', '#60a5fa', '#1e293b'], g

BUILDERS['一個小朋友在跑步'] = build_16a343

def build_2154da() -> tuple[list[str], Grid]:
    g = Grid()
    # 一個小朋友拿牙刷刷牙
    g.circle(14, 8, 5, 2)
    g.box(10, 13, 8, 9, 3)
    g.fill_rect(18, 12, 10, 4, 4)
    g.fill_rect(26, 10, 3, 10, 2)
    g.fill_rect(12, 22, 3, 6, OUTLINE)
    return ['#fecaca', '#60a5fa', '#22c55e'], g

BUILDERS['一個小朋友拿牙刷刷牙'] = build_2154da

def build_8c92ee() -> tuple[list[str], Grid]:
    g = Grid()
    # 一個彎彎的月亮
    g.circle(16, 14, 9, 2)
    g.fill_rect(20, 5, 8, 18, 3)
    return ['#fef3c7', '#fde68a', '#ffffff'], g

BUILDERS['一個彎彎的月亮'] = build_8c92ee

def build_fb093b() -> tuple[list[str], Grid]:
    g = Grid()
    # 一個籃子
    g.box(8, 12, 16, 12, 2)
    g.fill_rect(10, 8, 12, 4, 3)
    g.fill_rect(9, 11, 2, 2, OUTLINE)
    g.fill_rect(21, 11, 2, 2, OUTLINE)
    for x in range(10, 22, 3):
        g.fill_rect(x, 14, 1, 8, 4)
    return ['#d4a574', '#92400e', '#b8956a'], g

BUILDERS['一個籃子'] = build_fb093b

def build_bf6bb9() -> tuple[list[str], Grid]:
    g = Grid()
    # 一個紅太陽
    g.circle(16, 16, 8, 2)
    g.rays(16, 16, 8, 12, 3)
    return ['#ef4444', '#f87171', '#fde047'], g

BUILDERS['一個紅太陽'] = build_bf6bb9

def build_dfb7e3() -> tuple[list[str], Grid]:
    g = Grid()
    # 一個紅紅的太陽
    g.circle(16, 16, 10, 2)
    g.circle(16, 16, 6, 3)
    g.rays(16, 16, 12, 14, 4)
    return ['#dc2626', '#ef4444', '#fbbf24'], g

BUILDERS['一個紅紅的太陽'] = build_dfb7e3

def build_15c0af() -> tuple[list[str], Grid]:
    g = Grid()
    # 一個紙箱子
    g.box(7, 10, 18, 14, 2)
    g.fill_rect(8, 11, 16, 3, 3)
    g.fill_rect(14, 8, 4, 4, 3)
    g.fill_rect(15, 16, 2, 6, 4)
    return ['#d4a574', '#b8956a', '#78716c'], g

BUILDERS['一個紙箱子'] = build_15c0af

def build_d3ae1d() -> tuple[list[str], Grid]:
    g = Grid()
    # 一個背帶書包
    g.box(10, 12, 12, 14, 2)
    g.fill_rect(12, 10, 8, 3, 3)
    g.fill_rect(11, 8, 3, 4, 4)
    g.fill_rect(18, 8, 3, 4, 4)
    g.fill_rect(13, 15, 6, 5, 3)
    return ['#22c55e', '#4ade80', '#15803d'], g

BUILDERS['一個背帶書包'] = build_d3ae1d

def build_420170() -> tuple[list[str], Grid]:
    g = Grid()
    # 一個藍色杯子：寬口、杯身、C 形把手（與碗／方塊完全不同）
    g.box(7, 7, 14, 3, 3)  # 杯口橫條
    g.fill_rect(8, 10, 12, 12, 2)  # 杯身主色
    g.fill_rect(8, 10, 12, 1, OUTLINE)
    g.fill_rect(8, 21, 12, 1, OUTLINE)
    g.fill_rect(7, 10, 1, 12, OUTLINE)
    g.fill_rect(19, 10, 1, 12, OUTLINE)
    g.fill_rect(9, 11, 10, 9, 3)  # 內部亮面
  # 把手
    g.fill_rect(20, 11, 5, 1, OUTLINE)
    g.fill_rect(20, 19, 5, 1, OUTLINE)
    g.fill_rect(20, 11, 1, 9, OUTLINE)
    g.fill_rect(24, 12, 1, 7, OUTLINE)
    g.fill_rect(21, 12, 3, 7, 2)
    g.fill_rect(23, 13, 1, 5, 0)
    return ["#2563eb", "#3b82f6", "#93c5fd"], g

BUILDERS['一個藍色杯子'] = build_420170

def build_4653b5() -> tuple[list[str], Grid]:
    g = Grid()
    # 一匹棕色小馬
    g.ellipse(14, 18, 10, 6, 2)
    g.box(8, 10, 8, 8, 2)
    g.fill_rect(20, 16, 3, 8, 3)
    g.fill_rect(12, 22, 2, 6, 4)
    g.fill_rect(18, 22, 2, 6, 4)
    return ['#92400e', '#b45309', '#78350f'], g

BUILDERS['一匹棕色小馬'] = build_4653b5

def build_a350c5() -> tuple[list[str], Grid]:
    g = Grid()
    # 一堆紅紅的營火
    g.fill_rect(10, 22, 12, 3, 4)
    g.tri(16, 8, 12, 14, 2)
    g.tri(12, 12, 8, 10, 3)
    g.tri(20, 12, 8, 10, 3)
    g.circle(16, 18, 3, 3)
    return ['#f97316', '#fde047', '#78350f'], g

BUILDERS['一堆紅紅的營火'] = build_a350c5

def build_637983() -> tuple[list[str], Grid]:
    g = Grid()
    # 一塊方方的稻田
    g.fill_rect(5, 14, 22, 12, 2)
    for i in range(5):
        g.fill_rect(7 + i * 4, 10, 2, 16, 3)
    g.fill_rect(5, 12, 22, 2, 4)
    return ['#ca8a04', '#eab308', '#84cc16'], g

BUILDERS['一塊方方的稻田'] = build_637983

def build_c96af5() -> tuple[list[str], Grid]:
    g = Grid()
    # 一座綠色的山
    g.tri(16, 8, 22, 18, 2)
    g.fill_rect(8, 24, 16, 4, 3)
    g.tri(16, 12, 8, 6, 4)
    return ['#22c55e', '#4ade80', '#f8fafc'], g

BUILDERS['一座綠色的山'] = build_c96af5

def build_e2f293() -> tuple[list[str], Grid]:
    g = Grid()
    # 一張小床
    g.box(5, 14, 22, 10, 4)
    g.box(6, 8, 8, 8, 3)
    g.fill_rect(7, 15, 20, 6, 2)
    g.fill_rect(6, 22, 3, 6, 4)
    g.fill_rect(23, 22, 3, 6, 4)
    return ['#60a5fa', '#fef3c7', '#92400e'], g

BUILDERS['一張小床'] = build_e2f293

def build_34b02f() -> tuple[list[str], Grid]:
    g = Grid()
    # 一張張開的嘴巴
    g.ellipse(16, 16, 11, 10, 2)
    g.ellipse(16, 18, 8, 6, 3)
    g.fill_rect(10, 10, 12, 4, 2)
    return ['#fecaca', '#f87171', '#fef2f2'], g

BUILDERS['一張張開的嘴巴'] = build_34b02f

def build_fedc73() -> tuple[list[str], Grid]:
    g = Grid()
    # 一張木頭桌子
    g.fill_rect(6, 12, 20, 4, 2)
    g.fill_rect(8, 16, 4, 10, 3)
    g.fill_rect(20, 16, 4, 10, 3)
    return ['#92400e', '#b45309', '#78350f'], g

BUILDERS['一張木頭桌子'] = build_fedc73

def build_683ae9() -> tuple[list[str], Grid]:
    g = Grid()
    # 一張白紙
    g.box(8, 6, 16, 20, 2)
    g.fill_rect(11, 10, 10, 2, 3)
    g.fill_rect(11, 14, 8, 2, 3)
    g.fill_rect(11, 18, 9, 2, 3)
    return ['#f8fafc', '#e2e8f0', '#cbd5e1'], g

BUILDERS['一張白紙'] = build_683ae9

def build_40de34() -> tuple[list[str], Grid]:
    g = Grid()
    # 一扇木門
    g.box(8, 5, 16, 22, 2)
    g.circle(20, 16, 2, 4)
    g.fill_rect(10, 7, 5, 6, 3)
    return ['#b45309', '#92400e', '#fbbf24'], g

BUILDERS['一扇木門'] = build_40de34

def build_2d239b() -> tuple[list[str], Grid]:
    g = Grid()
    # 一扇窗戶
    g.box(6, 6, 20, 20, 4)
    g.fill_rect(8, 8, 16, 16, 2)
    g.fill_rect(15, 8, 2, 16, OUTLINE)
    g.fill_rect(8, 15, 16, 2, OUTLINE)
    return ['#bae6fd', '#93c5fd', '#78350f'], g

BUILDERS['一扇窗戶'] = build_2d239b

def build_f118da() -> tuple[list[str], Grid]:
    g = Grid()
    # 一把打開的雨傘
    g.fill_rect(15, 10, 2, 16, 4)
    g.ellipse(16, 10, 12, 6, 2)
    g.fill_rect(16, 20, 12, 2, OUTLINE)
    return ['#22c55e', '#4ade80', '#78716c'], g

BUILDERS['一把打開的雨傘'] = build_f118da

def build_15d2a3() -> tuple[list[str], Grid]:
    g = Grid()
    # 一把黃色雨傘
    g.fill_rect(15, 10, 2, 16, 4)
    g.ellipse(16, 10, 12, 6, 2)
    g.fill_rect(18, 21, 8, 3, 3)
    return ['#fbbf24', '#fde047', '#78716c'], g

BUILDERS['一把黃色雨傘'] = build_15d2a3

def build_2ae503() -> tuple[list[str], Grid]:
    g = Grid()
    # 一本打開的書
    g.box(6, 8, 10, 16, 2)
    g.box(16, 8, 10, 16, 3)
    g.fill_rect(8, 11, 6, 2, 4)
    g.fill_rect(18, 11, 6, 2, 2)
    return ['#3b82f6', '#e0f2fe', '#f8fafc'], g

BUILDERS['一本打開的書'] = build_2ae503

def build_811f5c() -> tuple[list[str], Grid]:
    g = Grid()
    # 一朵下雨的雲
    g.circle(12, 12, 6, 2)
    g.circle(20, 12, 7, 2)
    g.fill_rect(8, 14, 16, 5, 2)
    for i, x in enumerate([11, 15, 19, 23]):
        g.fill_rect(x, 19 + (i % 2), 2, 6, 3)
    return ['#e2e8f0', '#cbd5e1', '#3b82f6'], g

BUILDERS['一朵下雨的雲'] = build_811f5c

def build_87a6fa() -> tuple[list[str], Grid]:
    g = Grid()
    # 一朵紅色的花
    g.fill_rect(15, 16, 2, 10, 3)
    g.circle(11, 12, 4, 2)
    g.circle(21, 12, 4, 2)
    g.circle(16, 8, 4, 2)
    g.circle(10, 16, 4, 2)
    g.circle(22, 16, 4, 2)
    g.circle(16, 14, 3, 4)
    return ['#f472b6', '#ef4444', '#fde047'], g

BUILDERS['一朵紅色的花'] = build_87a6fa

def build_c04352() -> tuple[list[str], Grid]:
    g = Grid()
    # 一枝削好的鉛筆
    g.box(13, 5, 6, 22, 2)
    g.tri(16, 24, 6, 5, 3)
    g.fill_rect(13, 5, 6, 4, 4)
    return ['#fbbf24', '#fde68a', '#1e293b'], g

BUILDERS['一枝削好的鉛筆'] = build_c04352

def build_378e73() -> tuple[list[str], Grid]:
    g = Grid()
    # 一根綠色竹子
    for x in (12, 16, 20):
        g.fill_rect(x, 6, 4, 22, 2)
        g.fill_rect(x - 1, 14, 6, 2, 3)
        g.fill_rect(x - 3, 20, 5, 3, 4)
    return ['#22c55e', '#15803d', '#4ade80'], g

BUILDERS['一根綠色竹子'] = build_378e73

def build_6689c5() -> tuple[list[str], Grid]:
    g = Grid()
    # 一條橘色小魚
    g.ellipse(16, 16, 12, 7, 2)
    g.tri(28, 13, 8, 10, 3)
    g.circle(10, 14, 2, OUTLINE)
    g.fill_rect(9, 13, 2, 2, 4)
    return ['#fb923c', '#ea580c', '#fdba74'], g

BUILDERS['一條橘色小魚'] = build_6689c5

def build_357f72() -> tuple[list[str], Grid]:
    g = Grid()
    # 一棵大樹
    g.fill_rect(14, 18, 4, 12, 4)
    g.circle(16, 12, 10, 2)
    g.circle(16, 9, 7, 3)
    return ['#16a34a', '#22c55e', '#78350f'], g

BUILDERS['一棵大樹'] = build_357f72

def build_2dd386() -> tuple[list[str], Grid]:
    g = Grid()
    # 一片綠皮紅肉的西瓜
    g.tri(16, 8, 20, 20, 2)
    g.tri(16, 12, 14, 14, 3)
    for i in range(4):
        g.fill_rect(12 + i * 3, 16, 2, 6, 4)
    return ['#16a34a', '#ef4444', '#fca5a5'], g

BUILDERS['一片綠皮紅肉的西瓜'] = build_2dd386

def build_dcac7a() -> tuple[list[str], Grid]:
    g = Grid()
    # 一片綠色小草
    g.fill_rect(4, 22, 24, 6, 3)
    for x in range(6, 26, 4):
        g.fill_rect(x, 14, 2, 10, 2)
        g.fill_rect(x + 1, 12, 2, 4, 4)
    return ['#4ade80', '#22c55e', '#15803d'], g

BUILDERS['一片綠色小草'] = build_dcac7a

def build_9f2027() -> tuple[list[str], Grid]:
    g = Grid()
    # 一片綠色葉子
    g.ellipse(14, 16, 6, 12, 2)
    g.fill_rect(14, 8, 2, 18, 3)
    return ['#22c55e', '#15803d', '#4ade80'], g

BUILDERS['一片綠色葉子'] = build_9f2027

def build_c375b8() -> tuple[list[str], Grid]:
    g = Grid()
    # 一盞亮亮的檯燈
    g.fill_rect(14, 12, 4, 14, 4)
    g.ellipse(16, 10, 10, 6, 2)
    g.fill_rect(12, 24, 8, 2, 4)
    g.fill_rect(8, 8, 16, 8, 3)
    return ['#fde047', '#fef3c7', '#78716c'], g

BUILDERS['一盞亮亮的檯燈'] = build_c375b8

def build_b6a2dc() -> tuple[list[str], Grid]:
    g = Grid()
    # 一碗白飯
    g.ellipse(16, 18, 11, 6, 2)
    g.ellipse(16, 16, 9, 5, 3)
    g.fill_rect(10, 10, 12, 6, 4)
    return ['#e2e8f0', '#f8fafc', '#d4d4d8'], g

BUILDERS['一碗白飯'] = build_b6a2dc

def build_8e2b68() -> tuple[list[str], Grid]:
    g = Grid()
    # 一艘小帆船
    g.fill_rect(0, 22, 32, 6, 3)
    g.fill_rect(8, 16, 12, 6, 2)
    g.fill_rect(14, 6, 2, 12, OUTLINE)
    g.tri(24, 6, 10, 12, 4)
    return ['#92400e', '#f87171', '#38bdf8'], g

BUILDERS['一艘小帆船'] = build_8e2b68

def build_5991eb() -> tuple[list[str], Grid]:
    g = Grid()
    # 一輛紅色小汽車
    g.box(6, 14, 20, 8, 2)
    g.box(10, 9, 12, 6, 3)
    g.circle(10, 22, 3, 4)
    g.circle(22, 22, 3, 4)
    return ['#e53e3e', '#fca5a5', '#1e293b'], g

BUILDERS['一輛紅色小汽車'] = build_5991eb

def build_b17919() -> tuple[list[str], Grid]:
    g = Grid()
    # 一輛藍色汽車
    g.box(5, 15, 22, 7, 2)
    g.box(9, 10, 14, 6, 2)
    g.circle(9, 22, 3, 4)
    g.circle(23, 22, 3, 4)
    return ['#3b82f6', '#93c5fd', '#1e293b'], g

BUILDERS['一輛藍色汽車'] = build_b17919

def build_2cf1a2() -> tuple[list[str], Grid]:
    g = Grid()
    # 一輛載很多人的公車
    g.box(4, 12, 24, 12, 2)
    for x in range(7, 24, 5):
        g.fill_rect(x, 14, 4, 5, 3)
    g.circle(9, 24, 3, 4)
    g.circle(23, 24, 3, 4)
    return ['#facc15', '#fde047', '#1e293b'], g

BUILDERS['一輛載很多人的公車'] = build_2cf1a2

def build_59eb76() -> tuple[list[str], Grid]:
    g = Grid()
    # 一間小木屋
    g.tri(16, 6, 22, 10, 3)
    g.box(8, 14, 16, 12, 2)
    g.box(13, 18, 6, 8, 4)
    return ['#d4a574', '#ef4444', '#78350f'], g

BUILDERS['一間小木屋'] = build_59eb76

def build_55ec1c() -> tuple[list[str], Grid]:
    g = Grid()
    # 一隻大耳朵
    g.ellipse(16, 18, 8, 11, 2)
    g.ellipse(16, 18, 5, 7, 3)
    g.ellipse(10, 10, 6, 9, 2)
    return ['#fecaca', '#fda4af', '#f9a8d4'], g

BUILDERS['一隻大耳朵'] = build_55ec1c

def build_43380e() -> tuple[list[str], Grid]:
    g = Grid()
    # 一隻張開五指的手
    g.fill_rect(12, 16, 10, 10, 2)
    for i, x in enumerate([11, 14, 17, 20, 23]):
        g.fill_rect(x, 8 + (i % 2), 3, 10, 3)
    g.fill_rect(22, 10, 3, 8, 4)
    return ['#fecaca', '#fda4af', '#f87171'], g

BUILDERS['一隻張開五指的手'] = build_43380e

def build_2d8fb9() -> tuple[list[str], Grid]:
    g = Grid()
    # 一隻彩色蝴蝶
    g.fill_rect(15, 10, 2, 12, OUTLINE)
    g.ellipse(10, 12, 6, 8, 2)
    g.ellipse(22, 12, 6, 8, 3)
    g.circle(15, 8, 2, 4)
    return ['#a855f7', '#ec4899', '#fde047'], g

BUILDERS['一隻彩色蝴蝶'] = build_2d8fb9

def build_2bf5bd() -> tuple[list[str], Grid]:
    g = Grid()
    # 一隻彩色蝴蝶停在花上
    g.fill_rect(15, 18, 2, 10, 3)
    g.circle(11, 14, 4, 2)
    g.circle(21, 14, 4, 3)
    g.circle(16, 12, 3, 4)
    g.circle(16, 20, 4, 4)
    return ['#a855f7', '#f472b6', '#22c55e'], g

BUILDERS['一隻彩色蝴蝶停在花上'] = build_2bf5bd

def build_4b395a() -> tuple[list[str], Grid]:
    g = Grid()
    # 一隻棕色小熊
    g.circle(10, 10, 4, 2)
    g.circle(22, 10, 4, 2)
    g.circle(16, 16, 9, 2)
    g.fill_rect(13, 18, 6, 3, 4)
    g.circle(13, 14, 1, OUTLINE)
    g.circle(19, 14, 1, OUTLINE)
    return ['#b45309', '#92400e', '#fde68a'], g

BUILDERS['一隻棕色小熊'] = build_4b395a

def build_e0e33a() -> tuple[list[str], Grid]:
    g = Grid()
    # 一隻灰色小貓
    g.ellipse(16, 18, 9, 7, 2)
    g.tri(10, 10, 5, 6, 2)
    g.tri(22, 10, 5, 6, 2)
    g.circle(13, 16, 1, OUTLINE)
    g.circle(19, 16, 1, OUTLINE)
    return ['#9ca3af', '#6b7280', '#d1d5db'], g

BUILDERS['一隻灰色小貓'] = build_e0e33a

def build_a1bd44() -> tuple[list[str], Grid]:
    g = Grid()
    # 一隻白色兔子
    g.ellipse(16, 20, 8, 7, 2)
    g.fill_rect(10, 6, 4, 14, 2)
    g.fill_rect(18, 6, 4, 14, 2)
    g.circle(14, 18, 1, OUTLINE)
    g.fill_rect(16, 20, 2, 2, 3)
    return ['#f8fafc', '#e2e8f0', '#fda4af'], g

BUILDERS['一隻白色兔子'] = build_a1bd44

def build_f4eb24() -> tuple[list[str], Grid]:
    g = Grid()
    # 一隻白色大鵝
    g.ellipse(14, 18, 11, 7, 2)
    g.ellipse(22, 14, 6, 4, 2)
    g.circle(12, 16, 1, OUTLINE)
    g.circle(24, 14, 3, 3)
    return ['#f8fafc', '#e2e8f0', '#f97316'], g

BUILDERS['一隻白色大鵝'] = build_f4eb24

def build_013d5a() -> tuple[list[str], Grid]:
    g = Grid()
    # 一隻站在樹枝上的小鳥
    g.fill_rect(4, 18, 24, 3, 3)
    g.ellipse(16, 14, 8, 6, 2)
    g.tri(24, 13, 6, 5, 2)
    g.circle(12, 13, 1, OUTLINE)
    return ['#38bdf8', '#0ea5e9', '#92400e'], g

BUILDERS['一隻站在樹枝上的小鳥'] = build_013d5a

def build_fc01bd() -> tuple[list[str], Grid]:
    g = Grid()
    # 一隻站著的小鳥
    g.ellipse(16, 14, 8, 9, 2)
    g.tri(24, 12, 6, 6, 3)
    g.fill_rect(12, 22, 3, 5, OUTLINE)
    g.fill_rect(18, 22, 3, 5, OUTLINE)
    g.circle(12, 12, 1, OUTLINE)
    return ['#60a5fa', '#38bdf8', '#f97316'], g

BUILDERS['一隻站著的小鳥'] = build_fc01bd

def build_ca62cd() -> tuple[list[str], Grid]:
    g = Grid()
    # 一隻綠色青蛙
    g.ellipse(16, 18, 11, 7, 2)
    g.circle(11, 12, 4, 3)
    g.circle(21, 12, 4, 3)
    g.circle(11, 11, 2, 4)
    g.circle(21, 11, 2, 4)
    return ['#22c55e', '#16a34a', '#fef3c7'], g

BUILDERS['一隻綠色青蛙'] = build_ca62cd

def build_cb24e6() -> tuple[list[str], Grid]:
    g = Grid()
    # 一隻黃色小狗
    g.ellipse(16, 18, 10, 7, 2)
    g.fill_rect(8, 12, 5, 8, 3)
    g.fill_rect(19, 12, 5, 8, 3)
    g.circle(13, 16, 1, OUTLINE)
    return ['#eab308', '#ca8a04', '#1e293b'], g

BUILDERS['一隻黃色小狗'] = build_cb24e6

def build_a5d320() -> tuple[list[str], Grid]:
    g = Grid()
    # 一隻黃色小雞
    g.circle(16, 17, 8, 2)
    g.tri(20, 10, 6, 6, 3)
    g.circle(13, 16, 1, OUTLINE)
    g.fill_rect(17, 18, 3, 2, 4)
    return ['#fde047', '#facc15', '#f97316'], g

BUILDERS['一隻黃色小雞'] = build_a5d320

def build_725f53() -> tuple[list[str], Grid]:
    g = Grid()
    # 一雙紅色布鞋
    g.box(6, 14, 10, 8, 2)
    g.box(16, 14, 10, 8, 2)
    g.fill_rect(7, 10, 8, 5, 3)
    g.fill_rect(17, 10, 8, 5, 3)
    return ['#ef4444', '#dc2626', '#fecaca'], g

BUILDERS['一雙紅色布鞋'] = build_725f53

def build_b368ba() -> tuple[list[str], Grid]:
    g = Grid()
    # 一頭灰色大象
    g.ellipse(14, 16, 10, 9, 2)
    g.fill_rect(20, 18, 8, 5, 2)
    g.fill_rect(26, 20, 3, 8, 2)
    g.circle(11, 14, 2, OUTLINE)
    g.circle(17, 13, 2, OUTLINE)
    g.circle(10, 9, 4, 3)
    g.circle(18, 9, 4, 3)
    return ['#9ca3af', '#6b7280', '#d1d5db'], g

BUILDERS['一頭灰色大象'] = build_b368ba

def build_375bd9() -> tuple[list[str], Grid]:
    g = Grid()
    # 一頭黑白乳牛
    g.ellipse(16, 18, 11, 8, 2)
    g.circle(12, 17, 3, 3)
    g.circle(20, 16, 4, 3)
    g.circle(12, 14, 2, OUTLINE)
    g.circle(19, 13, 2, OUTLINE)
    g.fill_rect(15, 13, 3, 3, 4)
    g.tri(9, 8, 6, 6, 2)
    g.tri(22, 8, 6, 6, 2)
    return ['#f8fafc', '#1e293b', '#fda4af'], g

BUILDERS['一頭黑白乳牛'] = build_375bd9

def build_074eed() -> tuple[list[str], Grid]:
    g = Grid()
    # 一顆包著糖紙的糖果
    g.ellipse(16, 16, 7, 7, 2)
    g.tri(6, 16, 10, 6, 3)
    g.tri(26, 16, 10, 6, 3)
    return ['#f472b6', '#fef3c7', '#ec4899'], g

BUILDERS['一顆包著糖紙的糖果'] = build_074eed

def build_a9ee16() -> tuple[list[str], Grid]:
    g = Grid()
    # 一顆白白的牙齒
    g.box(11, 6, 10, 18, 2)
    g.fill_rect(12, 20, 8, 4, 3)
    g.fill_rect(13, 8, 6, 4, 4)
    return ['#f8fafc', '#e2e8f0', '#cbd5e1'], g

BUILDERS['一顆白白的牙齒'] = build_a9ee16

def build_febe2a() -> tuple[list[str], Grid]:
    g = Grid()
    # 一顆白色雞蛋
    g.ellipse(16, 16, 8, 11, 2)
    g.ellipse(16, 14, 5, 6, 3)
    return ['#f8fafc', '#e2e8f0', '#d4d4d8'], g

BUILDERS['一顆白色雞蛋'] = build_febe2a

def build_ac2a06() -> tuple[list[str], Grid]:
    g = Grid()
    # 一顆紅色皮球
    g.circle(16, 16, 10, 2)
    g.circle(12, 12, 3, 3)
    g.fill_rect(14, 20, 4, 2, 4)
    return ['#ef4444', '#fca5a5', '#dc2626'], g

BUILDERS['一顆紅色皮球'] = build_ac2a06

def build_d8fac6() -> tuple[list[str], Grid]:
    g = Grid()
    # 一顆紅蘋果
    g.circle(16, 17, 9, 2)
    g.fill_rect(15, 5, 2, 5, 3)
    g.tri(20, 6, 6, 4, 4)
    return ['#ef4444', '#dc2626', '#22c55e'], g

BUILDERS['一顆紅蘋果'] = build_d8fac6

def build_33bee6() -> tuple[list[str], Grid]:
    g = Grid()
    # 一顆黃色星星
    g.fill_rect(14, 6, 4, 20, 2)
    g.fill_rect(6, 14, 20, 4, 2)
    g.fill_rect(8, 9, 16, 3, 3)
    g.fill_rect(8, 18, 16, 3, 3)
    return ['#fbbf24', '#fde047', '#f59e0b'], g

BUILDERS['一顆黃色星星'] = build_33bee6

def build_da6238() -> tuple[list[str], Grid]:
    g = Grid()
    # 三座連在一起的山
    g.tri(8, 20, 10, 14, 2)
    g.tri(16, 18, 12, 16, 3)
    g.tri(24, 20, 10, 14, 2)
    g.fill_rect(4, 22, 24, 4, 4)
    g.tri(8, 14, 4, 4, 4)
    g.tri(24, 14, 4, 4, 4)
    return ['#4ade80', '#22c55e', '#f8fafc'], g

BUILDERS['三座連在一起的山'] = build_da6238

def build_742ea9() -> tuple[list[str], Grid]:
    g = Grid()
    # 三張選項圖
    c = Grid()
    c.circle(8, 8, 5, 2)
    c.fill_rect(4, 10, 8, 4, 2)
    g.stamp_scaled(1, 8, c, 5, 5)
    f = Grid()
    f.ellipse(8, 8, 6, 3, 3)
    f.tri(14, 6, 5, 6, 2)
    g.stamp_scaled(12, 8, f, 5, 5)
    w = Grid()
    w.box(3, 5, 10, 8, 4)
    g.stamp_scaled(22, 6, w, 5, 5)
    return ['#e2e8f0', '#fb923c', '#f8fafc'], g

BUILDERS['三張選項圖'] = build_742ea9

def build_3c7a0e() -> tuple[list[str], Grid]:
    g = Grid()
    # 夜空中一個彎彎的月亮
    g.fill_rect(4, 4, 24, 24, 2)
    g.circle(16, 13, 8, 3)
    g.fill_rect(20, 5, 8, 18, 2)
    g.circle(10, 8, 1, 4)
    g.circle(22, 10, 1, 4)
    g.circle(18, 22, 1, 4)
    return ['#1e3a5f', '#fef3c7', '#fde047'], g

BUILDERS['夜空中一個彎彎的月亮'] = build_3c7a0e

def build_5a3c32() -> tuple[list[str], Grid]:
    g = Grid()
    # 雲下面在下雨
    g.circle(10, 11, 5, 2)
    g.circle(18, 10, 6, 2)
    g.fill_rect(7, 13, 15, 4, 2)
    for x in (9, 13, 17, 21):
        g.fill_rect(x, 17, 2, 8, 3)
    return ['#e2e8f0', '#94a3b8', '#2563eb'], g

BUILDERS['雲下面在下雨'] = build_5a3c32



def load_descriptions() -> list[str]:
    with open(JSON_PATH, encoding="utf-8") as f:
        data = json.load(f)
    seen: set[str] = set()
    for q in data["questions"]:
        if q.get("image", "").strip():
            seen.add(q["image"])
        for o in q.get("options", []):
            if o.get("image", "").strip():
                seen.add(o["image"])
    return sorted(seen)


def validate(desc: str, pal: list[str], grid: Grid) -> list[str]:
    issues: list[str] = []
    if len(pal) != 3:
        issues.append(f"{desc}: palette must have 3 colors")
    used = {c for c in grid.data if c}
    if OUTLINE not in used:
        issues.append(f"{desc}: missing outline")
    if not (used - {OUTLINE}):
        issues.append(f"{desc}: no fill colors")
    b = grid.bounds()
    if not b:
        issues.append(f"{desc}: empty")
        return issues
    x0, y0, x1, y1 = b
    if x0 < 2 or y0 < 2 or x1 > 29 or y1 > 29:
        issues.append(f"{desc}: margin > 5px")
    if grid.coverage() < 0.45:
        issues.append(f"{desc}: subject too small")
    return issues


def emit_rust(entries: list[tuple[str, list[str], Grid]]) -> None:
    lines = [
        "// @generated by tools/build_pixel_art.py — do not edit",
        "",
        "#[derive(Debug, Clone, Copy)]",
        "pub struct SceneArt {",
        "    pub desc: &'static str,",
        "    pub palette: [&'static str; 3],",
        "    pub pixels: [u8; 1024],",
        "}",
        "",
        "pub static CATALOG: &[SceneArt] = &[",
    ]
    for desc, pal, grid in entries:
        px = ", ".join(str(b) for b in grid.data)
        lines.append("    SceneArt {")
        lines.append(f'        desc: "{desc}",')
        lines.append(f'        palette: ["{pal[0]}", "{pal[1]}", "{pal[2]}"],')
        lines.append(f"        pixels: [{px}],")
        lines.append("    },")
    lines += [
        "];",
        "",
        "pub fn lookup(desc: &str) -> Option<&SceneArt> {",
        "    CATALOG.binary_search_by(|e| e.desc.cmp(desc)).ok().map(|i| &CATALOG[i])",
        "}",
        "",
    ]
    OUT_RS.write_text("\n".join(lines), encoding="utf-8")


def color_at(pal: list[str], idx: int) -> str:
    if idx == 0:
        return "#e8f4ff"
    if idx == OUTLINE:
        return OUTLINE_HEX
    return pal[idx - 2]


def render_gallery(entries: list[tuple[str, list[str], Grid]]) -> None:
    cols, scale = 8, 4
    cell_img = 32 * scale
    pad, label_h = 12, 46
    cell_w, cell_h = cell_img + pad * 2, cell_img + label_h + pad
    rows = (len(entries) + cols - 1) // cols
    img = Image.new("RGB", (cols * cell_w + pad, rows * cell_h + pad), "white")
    draw = ImageDraw.Draw(img)
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/wqy/wqy-microhei.ttc", 13)
    except OSError:
        font = ImageFont.load_default()
    for i, (desc, pal, grid) in enumerate(entries):
        col, row = i % cols, i // cols
        ox = pad + col * cell_w
        oy = pad + row * cell_h
        for y in range(32):
            for x in range(32):
                c = grid.get(x, y)
                x0 = ox + pad + x * scale
                y0 = oy + pad + y * scale
                draw.rectangle([x0, y0, x0 + scale - 1, y0 + scale - 1], fill=color_at(pal, c))
        ty = oy + pad + cell_img + 4
        for line in textwrap.wrap(desc, width=13):
            tw = draw.textlength(line, font=font)
            draw.text((ox + (cell_w - tw) / 2, ty), line, fill="#1a1a2e", font=font)
            ty += 15
    GALLERY_PATH.parent.mkdir(parents=True, exist_ok=True)
    img.save(GALLERY_PATH)


def main() -> None:
    descs = load_descriptions()
    if len(descs) != 67:
        raise SystemExit(f"expected 67 descriptions, got {len(descs)}")
    uncertain: list[str] = []
    entries: list[tuple[str, list[str], Grid]] = []
    for desc in descs:
        pal, grid = BUILDERS[desc]()
        uncertain.extend(validate(desc, pal, grid))
        entries.append((desc, pal, grid))
    emit_rust(entries)
    render_gallery(entries)
    UNCERTAIN_PATH.write_text("\n".join(uncertain) + ("\n" if uncertain else ""), encoding="utf-8")
    print(f"Sprites: {len(entries)} -> {OUT_RS}")
    print(f"Gallery: {GALLERY_PATH}")
    print(f"Uncertain lines: {len(uncertain)}")


if __name__ == "__main__":
    main()
