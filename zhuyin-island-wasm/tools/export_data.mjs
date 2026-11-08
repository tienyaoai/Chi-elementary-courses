#!/usr/bin/env node
/**
 * 從 zhuyin-island 的 TypeScript 教材匯出 JSON，供 Rust/Wasm 載入。
 * 在 repo 根目錄執行：node zhuyin-island-wasm/tools/export_data.mjs
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const outDir = join(root, "zhuyin-island-wasm/static/data");
mkdirSync(outDir, { recursive: true });

const island = join(root, "zhuyin-island");

const { decks, orderItems, quizItems, stories, themes } = await import(
  join(island, "src/data/content.ts")
);
const { ui, askStep, collectedLine, memoryDetail, quizDetail, stampCount, starCount, storyStep } =
  await import(join(island, "src/data/ui.ts"));
const { readings } = await import(join(island, "src/data/readings.ts"));

const cardTotal = themes.reduce((n, t) => n + t.cards.length, 0);

const payload = {
  readings,
  ui,
  content: { themes, quizItems, orderItems, stories, decks },
  meta: { cardTotal },
  helpers: {
    askStep,
    collectedLine,
    memoryDetail,
    quizDetail,
    stampCount,
    starCount,
    storyStep,
  },
};

writeFileSync(join(outDir, "game.json"), JSON.stringify(payload));
console.log("Wrote", join(outDir, "game.json"));
