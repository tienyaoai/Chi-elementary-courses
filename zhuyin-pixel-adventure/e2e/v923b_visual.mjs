/**
 * v9.23b: screenshot key visual question types + curriculum pass.
 */
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { runV923Curriculum } from "./v923_curriculum.mjs";

const ART = "/opt/cursor/artifacts";
const TAG = "v9.23b";
const PORT = process.env.E2E_PORT || "8788";
const BASE = `http://127.0.0.1:${PORT}`;

const MATH_BANK = JSON.parse(
  readFileSync(path.resolve("..", "static", "data", "grade1-math.json"), "utf8")
);
const ENG_BANK = JSON.parse(
  readFileSync(path.resolve("..", "static", "data", "grade1-english.json"), "utf8")
);
const ANSWERS = Object.fromEntries(
  [...MATH_BANK.questions, ...ENG_BANK.questions].map((q) => [q.id, q.answer])
);

const SCREENSHOTS = [
  { id: "G1-MATH-S1-U1-07", file: `${TAG}-count-7-390.png`, portal: "math" },
  { id: "G1-MATH-S1-U3-01", file: `${TAG}-add-5p2-390.png`, portal: "math" },
  { id: "G1-MATH-S1-U4-01", file: `${TAG}-subtract-7m2-390.png`, portal: "math" },
  { id: "G1-MATH-S1-U5-08", file: `${TAG}-clock-9-390.png`, portal: "math" },
  { id: "G1-MATH-S1-U5-09", file: `${TAG}-triangle-390.png`, portal: "math" },
  { id: "G1-ENG-S1-U2-08", file: `${TAG}-swatch-black-390.png`, portal: "english" },
  { id: "G1-ENG-S1-U4-01", file: `${TAG}-english-vocab-390.png`, portal: "english" },
];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function pickCharacter(page) {
  await page.goto(BASE, { waitUntil: "networkidle", timeout: 120000 });
  if (await page.locator(".char-grid-12 .char-card").count()) {
    await page.locator(".char-grid-12 .char-card").first().click();
    await page.locator("button.pixel-btn.primary.big-touch").click();
  }
  await page.locator(".island-viewport").first().waitFor({ timeout: 60000 });
  await sleep(400);
}

async function openPortalHub(page, portalKey) {
  const cfg = JSON.parse(readFileSync(path.resolve("..", "src", "map_config.json"), "utf8"));
  const [dx, dy] = cfg.door_points_portrait[portalKey];
  await page.evaluate(
    ({ x, y }) => {
      const p = JSON.parse(localStorage.getItem("zhuzhu-pixel-adventure-v1") || "{}");
      p.player_x = x;
      p.player_y = y + 8;
      localStorage.setItem("zhuzhu-pixel-adventure-v1", JSON.stringify(p));
    },
    { x: dx, y: dy }
  );
  await page.reload({ waitUntil: "networkidle" });
  await sleep(350);
  const btn = page.locator(
    `[data-testid="door-bubble"][data-portal="${portalKey}"] button[data-testid="door-enter-btn"]`
  );
  if (await btn.count()) await btn.first().click();
  else await page.keyboard.press("Enter");
  await sleep(500);
}

async function openQuestionById(page, portal, targetId, errors) {
  await openPortalHub(page, portal);
  const unit = [...MATH_BANK.questions, ...ENG_BANK.questions].find((q) => q.id === targetId)?.unit ?? 1;
  const cards = page.locator(".unit-island-card");
  const n = await cards.count();
  await cards.nth(Math.min(unit - 1, n - 1)).click();
  await sleep(400);
  for (let step = 0; step < 15; step++) {
    await page.locator(".lesson-panel").waitFor({ timeout: 15000 });
    const qid = await page.locator(".lesson-panel").getAttribute("data-question-id");
    if (qid === targetId) return true;
    const ans = ANSWERS[qid];
    if (!ans) {
      errors.push(`no answer for ${qid} seeking ${targetId}`);
      return false;
    }
    await page.locator("button.opt-pixel").nth("abc".indexOf(ans)).click();
    await sleep(1050);
  }
  errors.push(`could not reach question ${targetId}`);
  return false;
}

export async function runV923bVisual(page, errors = []) {
  mkdirSync(ART, { recursive: true });
  await page.setViewportSize({ width: 390, height: 844 });
  for (const shot of SCREENSHOTS) {
    const ok = await openQuestionById(page, shot.portal, shot.id, errors);
    if (ok) {
      await page.locator(".lesson-panel").screenshot({ path: `${ART}/${shot.file}` });
    }
  }
  const report = { tag: TAG, screenshots: SCREENSHOTS.map((s) => `${ART}/${s.file}`) };
  writeFileSync(`${ART}/${TAG}-visual-report.json`, JSON.stringify(report, null, 2));
  return report;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const errors = [];
  const dist = path.resolve("..", "dist");
  const server = spawn("python3", ["-m", "http.server", PORT, "--bind", "127.0.0.1"], {
    cwd: dist,
    stdio: "ignore",
  });
  await sleep(600);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await pickCharacter(page);
    await runV923bVisual(page, errors);
    await runV923Curriculum(page, errors);
    console.log(JSON.stringify({ ok: errors.length === 0, errors }, null, 2));
    process.exitCode = errors.length ? 1 : 0;
  } finally {
    await browser.close();
    server.kill("SIGTERM");
  }
}
