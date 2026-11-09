"""48×48 redraws for v7 recognition pass."""
from __future__ import annotations

from build_pixel_art import OUTLINE, Grid

PAL_SKIN = ["#fecaca", "#fca5a5", "#f87171"]
PAL_TOOTH = ["#f8fafc", "#e2e8f0", "#cbd5e1"]
PAL_ELEPHANT = ["#9ca3af", "#6b7280", "#d1d5db"]
PAL_COW = ["#f8fafc", "#1e293b", "#fda4af"]
PAL_GOOSE = ["#f8fafc", "#e2e8f0", "#f97316"]
PAL_KID = ["#fecaca", "#38bdf8", "#1e293b"]
PAL_MOM = ["#fecaca", "#f472b6", "#92400e"]


def g48() -> Grid:
    return Grid(48)


def draw_hand_open() -> tuple[list[str], Grid]:
    g = g48()
    # 手掌（下）+ 五指張開（上），看得見五根
    g.fill_rect(14, 28, 20, 14, OUTLINE)
    g.fill_rect(15, 29, 18, 12, 2)
    fingers = [
        (11, 22, 5, 8),   # 拇指
        (16, 10, 4, 20),  # 食
        (21, 8, 4, 22),   # 中
        (26, 10, 4, 20),  # 無名
        (31, 14, 4, 16),  # 小
    ]
    for x, y, w, h in fingers:
        g.fill_rect(x, y, w, h, OUTLINE)
        g.fill_rect(x + 1, y + 1, w - 2, h - 2, 3)
    for x, y, w, h in fingers[1:]:
        g.fill_rect(x + 1, y + 1, w - 2, 3, 4)  # 指節高光
    return PAL_SKIN, g


def draw_tooth_molar() -> tuple[list[str], Grid]:
    g = g48()
    # 臼齒：上圓冠、下雙齒根
    for y in range(8, 22):
        for x in range(14, 34):
            dx = (x - 24) / 10
            dy = (y - 14) / 8
            if dx * dx + dy * dy <= 1.05:
                g.set(x, y, OUTLINE if dx * dx + dy * dy > 0.85 else 2)
    g.fill_rect(16, 20, 16, 6, 2)
    g.fill_rect(14, 26, 8, 14, OUTLINE)
    g.fill_rect(15, 27, 6, 12, 3)
    g.fill_rect(26, 26, 8, 14, OUTLINE)
    g.fill_rect(27, 27, 6, 12, 3)
    g.fill_rect(19, 10, 10, 4, 4)
    return PAL_TOOTH, g


def draw_elephant_side() -> tuple[list[str], Grid]:
    g = g48()
    # 側面全身：身體、大耳、鼻下垂、四腿
    g.ellipse(28, 26, 14, 11, 2)
    g.ellipse(16, 22, 11, 10, 2)
    g.fill_rect(8, 22, 6, 14, OUTLINE)
    g.fill_rect(9, 23, 4, 12, 3)  # 鼻
    g.fill_rect(9, 34, 5, 3, 3)
    g.fill_rect(6, 14, 10, 12, OUTLINE)
    g.fill_rect(7, 15, 8, 10, 3)  # 耳
    g.circle(14, 20, 2, OUTLINE)
    g.circle(20, 20, 2, OUTLINE)
    for x in (22, 28, 34, 38):
        g.fill_rect(x, 32, 5, 12, OUTLINE)
        g.fill_rect(x + 1, 33, 3, 10, 3)
    return PAL_ELEPHANT, g


def draw_cow_side() -> tuple[list[str], Grid]:
    g = g48()
    g.ellipse(30, 26, 15, 10, 2)
    g.ellipse(14, 24, 10, 9, 2)
    g.fill_rect(16, 24, 8, 6, 3)
    g.fill_rect(24, 22, 7, 5, 3)
    g.fill_rect(8, 20, 4, 4, 3)
    g.ellipse(10, 22, 4, 3, 4)
    g.circle(11, 21, 1, OUTLINE)
    g.circle(15, 21, 1, OUTLINE)
    g.fill_rect(12, 12, 2, 6, OUTLINE)
    g.fill_rect(16, 11, 2, 7, OUTLINE)
    for x in (20, 26, 32, 38):
        g.fill_rect(x, 32, 5, 11, OUTLINE)
        g.fill_rect(x + 1, 33, 3, 9, 2)
    return PAL_COW, g


def draw_goose_side() -> tuple[list[str], Grid]:
    g = g48()
    g.ellipse(24, 32, 18, 10, 2)
    g.fill_rect(20, 12, 8, 22, OUTLINE)
    g.fill_rect(21, 13, 6, 20, 3)
    g.fill_rect(14, 8, 12, 6, OUTLINE)
    g.fill_rect(15, 9, 10, 4, 4)
    g.fill_rect(8, 10, 10, 5, OUTLINE)
    g.fill_rect(9, 11, 8, 3, 4)
    g.circle(17, 28, 2, OUTLINE)
    g.fill_rect(32, 34, 8, 3, OUTLINE)
    return PAL_GOOSE, g


def draw_kid_running() -> tuple[list[str], Grid]:
    g = g48()
    g.circle(28, 12, 8, 2)
    g.fill_rect(20, 20, 16, 14, OUTLINE)
    g.fill_rect(21, 21, 14, 12, 3)
    g.fill_rect(10, 22, 12, 5, OUTLINE)
    g.fill_rect(11, 23, 10, 3, 3)
    g.fill_rect(32, 18, 10, 5, OUTLINE)
    g.fill_rect(33, 19, 8, 3, 3)
    g.fill_rect(14, 34, 6, 10, OUTLINE)
    g.fill_rect(15, 35, 4, 8, 4)
    g.fill_rect(28, 36, 6, 10, OUTLINE)
    g.fill_rect(29, 37, 4, 8, 4)
    g.fill_rect(22, 32, 14, 4, OUTLINE)
    g.circle(25, 10, 1, OUTLINE)
    g.circle(31, 10, 1, OUTLINE)
    return PAL_KID, g


def draw_kid_brushing() -> tuple[list[str], Grid]:
    g = g48()
    g.circle(18, 14, 9, 2)
    g.fill_rect(12, 22, 14, 16, OUTLINE)
    g.fill_rect(13, 23, 12, 14, 3)
    g.fill_rect(26, 18, 18, 5, OUTLINE)
    g.fill_rect(27, 19, 16, 3, 4)
    g.fill_rect(42, 14, 4, 14, OUTLINE)
    g.fill_rect(43, 15, 2, 12, 2)
    g.fill_rect(16, 38, 5, 8, OUTLINE)
    g.fill_rect(24, 38, 5, 8, OUTLINE)
    g.circle(15, 12, 1, OUTLINE)
    g.circle(21, 12, 1, OUTLINE)
    g.fill_rect(14, 16, 8, 3, 4)
    return PAL_KID, g


def draw_smiling_mom() -> tuple[list[str], Grid]:
    g = g48()
    g.circle(24, 22, 16, OUTLINE)
    g.fill_rect(9, 22, 30, 16, 2)
    for y in range(8, 24):
        for x in range(8, 40):
            dx, dy = (x - 24) / 15, (y - 18) / 12
            if dx * dx + dy * dy <= 1.0:
                c = 2 if dx * dx + dy * dy < 0.75 else OUTLINE
                g.set(x, y, c)
    g.circle(18, 20, 2, OUTLINE)
    g.circle(30, 20, 2, OUTLINE)
    g.fill_rect(17, 19, 2, 2, 4)
    g.fill_rect(29, 19, 2, 2, 4)
    g.fill_rect(16, 28, 16, 4, OUTLINE)
    g.fill_rect(17, 29, 14, 2, 4)
    g.fill_rect(18, 30, 12, 2, 2)
    g.fill_rect(14, 36, 20, 10, OUTLINE)
    g.fill_rect(15, 37, 18, 8, 3)
    return PAL_MOM, g


def draw_option_prompt_icon() -> tuple[list[str], Grid]:
    """Catalog only — UI skips this as question image."""
    g = g48()
    for i, ox in enumerate((4, 18, 32)):
        g.box(ox, 14, 12, 20, OUTLINE)
        g.fill_rect(ox + 2, 16, 8, 16, 3 if i == 1 else 2)
    g.fill_rect(10, 40, 28, 4, OUTLINE)
    return ["#94a3b8", "#e2e8f0", "#f8fafc"], g


V7_BUILDERS = {
    "一隻張開五指的手": draw_hand_open,
    "一顆白白的牙齒": draw_tooth_molar,
    "一頭灰色大象": draw_elephant_side,
    "一頭黑白乳牛": draw_cow_side,
    "一隻白色大鵝": draw_goose_side,
    "一個小朋友在跑步": draw_kid_running,
    "一個小朋友拿牙刷刷牙": draw_kid_brushing,
    "一位微笑的媽媽": draw_smiling_mom,
    "三張選項圖": draw_option_prompt_icon,
}
