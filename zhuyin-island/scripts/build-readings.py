#!/usr/bin/env python3
"""把題庫裡用到的國字，對上注音粉圓的讀音表，寫進 src/data/readings.ts。"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parents[1]
TABLE = Path("/tmp/bpmf/phonic_table_Z.txt")
FONT = ROOT / "public/fonts/BpmfHuninn-Regular.woff2"
OUT = ROOT / "src/data/readings.ts"
# 一般字串才會把 \u 轉成真正的字，不能用 raw string。
HAN = "[\u3400-\u9fff\U00020000-\U0002a6df\U0002a700-\U0002b73f\U0002b740-\U0002b81f\U0002b820-\U0002ceaf]"


def load_table(path: Path) -> dict[str, list[str]]:
    table: dict[str, list[str]] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        parts = line.split("\t")
        if len(parts) < 4 or not parts[0]:
            continue
        table[parts[0]] = parts[3:]
    return table


def collect_chars(table: dict[str, list[str]]) -> tuple[set[str], list[str]]:
    import re

    han = re.compile(HAN)
    markup = re.compile(f"({HAN[1:-1]})\\{{(\\d+)\\}}")
    found: set[str] = set()
    errors: list[str] = []
    for folder in (ROOT / "src", ROOT / "scripts"):
        for path in folder.rglob("*"):
            if path.suffix not in {".ts", ".tsx", ".css"} or path.name == "readings.ts":
                continue
            text = path.read_text(encoding="utf-8")
            found.update(han.findall(text))
            for character, alt in markup.findall(text):
                readings = table.get(character)
                if readings is None:
                    continue
                if int(alt) >= len(readings):
                    errors.append(f"{path.name}：{character}{{{alt}}} 超出讀音表（只有 {len(readings)} 個）")
    return found, errors


def main() -> int:
    if not TABLE.exists():
        print(f"找不到讀音表：{TABLE}", file=sys.stderr)
        return 1
    table = load_table(TABLE)
    chars, errors = collect_chars(table)
    font = TTFont(FONT)
    cmap = font.getBestCmap() or {}
    missing_table = sorted(ch for ch in chars if ch not in table)
    missing_font = sorted(ch for ch in chars if ord(ch) not in cmap)
    for ch in missing_table:
        errors.append(f"讀音表沒有：{ch} U+{ord(ch):04X}")
    for ch in missing_font:
        errors.append(f"字型沒有：{ch} U+{ord(ch):04X}")
    if errors:
        print("\n".join(errors), file=sys.stderr)
        return 1
    lines = [
        "// 由 scripts/build-readings.py 產生。讀音順序對應注音粉圓的 IVS。",
        "export const readings: Record<string, readonly string[]> = {",
    ]
    for ch in sorted(chars, key=ord):
        lines.append(f"  {json.dumps(ch, ensure_ascii=False)}: {json.dumps(table[ch], ensure_ascii=False)},")
    lines.append("};")
    lines.append("")
    OUT.write_text("\n".join(lines), encoding="utf-8")
    print(f"寫入 {len(chars)} 個字到 {OUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
