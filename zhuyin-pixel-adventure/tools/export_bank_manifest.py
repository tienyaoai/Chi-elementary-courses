#!/usr/bin/env python3
"""Export v9.23 question bank manifest for review."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "static" / "data"
OUT = Path("/opt/cursor/artifacts")


def manifest_for(path: Path):
    bank = json.loads(path.read_text(encoding="utf-8"))
    units = {}
    for q in bank["questions"]:
        u = q["unit"]
        units.setdefault(u, {"title": q["unit_title"], "teacher": q["unit_subtitle_teacher"], "ids": []})
        units[u]["ids"].append(q["id"])
    return {
        "file": path.name,
        "title": bank["title"],
        "subject": bank["subject"],
        "version": bank["version"],
        "question_count": len(bank["questions"]),
        "units": units,
    }


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    banks = ["grade1-math.json", "grade1-english.json"]
    manifest = [manifest_for(DATA / b) for b in banks]
    (OUT / "v9.23-question-banks.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    lines = ["# v9.23 題庫清單（原創）\n"]
    for m in manifest:
        lines.append(f"## {m['subject']} — {m['title']}\n")
        lines.append(f"- 題數：{m['question_count']}\n")
        for u, row in sorted(m["units"].items()):
            lines.append(f"### 關卡 {u}：{row['title']}（{row['teacher']}）\n")
            lines.append(f"- 題目 ID：{', '.join(row['ids'])}\n")
        lines.append("\n")
    (OUT / "v9.23-question-banks.md").write_text("".join(lines), encoding="utf-8")
    print("wrote", OUT / "v9.23-question-banks.md")


if __name__ == "__main__":
    main()
