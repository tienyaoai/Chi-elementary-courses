#!/usr/bin/env node
/**
 * Mid-game character change must survive hub, unit complete, map return, reload, picker.
 */
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const ART = "/opt/cursor/artifacts";
const TAG = process.env.E2E_TAG || "v9.21h";
const BASE = process.env.E2E_BASE || "http://127.0.0.1:8790";
const PORT = new URL(BASE).port || "8790";
const CHAR_KEY = "zhuzhu-pixel-adventure-char-v1";
const PROG_KEY = "zhuzhu-pixel-adventure-v1";

const MAP_CFG = JSON.parse(
  readFileSync(path.resolve("..", "src", "map_config.json"), "utf8")
);
const CHARS = MAP_CFG.characters;
const CHINESE_DOOR = MAP_CFG.door_points_portrait.chinese;
const FROM = CHARS[0];
const TO = CHARS[7] ?? CHARS[3];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function walkUrl(page, charId) {
  const ch = CHARS.find((c) => c.id === charId);
  const w = ch?.walk || ch?.full;
  return w ? `/characters/${w}` : "";
}

async function heroWalkBg(page) {
  return page.evaluate(() => {
    const el = document.querySelector('[data-testid="island-player"]');
    if (!el) return null;
    return getComputedStyle(el).backgroundImage;
  });
}

function parseStoredScalar(raw) {
  if (raw == null) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw.replace(/^"|"$/g, "");
  }
}

async function storedChar(page) {
  return page.evaluate((k) => {
    const raw = localStorage.getItem(k);
    if (raw == null) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return raw.replace(/^"|"$/g, "");
    }
  }, CHAR_KEY);
}

async function progChar(page) {
  return page.evaluate((k) => {
    try {
      return JSON.parse(localStorage.getItem(k) || "{}").character_id || null;
    } catch {
      return null;
    }
  }, PROG_KEY);
}

async function selectedCharId(page) {
  const sel = page.locator(".char-card.selected");
  if (!(await sel.count())) return null;
  return sel.first().getAttribute("data-char-id");
}

async function assertCharStorage(page, label, errors) {
  const key = await storedChar(page);
  if (key !== TO.id) errors.push(`${label}: ${CHAR_KEY} is ${key}`);
  const pid = await progChar(page);
  if (pid && pid !== TO.id) errors.push(`${label}: progress.character_id is ${pid}`);
}

async function assertMapSprite(page, charSlug, label, errors) {
  await assertCharStorage(page, label, errors);
  const bg = await heroWalkBg(page);
  if (!bg || !bg.includes(charSlug)) {
    errors.push(`${label}: map sprite not ${charSlug} (${bg})`);
  }
}

async function setPlayerPos(page, x, y) {
  await page.evaluate(
    ({ x, y, prog }) => {
      const p = JSON.parse(localStorage.getItem(prog) || "{}");
      p.player_x = x;
      p.player_y = y;
      localStorage.setItem(prog, JSON.stringify(p));
    },
    { x, y, prog: PROG_KEY }
  );
  await page.reload({ waitUntil: "networkidle" });
  await page.locator(".island-viewport").first().waitFor({ state: "visible", timeout: 60000 });
  await page.locator('[data-testid="island-player"]').waitFor({ state: "attached", timeout: 60000 });
  await sleep(600);
}

async function doorXY(page) {
  const landscape = await page.evaluate(() =>
    document.querySelector(".shell-map-fit") !== null
  );
  const doors = landscape ? MAP_CFG.door_points_landscape : MAP_CFG.door_points_portrait;
  return doors.chinese;
}

async function enterSchoolHub(page) {
  const [x, y] = await doorXY(page);
  await setPlayerPos(page, x, y);
  await page.locator('[data-testid="door-bubble"]').waitFor({ state: "visible", timeout: 20000 });
  const enter = page.locator('[data-testid="door-enter-btn"]');
  await enter.waitFor({ state: "visible", timeout: 5000 });
  await enter.click({ force: true });
  await page.waitForSelector(".hub-panel", { timeout: 20000 });
}

async function answerCurrentUnit(page) {
  let stagnant = 0;
  while (stagnant < 4) {
    if (await page.locator(".panel-pixel.victory").count()) return;
    const n = await page.locator(".opt-grid button:not([disabled])").count();
    if (!n) {
      stagnant += 1;
      await sleep(500);
      continue;
    }
    stagnant = 0;
    let answered = false;
    for (let i = 0; i < Math.min(n, 4); i++) {
      if (await page.locator(".panel-pixel.victory").count()) return;
      const btn = page.locator(".opt-grid button:not([disabled])").first();
      if (!(await btn.count())) break;
      await btn.click({ timeout: 8000 }).catch(() => {});
      await sleep(1100);
      if (await page.locator(".explain-box, .panel-pixel.victory").count()) {
        answered = true;
        await sleep(1000);
        break;
      }
    }
    if (!answered) stagnant += 1;
  }
}

async function exitHubToMap(page) {
  for (let step = 0; step < 8; step++) {
    if (await page.locator(".island-viewport").count()) break;
    if (await page.locator(".opt-grid").count()) {
      await page.locator("button.lesson-btn").click().catch(() => {});
      await sleep(500);
    }
    if (await page.locator(".panel-pixel.victory").count()) {
      await page.locator(".panel-pixel.victory button.pixel-btn").first().click().catch(() => {});
      await sleep(500);
    }
    if (await page.locator(".hub-panel").count()) {
      await page.locator(".hub-panel button.pixel-btn.ghost.big-touch").click();
      await sleep(500);
      continue;
    }
    const backMap = page.locator("button", { hasText: "回地圖" });
    if (await backMap.count()) {
      await backMap.first().click();
      await sleep(500);
    }
  }
  await page.locator(".island-viewport").first().waitFor({ state: "visible", timeout: 45000 });
  await sleep(400);
}

async function startGame(page, charId) {
  if (!(await page.locator(`[data-char-id="${charId}"]`).count())) {
    await page.goto(BASE, { waitUntil: "networkidle", timeout: 120000 });
  }
  if (!(await page.locator(`[data-char-id="${charId}"]`).count())) {
    const hud = page.locator('[data-testid="hud-change-char"]');
    if (await hud.count()) {
      await hud.click();
    } else {
      await page.evaluate(() => localStorage.clear());
      await page.reload({ waitUntil: "networkidle" });
    }
  }
  await page.locator(`[data-char-id="${charId}"]`).waitFor({ state: "visible", timeout: 30000 });
  await page.locator(`[data-char-id="${charId}"]`).click();
  await page.locator("button.pixel-btn.primary.big-touch").click();
  await page.locator(".island-viewport").first().waitFor({ state: "visible", timeout: 60000 });
  await sleep(500);
}

export async function runCharacterPersist(page, errors = []) {
  mkdirSync(ART, { recursive: true });
  const report = { tag: TAG, from: FROM.id, to: TO.id, steps: [] };

  await page.setViewportSize({ width: 1280, height: 800 });
  await startGame(page, FROM.id);
  const beforeSwap = await heroWalkBg(page);
  if (beforeSwap && !beforeSwap.includes(FROM.slug)) {
    errors.push(`initial hero expected ${FROM.slug} in ${beforeSwap}`);
  }

  await page.locator('[data-testid="hud-change-char"]').click();
  await page.locator(`[data-char-id="${TO.id}"]`).click();
  await sleep(200);
  const picked = await selectedCharId(page);
  if (picked !== TO.id) errors.push(`picker selected ${picked} not ${TO.id}`);
  await page.locator("button.pixel-btn.primary.big-touch").click();
  await page.locator(".island-viewport").first().waitFor({ state: "visible" });
  report.steps.push({ step: "after-picker", char: await storedChar(page), bg: await heroWalkBg(page) });
  await assertMapSprite(page, TO.slug, "after-picker", errors);

  const [dx, dy] = await doorXY(page);
  await setPlayerPos(page, dx, dy);
  await assertMapSprite(page, TO.slug, "after-reload-at-door", errors);

  await enterSchoolHub(page, errors);
  const hubChar = await page.evaluate((toId) => {
    const p = JSON.parse(localStorage.getItem("zhuzhu-pixel-adventure-v1") || "{}");
    const raw = localStorage.getItem("zhuzhu-pixel-adventure-char-v1");
    let k = raw;
    try {
      k = JSON.parse(raw);
    } catch {
      k = raw?.replace(/^"|"$/g, "") ?? null;
    }
    return { prog: p.character_id, key: k, ok: k === toId && (!p.character_id || p.character_id === toId) };
  }, TO.id);
  if (!hubChar.ok) errors.push(`in hub: char storage mismatch ${JSON.stringify(hubChar)}`);
  report.steps.push({ step: "in-hub", hubChar });

  await page.locator(".unit-island-card").first().click();
  await page.waitForSelector(".opt-grid", { timeout: 20000 });
  const inLesson = await progChar(page);
  if (inLesson && inLesson !== TO.id) errors.push(`in lesson progress char ${inLesson}`);

  await answerCurrentUnit(page);
  if (await page.locator(".panel-pixel.victory button").count()) {
    await page.locator(".panel-pixel.victory button.pixel-btn.primary").click();
  }
  await page.locator(".hub-panel").waitFor({ state: "visible", timeout: 15000 }).catch(() => {});
  await assertCharStorage(page, "after-unit-complete", errors);
  report.steps.push({ step: "after-unit", char: await storedChar(page) });

  await exitHubToMap(page);
  await assertMapSprite(page, TO.slug, "after-hub-exit", errors);

  if (!(await page.locator('[data-testid="hud-change-char"]').count())) {
    await exitHubToMap(page);
  }
  await page.locator('[data-testid="hud-change-char"]').click();
  if ((await selectedCharId(page)) !== TO.id) errors.push("picker highlight lost after hub");

  await page.locator("button.pixel-btn.primary.big-touch").click();
  await page.locator(".island-viewport").first().waitFor({ state: "visible" });
  await assertMapSprite(page, TO.slug, "after-second-depart", errors);

  report.rootCause =
    "Depart/start and hub exit reloaded stale progress blobs; movement saves could omit character_id; " +
    "reinject preferred the blob over CHARACTER_KEY; character_by_id/sprites fell back to char1. " +
    "Fixed with CHARACTER_KEY on pick, patch_saved, CHARACTER_KEY-first reinject_character_id.";

  writeFileSync(`${ART}/${TAG}-character-persist-report.json`, JSON.stringify(report, null, 2));
  return report;
}

function startServer() {
  return spawn("python3", ["-m", "http.server", PORT, "--bind", "127.0.0.1"], {
    cwd: path.resolve("..", "dist"),
    stdio: "ignore",
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const errors = [];
  const server = startServer();
  await sleep(500);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  try {
    await runCharacterPersist(page, errors);
    const out = { ok: errors.length === 0, errors, tag: TAG };
    writeFileSync(`${ART}/${TAG}-character-persist-result.json`, JSON.stringify(out, null, 2));
    console.log(JSON.stringify(out, null, 2));
    process.exitCode = errors.length ? 1 : 0;
  } finally {
    await browser.close();
    server.kill("SIGTERM");
  }
}
