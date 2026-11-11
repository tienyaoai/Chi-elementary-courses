#!/usr/bin/env node
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { runAutoRepeatWalk } from "./autorepeat_walk.mjs";
import { runCharacterPersist } from "./v921h_character_persist.mjs";

const ART = "/opt/cursor/artifacts";
const TAG = process.env.E2E_TAG || "v9.21h";
const BASE = process.env.E2E_BASE || "http://127.0.0.1:8788";
const PORT = new URL(BASE).port || "8788";

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
}

async function setPos(page, x, y) {
  await page.evaluate(
    ({ x, y }) => {
      const p = JSON.parse(localStorage.getItem("zhuzhu-pixel-adventure-v1") || "{}");
      p.player_x = x;
      p.player_y = y;
      localStorage.setItem("zhuzhu-pixel-adventure-v1", JSON.stringify(p));
    },
    { x, y }
  );
  await page.reload({ waitUntil: "networkidle" });
  await page.locator(".island-viewport").first().waitFor({ state: "visible" });
  await sleep(400);
}

const MAP_CFG = JSON.parse(
  readFileSync(path.resolve("..", "src", "map_config.json"), "utf8")
);
const doorsPortrait = MAP_CFG.door_points_portrait;
const doorsLandscape = MAP_CFG.door_points_landscape;

const TRIGGER_HW = 30;
const TRIGGER_HH = 26;

async function measureBubbleAppearance(page, door, orient) {
  const [dx, dy] = door;
  const samples = [];
  const steps = [
    [dx, dy],
    [dx + TRIGGER_HW + 8, dy],
    [dx + TRIGGER_HW + 24, dy],
    [dx, dy + TRIGGER_HH + 8],
    [dx, dy + TRIGGER_HH + 28],
  ];
  for (const [x, y] of steps) {
    await setPos(page, x, y);
    const bubble = await page.locator('[data-testid="door-bubble"]').count();
    samples.push({ x, y, bubble: bubble > 0, dist: Math.hypot(x - dx, y - dy).toFixed(1) });
  }
  const appear = steps.findIndex((_, i) => samples[i].bubble);
  const far = samples.find((s) => !s.bubble && Math.hypot(s.x - dx, s.y - dy) > TRIGGER_HW + 4);
  return { door, samples, firstWithBubbleAt: appear >= 0 ? samples[appear] : null, farSample: far };
}

async function facingAfterStop(page, dir, expectedRow) {
  const keys = { ArrowRight: "ArrowRight", ArrowLeft: "ArrowLeft", ArrowUp: "ArrowUp", ArrowDown: "ArrowDown" };
  await setPos(page, 720, 1020);
  await page.locator(".hud-title").click({ force: true }).catch(() => {});
  await page.keyboard.down(keys[dir]);
  await sleep(900);
  await page.keyboard.up(keys[dir]);
  await sleep(200);
  const hero = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="island-player"]');
    return {
      row: el?.getAttribute("data-walk-row"),
      col: el?.getAttribute("data-walk-col"),
      active: el?.getAttribute("data-walk-active"),
    };
  });
  return { dir, hero, expectedRow, ok: hero?.row === String(expectedRow) && hero?.col === "0" && hero?.active === "false" };
}

export async function runV921hVerify(page, errors = []) {
  mkdirSync(ART, { recursive: true });
  const report = { tag: TAG, bubble: {}, facing: {} };

  for (const [w, h, tag] of [
    [1280, 800, "1280x800"],
    [390, 844, "390x844"],
  ]) {
    await page.setViewportSize({ width: w, height: h });
    await pickCharacter(page);
    await sleep(600);
    const shot = `${ART}/${TAG}-map-no-ovals-${tag}.png`;
    await page.locator(".island-viewport").screenshot({ path: shot });
    report[`map_${tag}`] = shot;
  }

  await page.setViewportSize({ width: 1280, height: 800 });
  await pickCharacter(page);
  const bubblePortrait = {};
  for (const key of Object.keys(doorsPortrait)) {
    const m = await measureBubbleAppearance(page, doorsPortrait[key], "portrait");
    bubblePortrait[key] = m;
    if (!m.firstWithBubbleAt) errors.push(`bubble ${key}: never appeared at door`);
    if (m.farSample && m.farSample.bubble)
      errors.push(`bubble ${key}: visible too far at dist ${m.farSample.dist}`);
  }
  report.bubble.portrait = bubblePortrait;

  report.facing = {};
  const rows = { ArrowRight: 2, ArrowLeft: 1, ArrowUp: 3, ArrowDown: 0 };
  for (const [dir, row] of Object.entries(rows)) {
    const r = await facingAfterStop(page, dir, row);
    report.facing[dir] = r;
    if (!r.ok) errors.push(`facing-after-stop ${dir}: got row=${r.hero?.row} col=${r.hero?.col}`);
  }

  await runAutoRepeatWalk(page, errors);
  await page.evaluate(() => localStorage.clear());
  await runCharacterPersist(page, errors);

  writeFileSync(`${ART}/${TAG}-verify-report.json`, JSON.stringify(report, null, 2));
  return report;
}

function startServer() {
  const dist = path.resolve("..", "dist");
  return spawn("python3", ["-m", "http.server", PORT, "--bind", "127.0.0.1"], {
    cwd: dist,
    stdio: "ignore",
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const errors = [];
  const server = startServer();
  await sleep(500);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await runV921hVerify(page, errors);
    const out = { ok: errors.length === 0, errors, tag: TAG };
    writeFileSync(`${ART}/${TAG}-e2e-result.json`, JSON.stringify(out, null, 2));
    console.log(JSON.stringify(out, null, 2));
    process.exitCode = errors.length ? 1 : 0;
  } finally {
    await browser.close();
    server.kill("SIGTERM");
  }
}
