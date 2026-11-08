import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { plain, transcribe } from "../src/lib/bpmf.ts";
import { decks, orderItems, quizItems, stories, themes } from "../src/data/content.ts";
import {
  askStep,
  collectedLine,
  memoryDetail,
  quizDetail,
  stampCount,
  starCount,
  storyStep,
  ui,
} from "../src/data/ui.ts";

const golden: ReadonlyArray<readonly [string, string]> = [
  ["一個", "一(ㄧˊ)個(ㄍㄜˋ)"],
  ["一隻", "一(ㄧˋ)隻(ㄓ)"],
  ["一條", "一(ㄧˋ)條(ㄊㄧㄠˊ)"],
  ["不是", "不(ㄅㄨˊ)是(ㄕˋ)"],
  ["不好", "不(ㄅㄨˋ)好(ㄏㄠˇ)"],
  ["不去", "不(ㄅㄨˊ)去(ㄑㄩˋ)"],
  ["不會", "不(ㄅㄨˊ)會(ㄏㄨㄟˋ)"],
  ["一起", "一(ㄧˋ)起(ㄑㄧˇ)"],
  ["看一看", "看(ㄎㄢˋ)一(ㄧˊ)看(ㄎㄢˋ)"],
  ["睡覺{1}", "睡(ㄕㄨㄟˋ)覺(ㄐㄧㄠˋ)"],
  ["小少{1}朋友", "小(ㄒㄧㄠˇ)少(ㄕㄠˋ)朋(ㄆㄥˊ)友(ㄧㄡˇ)"],
  ["為{1}什麼", "為(ㄨㄟˋ)什(ㄕㄣˊ)麼(˙ㄇㄜ)"],
  ["爸爸{1}", "爸(ㄅㄚˋ)爸(˙ㄅㄚ)"],
  ["媽媽{1}", "媽(ㄇㄚ)媽(˙ㄇㄚ)"],
  ["「一」和「不」", "「一(ㄧ)」和(ㄏㄜˊ)「不(ㄅㄨˋ)」"],
  ["聽一聽", "聽(ㄊㄧㄥ)一(ㄧˋ)聽(ㄊㄧㄥ)"],
  ["一次", "一(ㄧˊ)次(ㄘˋ)"],
  ["不一樣", "不(ㄅㄨˋ)一(ㄧˊ)樣(ㄧㄤˋ)"],
  ["一共", "一(ㄧˊ)共(ㄍㄨㄥˋ)"],
  ["一年級", "一(ㄧˋ)年(ㄋㄧㄢˊ)級(ㄐㄧˊ)"],
  ["點一點", "點(ㄉㄧㄢˇ)一(ㄧˋ)點(ㄉㄧㄢˇ)"],
  ["下一題", "下(ㄒㄧㄚˋ)一(ㄧˋ)題(ㄊㄧˊ)"],
  ["下一句", "下(ㄒㄧㄚˋ)一(ㄧˊ)句(ㄐㄩˋ)"],
  ["兔子{1}", "兔(ㄊㄨˋ)子(˙ㄗ)"],
  ["耳朵{1}", "耳(ㄦˇ)朵(˙ㄉㄨㄛ)"],
  ["肚子{1}", "肚(ㄉㄨˋ)子(˙ㄗ)"],
  ["謝謝{1}", "謝(ㄒㄧㄝˋ)謝(˙ㄒㄧㄝ)"],
];

const failures: string[] = [];

function fail(message: string): void {
  failures.push(message);
}

for (const [input, expected] of golden) {
  const actual = transcribe(input);
  if (actual !== expected) fail(`變調不符：${input}\n  期望 ${expected}\n  實際 ${actual}`);
}

function walk(value: unknown, path: string, bucket: Array<{ path: string; text: string }>): void {
  if (typeof value === "string") {
    if (/\p{Script=Han}/u.test(value)) bucket.push({ path, text: value });
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => walk(item, `${path}[${index}]`, bucket));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      if (typeof item === "function") continue;
      walk(item, `${path}.${key}`, bucket);
    }
  }
}

const strings: Array<{ path: string; text: string }> = [];
walk(ui, "ui", strings);
walk(
  [collectedLine(0), collectedLine(12), stampCount(3, 24), askStep(1, 8), storyStep(2, 2), quizDetail(6, 8), memoryDetail(12), starCount(3)],
  "dynamic",
  strings,
);
walk({ quizItems, orderItems, stories, themes, decks }, "content", strings);

const transcript: string[] = [];
for (const item of strings) {
  const line = transcribe(item.text);
  transcript.push(`${item.path}\t${line}`);
  if (line.includes("(?)")) fail(`缺讀音 ${item.path}：${line}`);
}

for (const item of quizItems) {
  if (!item.options.includes(item.answer)) fail(`答案不在選項裡：${item.id}`);
  if (new Set(item.options.map((option) => plain(option))).size !== item.options.length) {
    fail(`選項重複：${item.id}`);
  }
}
for (const item of orderItems) {
  if (new Set(item.chunks).size !== item.chunks.length) fail(`詞語重複：${item.id}`);
  if (item.chunks.length < 3) fail(`句子太短：${item.id}`);
}
for (const story of stories) {
  for (const question of story.questions) {
    if (!question.options.includes(question.answer)) fail(`故事答案不在選項：${story.id} ${question.ask}`);
  }
}

const ids = [
  ...quizItems.map((item) => item.id),
  ...orderItems.map((item) => item.id),
  ...stories.map((item) => item.id),
  ...themes.flatMap((theme) => theme.cards.map((card) => card.id)),
];
if (new Set(ids).size !== ids.length) fail("題目編號重複");

function listFiles(dir: string): string[] {
  const found: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) found.push(...listFiles(full));
    else if (name.endsWith(".tsx")) found.push(full);
  }
  return found;
}

for (const file of listFiles(join(import.meta.dirname, "../src"))) {
  const text = readFileSync(file, "utf8");
  if (/\p{Script=Han}/u.test(text)) fail(`畫面檔裡不該直接寫國字：${file}`);
}

console.log(transcript.join("\n"));
console.log(`\n檢查了 ${strings.length} 句。`);
if (failures.length > 0) {
  console.error(`\n${failures.length} 個問題：`);
  for (const message of failures) console.error(`- ${message}`);
  process.exit(1);
}
console.log("注音檢查通過。");
