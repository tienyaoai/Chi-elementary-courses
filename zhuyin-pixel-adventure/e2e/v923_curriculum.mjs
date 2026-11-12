/**
 * v9.23: math & english — clear one unit, claim, reload keeps progress; 390 screenshots.
 */
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import path from "node:path";

const ART = "/opt/cursor/artifacts";
const TAG = "v9.23";
const PORT = process.env.E2E_PORT || "8788";
const BASE = process.env.E2E_BASE || `http://127.0.0.1:${PORT}`;

const MATH_UNIT = "G1-MATH-S1-U1";
const ENG_UNIT = "G1-ENG-S1-U1";
const MATH_BANK = JSON.parse(
  readFileSync(path.resolve("..", "static", "data", "grade1-math.json"), "utf8")
);
const ENG_BANK = JSON.parse(
  readFileSync(path.resolve("..", "static", "data", "grade1-english.json"), "utf8")
);
const ANSWERS = Object.fromEntries(
  [...MATH_BANK.questions, ...ENG_BANK.questions].map((q) => [q.id, q.answer])
);

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function pickCharacter(page) {
  await page.goto(BASE, { waitUntil: "networkidle", timeout: 120000 });
  if (await page.locator(".char-grid-12 .char-card").count()) {
    await page.locator(".char-grid-12 .char-card").first().click();
    await page.locator("button.pixel-btn.primary.big-touch").click();
  }
  await page.locator(".island-viewport").first().waitFor({ state: "visible", timeout: 60000 });
  await sleep(400);
}

async function hubViaDoor(page, portalKey) {
  const cfg = JSON.parse(
    readFileSync(path.resolve("..", "src", "map_config.json"), "utf8")
  );
  const [dx, dy] = cfg.door_points_portrait[portalKey];
  await page.evaluate(
    ({ x, y }) => {
      const p = JSON.parse(localStorage.getItem("zhuzhu-pixel-adventure-v1") || "{}");
      p.player_x = x;
      p.player_y = y;
      localStorage.setItem("zhuzhu-pixel-adventure-v1", JSON.stringify(p));
    },
    { x: dx, y: dy + 16 }
  );
  await page.reload({ waitUntil: "networkidle" });
  await sleep(400);
  const bubble = page.locator(`[data-testid="door-bubble"][data-portal="${portalKey}"] button[data-testid="door-enter-btn"]`);
  if (await bubble.count()) {
    await bubble.first().click();
  } else {
    await page.keyboard.press("Enter");
  }
  await sleep(600);
}

async function clearUnit(page, unitId, errors) {
  await page.locator(".unit-island-card").first().waitFor({ timeout: 15000 });
  await page.locator(".unit-island-card").first().click();
  await sleep(400);
  await page.locator(".lesson-panel").waitFor({ timeout: 20000 });
  await page.screenshot({ path: `${ART}/${TAG}-${unitId.includes("MATH") ? "math" : "english"}-unit-play-390.png` });
  let lastQid = "";
  for (let i = 0; i < 12; i++) {
    await page.locator(".lesson-panel").waitFor({ timeout: 15000 });
    const qid = await page.locator(".lesson-panel").getAttribute("data-question-id");
    if (!qid || qid === lastQid) break;
    lastQid = qid;
    const data = ANSWERS[qid];
    if (!data) {
      errors.push(`no answer for ${qid}`);
      break;
    }
    await page.locator("button.opt-pixel").nth("abc".indexOf(data)).click();
    await sleep(1100);
    if (await page.locator(".victory").count()) break;
  }
  await page.locator(".panel-pixel.victory, .victory").first().waitFor({ timeout: 20000 }).catch(() => {});
  if (!(await page.locator(".victory").count())) {
    errors.push(`unit ${unitId} did not reach victory`);
    return;
  }
  await page.locator("button.pixel-btn.primary").first().click();
  await sleep(300);
}

async function assertProgress(page, unitId, errors) {
  const ok = await page.evaluate((uid) => {
    const p = JSON.parse(localStorage.getItem("zhuzhu-pixel-adventure-v1") || "{}");
    return (p.units_cleared || []).includes(uid) && (p.units_claimed || []).includes(uid);
  }, unitId);
  if (!ok) errors.push(`progress missing for ${unitId}`);
}

export async function runV923Curriculum(page, errors = []) {
  mkdirSync(ART, { recursive: true });
  await page.setViewportSize({ width: 390, height: 844 });
  const report = { tag: TAG, math: MATH_UNIT, english: ENG_UNIT, screenshots: [] };

  await hubViaDoor(page, "math");
  if (!(await page.locator(".hub-panel").count())) {
    errors.push("math hub not open");
    await page.screenshot({ path: `${ART}/${TAG}-math-hub-fail-390.png` });
    return report;
  }
  await page.screenshot({ path: `${ART}/${TAG}-math-hub-390.png` });
  report.screenshots.push(`${ART}/${TAG}-math-hub-390.png`);
  await clearUnit(page, MATH_UNIT, errors);
  await assertProgress(page, MATH_UNIT, errors);

  await page.goto(BASE, { waitUntil: "networkidle" });
  await sleep(300);
  await hubViaDoor(page, "english");
  if (!(await page.locator(".hub-panel").count())) errors.push("english hub not open");
  await page.screenshot({ path: `${ART}/${TAG}-english-hub-390.png` });
  report.screenshots.push(`${ART}/${TAG}-english-hub-390.png`);
  await clearUnit(page, ENG_UNIT, errors);
  await assertProgress(page, ENG_UNIT, errors);

  await page.reload({ waitUntil: "networkidle" });
  await sleep(400);
  await assertProgress(page, MATH_UNIT, errors);
  await assertProgress(page, ENG_UNIT, errors);

  writeFileSync(`${ART}/${TAG}-curriculum-report.json`, JSON.stringify(report, null, 2));
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
    await runV923Curriculum(page, errors);
    console.log(JSON.stringify({ ok: errors.length === 0, errors }, null, 2));
    process.exitCode = errors.length ? 1 : 0;
  } finally {
    await browser.close();
    server.kill("SIGTERM");
  }
}
