#!/usr/bin/env python3
"""Generate original grade-1 math & English question banks (v9.23)."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "static" / "data"


def z(c, zy):
    return {"char": c, "zhuyin": zy}


def qbase(qid, unit, title, title_zy, teacher, qtype, prompt, prompt_zy, opts, ans, explain, image=None, speech_en=None, target=""):
    qq = {
        "id": qid,
        "grade": 1,
        "semester": "上學期",
        "unit": unit,
        "unit_title": title,
        "unit_title_zhuyin": title_zy,
        "unit_subtitle_teacher": teacher,
        "qtype": qtype,
        "difficulty": 1,
        "prompt": prompt,
        "prompt_zhuyin": prompt_zy,
        "options": opts,
        "answer": ans,
        "explain": explain,
        "target_zhuyin": target,
        "skills": [],
        "source": "原創｜v9.23",
        "license": "專案內使用",
    }
    if image:
        qq["image"] = image
    if speech_en:
        qq["speech_en"] = speech_en
    return qq


def opt(oid, text, zy=None, image=None):
    o = {"id": oid, "text": text}
    if zy:
        o["zhuyin"] = zy
    if image:
        o["image"] = image
    return o


def num_prompt(s):
    """Simple zhuyin for common math Chinese prompt chars."""
    table = {
        "圖": "ㄊㄨˊ", "裡": "ㄌㄧˇ", "有": "ㄧㄡˇ", "幾": "ㄐㄧˇ", "顆": "ㄎㄜ",
        "哪": "ㄋㄚˇ", "個": "˙ㄍㄜ", "比": "ㄅㄧˇ", "較": "ㄐㄧㄠˋ", "大": "ㄉㄚˋ",
        "多": "ㄉㄨㄛ", "加": "ㄐㄧㄚ", "起": "ㄑㄧˇ", "來": "˙ㄌㄞ", "是": "ㄕˋ",
        "幾": "ㄐㄧˇ", "減": "ㄐㄧㄢˇ", "掉": "ㄉㄧㄠˋ", "還": "ㄏㄞˊ", "剩": "ㄕㄥˋ",
        "這": "ㄓㄜˋ", "是": "ㄕˋ", "什": "ㄕㄜˊ", "麼": "˙ㄇㄜ", "形": "ㄒㄧㄥˊ",
        "狀": "ㄓㄨㄤˋ", "？": "", "「": "", "」": "", " ": "",
    }
    return [z(ch, table.get(ch, "")) for ch in s]


def build_math():
    units = []
    questions = []

    # U1 數到十
    t1, tz1, te1 = "豆豆數一數", [z("豆", "ㄉㄡˋ"), z("豆", "ㄉㄡˋ"), z("數", "ㄕㄨˇ"), z("一", "ㄧ"), z("數", "ㄕㄨˇ")], "認識 1～10、數量和對應"
    counts = [
        ("一顆紅色皮球", 1), ("一顆紅蘋果", 1), ("一顆黃色星星", 1),
        ("一輛紅色小汽車", 1), ("三張選項圖", 3),  # triple apples via options
    ]
    specs_u1 = [
        ("一顆紅色皮球", "1", None),
        ("一顆紅蘋果", "1", None),
        ("一顆黃色星星", "1", None),
        ("一顆白白的牙齒", "1", None),
        ("一隻灰色小貓", "1", None),
        ("一隻黃色小雞", "1", None),
        ("一顆紅色皮球", "2", "兩顆紅色皮球圖"),  # use red-ball twice in options - single image
        ("一隻黃色小狗", "1", None),
        ("一顆紅蘋果", "3", None),
    ]
    for i, (img, ans, prompt_img) in enumerate(specs_u1, 1):
        if i == 7:
            # counting: three balls in options
            questions.append(
                qbase(
                    f"G1-MATH-S1-U1-{i:02d}", 1, t1, tz1, te1, "count_image",
                    "圖中有幾顆皮球？",
                    num_prompt("圖中有幾顆皮球？"),
                    [opt("a", "2"), opt("b", "3", "ㄙㄢ"), opt("c", "5")],
                    "b",
                    "仔細數一數，一共三顆。",
                    image="一顆紅色皮球",
                )
            )
            continue
        n = int(ans)
        prompt = f"圖裡有幾個？"
        questions.append(
            qbase(
                f"G1-MATH-S1-U1-{i:02d}", 1, t1, tz1, te1, "count_image",
                prompt,
                num_prompt(prompt),
                [opt("a", str(max(1, n - 1))), opt("b", str(n)), opt("c", str(n + 1))],
                "b",
                f"數一數，答案是 {n}。",
                image=img,
            )
        )

    # U2 比大小
    t2, tz2, te2 = "誰比較大", [z("誰", "ㄕㄨㄟˊ"), z("比", "ㄅㄧˇ"), z("較", "ㄐㄧㄠˋ"), z("大", "ㄉㄚˋ")], "10 以內比大小"
    pairs = [(7, 3), (5, 8), (6, 6), (9, 4), (2, 10), (4, 7), (8, 1), (10, 6), (3, 5)]
    for i, (a, b) in enumerate(pairs, 1):
        big = "a" if a > b else ("b" if b > a else "c")
        prompt = f"{a} 和 {b}，哪個比較大？"
        questions.append(
            qbase(
                f"G1-MATH-S1-U2-{i:02d}", 2, t2, tz2, te2, "compare_num",
                prompt,
                num_prompt(prompt.replace(str(a), "？").replace(str(b), "？")) if False else [z(c, "") for c in prompt],
                [opt("a", str(a)), opt("b", str(b)), opt("c", "一樣大", "ㄧˋ ㄧㄤˊ ㄉㄚˋ")],
                big,
                f"比一比數字，答案是 {max(a,b) if a!=b else '一樣'}。",
            )
        )

    # U3 加法
    t3, tz3, te3 = "加一加", [z("加", "ㄐㄧㄚ"), z("一", "ㄧ"), z("加", "ㄐㄧㄚ")], "10 以內合併、分合"
    adds = [(2, 3), (1, 4), (3, 2), (5, 1), (4, 4), (2, 5), (6, 2), (3, 3), (1, 6)]
    for i, (a, b) in enumerate(adds, 1):
        s = a + b
        prompt = f"{a} 加 {b} 等於幾？"
        questions.append(
            qbase(
                f"G1-MATH-S1-U3-{i:02d}", 3, t3, tz3, te3, "add_within_10",
                prompt,
                [z(c, "") for c in prompt],
                [opt("a", str(s - 1)), opt("b", str(s)), opt("c", str(s + 1))],
                "b",
                f"{a}+{b}={s}。",
                image="一顆紅蘋果" if i % 2 == 1 else "一顆紅色皮球",
            )
        )

    # U4 減法
    t4, tz4, te4 = "減一減", [z("減", "ㄐㄧㄢˇ"), z("一", "ㄧ"), z("減", "ㄐㄧㄢˇ")], "10 以內拿走"
    subs = [(7, 2), (5, 3), (9, 4), (8, 1), (6, 6), (10, 5), (4, 2), (9, 1), (7, 3)]
    for i, (a, b) in enumerate(subs, 1):
        s = a - b
        prompt = f"{a} 減 {b} 還剩幾？"
        questions.append(
            qbase(
                f"G1-MATH-S1-U4-{i:02d}", 4, t4, tz4, te4, "subtract_within_10",
                prompt,
                [z(c, "") for c in prompt],
                [opt("a", str(s - 1 if s > 0 else 0)), opt("b", str(s)), opt("c", str(s + 1))],
                "b",
                f"{a}-{b}={s}。",
            )
        )

    # U5 形狀時鐘
    t5, tz5, te5 = "形狀與時間", [z("形", "ㄒㄧㄥˊ"), z("狀", "ㄓㄨㄤˋ"), z("與", "ㄩˇ"), z("時", "ㄕˊ"), z("間", "ㄐㄧㄢ")], "認形狀、整點鐘面"
    shape_qs = [
        ("這是什麼形狀？", "一顆紅色皮球", "圓形", "圓形的皮球。", "round"),
        ("這是什麼形狀？", "一扇窗戶", "方形", "窗戶是方方的。", "square"),
        ("這是什麼形狀？", "一顆黃色星星", "星形", "星星有尖尖角。", "star"),
        ("鐘面上長針指 12、短針指 3，是幾點？", "一盞亮亮的檯燈", "3 點", "短針指向 3 是 3 點。", None),
        ("鐘面上短針指 6，是幾點？", None, "6 點", "短針指向 6 是 6 點。", None),
        ("下列哪個像月亮？", "一個彎彎的月亮", "彎月", "彎彎的是月亮。", "moon"),
        ("哪個是三角形？", "一顆黃色星星", "星星", "星星不是三角形。", "tri"),
        ("正方形的東西？", "一張木頭桌子", "桌子", "桌子常常是方方的。", "square2"),
        ("圓圓的？", "一個圓圓的鼻子", "鼻子", "鼻子可以是圓圓的。", "round2"),
    ]
    for i, (prompt, img, correct, explain, tag) in enumerate(shape_qs, 1):
        if tag in ("round", "round2"):
            opts = [opt("a", "圓形", "ㄩㄢˊ ㄒㄧㄥˊ"), opt("b", "方形", "ㄈㄤ ㄒㄧㄥˊ"), opt("c", "星形", "ㄒㄧㄥ ㄒㄧㄥˊ")]
            ans = "a"
        elif tag in ("square", "square2"):
            opts = [opt("a", "圓形", "ㄩㄢˊ ㄒㄧㄥˊ"), opt("b", "方形", "ㄈㄤ ㄒㄧㄥˊ"), opt("c", "三角形", "ㄙㄢ ㄐㄧㄠˇ ㄒㄧㄥˊ")]
            ans = "b"
        elif tag == "star":
            opts = [opt("a", "圓形", "ㄩㄢˊ ㄒㄧㄥˊ"), opt("b", "方形", "ㄈㄤ ㄒㄧㄥˊ"), opt("c", "星形", "ㄒㄧㄥ ㄒㄧㄥˊ")]
            ans = "c"
        elif tag == "moon":
            opts = [opt("a", "太陽", "ㄊㄞˋ ㄧㄤˊ"), opt("b", "彎月", "ㄨㄢ ㄩㄝˋ"), opt("c", "桌子", "ㄓㄨㄛ ㄗ˙")]
            ans = "b"
        elif tag == "tri":
            opts = [opt("a", "三角形", "ㄙㄢ ㄐㄧㄠˇ ㄒㄧㄥˊ"), opt("b", "星星", "ㄒㄧㄥ ㄒㄧㄥ"), opt("c", "皮球", "ㄆㄧˊ ㄑㄧㄡˊ")]
            ans = "a"
        else:
            opts = [opt("a", "2 點"), opt("b", "3 點", "ㄙㄢ ㄉㄧㄢˇ"), opt("c", "5 點")]
            ans = "b" if "3" in correct else "b"
            if "6" in correct:
                opts = [opt("a", "5 點"), opt("b", "6 點", "ㄌㄧㄡˋ ㄉㄧㄢˇ"), opt("c", "8 點")]
                ans = "b"
        questions.append(
            qbase(
                f"G1-MATH-S1-U5-{i:02d}", 5, t5, tz5, te5, "shape_time",
                prompt,
                num_prompt(prompt) if img else [z(c, "") for c in prompt],
                opts,
                ans,
                explain,
                image=img,
            )
        )

    return {
        "title": "學習冒險島｜一年級數學題庫",
        "version": "v9.23",
        "grade": 1,
        "subject": "數學",
        "notes": [
            "全部原創；單元順序參考均一教育一年級常見主題，未複製題目",
            "注音規則同國語模組",
        ],
        "questions": questions,
    }


def build_english():
    questions = []
    tz = lambda s: [z(c, "") for c in s]

    # U1 letters
    t1, tz1, te1 = "字母好朋友", [z("字", "ㄗˋ"), z("母", "ㄇㄨˇ"), z("好", "ㄏㄠˇ"), z("朋", "ㄆㄥˊ"), z("友", "ㄧㄡˇ")], "Aa–Mm 字母與開頭音"
    letter_qs = [
        ("Apple 的開頭是哪個字母？", "A", "a", "Apple", "蘋果是 Apple。"),
        ("Ball 的開頭是哪個字母？", "B", "b", "Ball", "球是 Ball。"),
        ("Cat 的開頭是哪個字母？", "C", "c", "Cat", "貓是 Cat。"),
        ("Dog 的開頭是哪個字母？", "D", "d", "Dog", "狗是 Dog。"),
        ("哪個是母音？", "E", "b", "Egg", "E 是母音之一。"),
        ("Fish 的開頭？", "F", "a", "Fish", "魚是 Fish。"),
        ("哪個字母像門框？", "H", "b", "Hat", "H 有兩根直線。"),
        ("Ice 的開頭？", "I", "c", "Ice", "冰是 Ice。"),
        ("Jump 的開頭？", "J", "a", "Jump", "跳是 Jump。"),
    ]
    for i, (prompt, correct, _ans, speech, explain) in enumerate(letter_qs, 1):
        pool = [correct]
        for w in "ABCDEFGHJKLMZ":
            if w not in pool and len(pool) < 3:
                pool.append(w)
        opts = [opt("a", pool[0]), opt("b", pool[1]), opt("c", pool[2])]
        ans = "a"
        questions.append(
            qbase(
                f"G1-ENG-S1-U1-{i:02d}", 1, t1, tz1, te1, "english_letter",
                prompt,
                tz(prompt),
                opts,
                ans,
                explain,
                speech_en=speech,
            )
        )

    # U2 colors
    t2, tz2, te2 = "彩色世界", [z("彩", "ㄘㄞˇ"), z("色", "ㄙㄜˋ"), z("世", "ㄕˋ"), z("界", "ㄐㄧㄝˋ")], "color words"
    colors = [
        ("一顆紅蘋果", "Red", "紅色", "a"),
        ("一輛藍色汽車", "Blue", "藍色", "a"),
        ("一隻黃色小雞", "Yellow", "黃色", "b"),
        ("一片綠色小草", "Green", "綠色", "b"),
        ("一顆紅色皮球", "Red", "紅色", "a"),
        ("一件藍色上衣", "Blue", "藍色", "b"),
        ("一顆黃色星星", "Yellow", "黃色", "c"),
        ("一隻白色兔子", "White", "白色", "c"),
        ("一頭黑白乳牛", "Black", "黑色", "a"),
    ]
    for i, (img, eng, zh, _) in enumerate(colors, 1):
        questions.append(
            qbase(
                f"G1-ENG-S1-U2-{i:02d}", 2, t2, tz2, te2, "english_color",
                f"這是什麼顏色？（{eng}）",
                tz(f"這是什麼顏色？"),
                [opt("a", "Red"), opt("b", "Blue"), opt("c", "Yellow")],
                {"Red": "a", "Blue": "b", "Yellow": "c", "Green": "b", "White": "c", "Black": "a"}[eng],
                f"英文 {eng} 是{zh}。",
                image=img,
                speech_en=eng,
            )
        )

    # U3 numbers
    t3, tz3, te3 = "數字 1 到 10", [z("數", "ㄕㄨˋ"), z("字", "ㄗˋ"), z("1", ""), z("到", "ㄉㄠˋ"), z("10", "")], "Numbers 1–10"
    nums = [
        ("一顆紅蘋果", "1", "One"),
        ("一顆紅色皮球", "2", "Two"),
        ("一隻黃色小雞", "3", "Three"),
        ("一輛紅色小汽車", "1", "One"),
        ("一顆紅蘋果", "4", "Four"),
        ("一顆黃色星星", "5", "Five"),
        ("一隻灰色小貓", "6", "Six"),
        ("一顆紅色皮球", "7", "Seven"),
        ("一顆紅蘋果", "8", "Eight"),
    ]
    for i, (img, n, eng) in enumerate(nums, 1):
        nn = int(n)
        questions.append(
            qbase(
                f"G1-ENG-S1-U3-{i:02d}", 3, t3, tz3, te3, "english_number",
                "數一數，選英文數字",
                tz("數一數，選英文數字"),
                [opt("a", ["One", "Two", "Three"][0]), opt("b", ["Four", "Five", "Six"][1]), opt("c", ["Seven", "Eight", "Nine"][2])],
                "a",
                f"{eng} 是 {n}。",
                image=img,
                speech_en=eng,
            )
        )
        # fix options per question
        words = {1: "One", 2: "Two", 3: "Three", 4: "Four", 5: "Five", 6: "Six", 7: "Seven", 8: "Eight"}
        w = words[nn]
        wrong = [x for x in ["One", "Two", "Four", "Five", "Nine"] if x != w][:2]
        questions[-1]["options"] = [opt("a", wrong[0]), opt("b", w), opt("c", wrong[1])]
        questions[-1]["answer"] = "b"

    # U4 animals fruits family
    t4, tz4, te4 = "動物與水果", [z("動", "ㄉㄨㄥˋ"), z("物", "ㄨˋ"), z("與", "ㄩˇ"), z("水", "ㄕㄨㄟˇ"), z("果", "ㄍㄨㄛˇ")], "animals, fruits, family words"
    items = [
        ("一隻灰色小貓", "Cat", "貓", "c"),
        ("一隻棕色小熊", "Bear", "熊", "b"),
        ("一頭灰色大象", "Elephant", "大象", "a"),
        ("一顆紅蘋果", "Apple", "蘋果", "a"),
        ("一位微笑的媽媽", "Mom", "媽媽", "b"),
        ("一隻黃色小狗", "Dog", "狗", "c"),
        ("一隻白色兔子", "Rabbit", "兔子", "a"),
        ("一顆紅蘋果", "Apple", "蘋果", "b"),
        ("一匹棕色小馬", "Horse", "馬", "c"),
    ]
    for i, (img, eng, zh, _) in enumerate(items, 1):
        pool = list({eng, "Fish", "Bird"})
        opts = [opt("a", pool[0]), opt("b", pool[1]), opt("c", pool[2])]
        ans = "abc"[pool.index(eng)]
        questions.append(
            qbase(
                f"G1-ENG-S1-U4-{i:02d}", 4, t4, tz4, te4, "english_vocab",
                "看圖選英文單字",
                tz("看圖選英文單字"),
                opts,
                ans,
                f"{eng} 是{zh}。",
                image=img,
                speech_en=eng,
            )
        )

    # U5 phrases
    t5, tz5, te5 = "簡單打招呼", [z("簡", "ㄐㄧㄢˇ"), z("單", "ㄉㄢ"), z("打", "ㄉㄚˇ"), z("招", "ㄓㄠ"), z("呼", "ㄏㄨ")], "Hi, Thank you"
    phrases = [
        ("見到朋友要說什麼？", None, "Hi", "見面說 Hi。"),
        ("別人幫你要說？", None, "Thank you", "要說 Thank you。"),
        ("早上面對老師？", None, "Good morning", "早上 Good morning。"),
        ("道別時？", None, "Bye", "離開說 Bye。"),
        ("這是什麼禮貌用語？", None, "Please", "請求用 Please。"),
        ("收到禮物？", None, "Thank you", "說 Thank you。"),
        ("同學名字是 Tom，怎麼叫他？", None, "Hi Tom", "Hi 加名字。"),
        ("晚安？", None, "Good night", "睡前 Good night。"),
        ("想問好？", None, "Hello", "Hello 也是打招呼。"),
    ]
    for i, (prompt, img, eng, explain) in enumerate(phrases, 1):
        opts = [opt("a", "Hi"), opt("b", "Thank you"), opt("c", "Bye")]
        if eng == "Thank you":
            ans = "b"
        elif eng == "Bye":
            ans = "c"
        elif eng in ("Good morning", "Good night", "Hello", "Hi Tom", "Please"):
            opts = [opt("a", eng), opt("b", "Hi"), opt("c", "No")]
            ans = "a"
        else:
            ans = "a"
        questions.append(
            qbase(
                f"G1-ENG-S1-U5-{i:02d}", 5, t5, tz5, te5, "english_phrase",
                prompt,
                tz(prompt),
                opts,
                ans,
                explain,
                image=img,
                speech_en=eng.split()[0],
            )
        )

    return {
        "title": "學習冒險島｜一年級英語題庫",
        "version": "v9.23",
        "grade": 1,
        "subject": "英語",
        "notes": [
            "全部原創；主題參考一年級入門，未複製教材",
            "可用瀏覽器聽發音（en-US）",
        ],
        "questions": questions,
    }


def main():
    math_bank = build_math()
    eng_bank = build_english()
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "grade1-math.json").write_text(json.dumps(math_bank, ensure_ascii=False, indent=2), encoding="utf-8")
    (OUT / "grade1-english.json").write_text(json.dumps(eng_bank, ensure_ascii=False, indent=2), encoding="utf-8")
    print("math", len(math_bank["questions"]), "units", max(q["unit"] for q in math_bank["questions"]))
    print("english", len(eng_bank["questions"]), "units", max(q["unit"] for q in eng_bank["questions"]))


if __name__ == "__main__":
    main()
