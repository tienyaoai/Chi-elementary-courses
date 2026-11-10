#!/usr/bin/env python3
"""Add MoE-style zhuyin readings for kid UI characters missing from game.json."""
from __future__ import annotations

import json
from pathlib import Path

GAME = Path(__file__).resolve().parents[2] / "zhuyin-island-wasm" / "static" / "data" / "game.json"

# 教育部國語辭典常見讀音（國小一年級 UI 用字）
ADDITIONS = {
    "帽": ["ㄇㄠˋ"],
    "巾": ["ㄧㄣ"],
    "妮": ["ㄋㄧˊ"],
    "博": ["ㄅㄛˊ"],
    "橘": ["ㄐㄩˊ"],
    "青": ["ㄑㄧㄥ"],
    "位": ["ㄨㄟˋ"],
    "夥": ["ㄏㄨㄛˇ"],
    "伴": ["ㄅㄢˋ"],
    "葵": ["ㄎㄨㄟˊ"],
    "紫": ["ㄗˇ"],
    "丸": ["ㄨㄢˊ"],
    "薄": ["ㄅㄛˊ", "ㄅㄠˊ"],
    "荷": ["ㄏㄜˋ", "ㄏㄜˊ"],
    "旅": ["ㄌㄩˇ"],
    "蓋": ["ㄍㄞˋ", "ㄍㄜˇ"],
    "稍": ["ㄕㄠ"],
    "簡": ["ㄐㄧㄢˇ"],
    "單": ["ㄉㄢ", "ㄕㄢˋ"],
    "挑": ["ㄊㄧㄠ", "ㄊㄧㄠˇ"],
    "戰": ["ㄓㄢˋ"],
    "個": ["ㄍㄜˋ", "˙ㄍㄜ", "ㄍㄜˇ"],  # ensure present
    "英": ["ㄧㄥ"],
    "坊": ["ㄈㄤ"],
    "箱": ["ㄒㄧㄤ"],
    "藏": ["ㄘㄤˊ", "ㄗㄤˋ"],
    "發": ["ㄈㄚ", "ㄈㄚˋ"],
    "換": ["ㄏㄨㄢˋ"],
    "角": ["ㄐㄧㄠˇ", "ㄐㄩㄝˊ", "ㄍㄨㄛˇ"],
    "載": ["ㄗㄞˋ", "ㄗㄞˇ"],
    "地": ["ㄉㄧˋ", "˙ㄉㄜ", "ㄉㄧˊ"],
    "移": ["ㄧˊ"],
    "方": ["ㄈㄤ"],
    "向": ["ㄒㄧㄤˋ", "ㄒㄧㄤˋ"],
    "鍵": ["ㄐㄧㄢˋ"],
    "建": ["ㄐㄧㄢˋ"],
    "築": ["ㄓㄨˊ", "ㄓㄨˋ"],
    "科": ["ㄎㄜ"],
    "即": ["ㄐㄧˊ", "ㄐㄧˋ"],
    "將": ["ㄐㄧㄤ", "ㄐㄧㄤˋ", "ㄑㄧㄤ"],
    "放": ["ㄈㄤˋ"],
    "從": ["ㄘㄨㄥˊ", "ㄗㄨㄥˋ"],
    "始": ["ㄕˇ", "ㄕˋ"],
    "返": ["ㄈㄢˇ"],
    "入": ["ㄖㄨˋ"],
    "獲": ["ㄏㄨㄛˋ"],
    "獎": ["ㄐㄧㄤˇ"],
    "勵": ["ㄌㄧˋ"],
    "燈": ["ㄉㄥ"],
    "塔": ["ㄊㄚˇ", "ㄉㄚˊ"],
    "工": ["ㄍㄨㄥ"],
    "寶": ["ㄅㄠˇ"],
}


def main() -> None:
    data = json.loads(GAME.read_text(encoding="utf-8"))
    readings = data.setdefault("readings", {})
    added = 0
    for ch, vals in ADDITIONS.items():
        if not vals:
            continue
        if ch not in readings:
            readings[ch] = vals
            added += 1
    data["readings"] = dict(sorted(readings.items(), key=lambda kv: kv[0]))
    GAME.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"Patched {added} new characters into {GAME}")


if __name__ == "__main__":
    main()
