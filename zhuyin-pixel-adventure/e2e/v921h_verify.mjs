#!/usr/bin/env node
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { runAutoRepeatWalk } from "./autorepeat_walk.mjs";
import { runCharacterPersist } from "./v921h_character_persist.mjs";
import { runDoorBubbleApproach } from "./door_bubble_approach.mjs";
import { runDoorPathApproach } from "./door_path_approach.mjs";

const ART = "/opt/cursor/artifacts";
const TAG = process.env.E2E_TAG || "v9.21h";
const BASE = process.env.E2E_BASE || "http://127.0.0.1:8788";
const PORT = new URL(BASE).port || "8788";

const MAP_CFG = JSON.parse(
  readFileSync(path.resolve("..", "src", "map_config.json"), "utf8")
);
const doorsPortrait = MAP_CFG.door_points_portrait;
const doorsLandscape = MAP_CFG.door_points_landscape;
const TRIGGER_HW = 30;
const TRIGGER_HH = 26;

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
  await page.locator('[data-testid="island-player"]').waitFor({ state: "attached", timeout: 60000 });
  await sleep(500);
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
  await page.locator(".island-viewport").first().waitFor({ state: "visible", timeout: 60000 });
  await page.locator('[data-testid="island-player"]').waitFor({ state: "attached", timeout: 60000 });
  await sleep(400);
}

async function doorsForViewport(page) {
  const fit = await page.evaluate(() => document.querySelector(".shell-map-fit") !== null);
  return fit ? doorsLandscape : doorsPortrait;
}

async function readHeroFrame(page) {
  return page.evaluate(() => {
    const el = document.querySelector('[data-testid="island-player"]');
    return {
      row: el?.getAttribute("data-walk-row"),
      col: el?.getAttribute("data-walk-col"),
      active: el?.getAttribute("data-walk-active"),
    };
  });
}

/** Distance from door point (px) at which bubble first becomes visible when approaching. */
async function measureDoorBubble(page, key, doors) {
  const [dx, dy] = doors[key];
  const probes = [];
  let appearAtDoor = false;
  let firstAppearDist = null;
  let maxDistWhileVisible = 0;
  const offsets = [
    ...Array.from({ length: 45 }, (_, i) => [58 - i * 2, 0]),
    [0, 0],
    [TRIGGER_HW + 12, 0],
    [TRIGGER_HW + 28, 0],
    [0, TRIGGER_HH + 12],
    [0, TRIGGER_HH + 30],
  ];
  for (const [ox, oy] of offsets) {
    const x = dx + ox;
    const y = dy + oy;
    await setPos(page, x, y);
    const bubble = (await page.locator('[data-testid="door-bubble"]').count()) > 0;
    const dist = Math.hypot(ox, oy);
    probes.push({ x, y, ox, oy, bubble, distFromDoor: +dist.toFixed(1) });
    if (ox === 0 && oy === 0) appearAtDoor = bubble;
    if (bubble) {
      if (firstAppearDist == null) firstAppearDist = dist;
      maxDistWhileVisible = Math.max(maxDistWhileVisible, dist);
    }
  }
  // outside trigger: step east until bubble off
  let outsideClearDist = null;
  for (let ox = TRIGGER_HW + 32; ox <= 72; ox += 4) {
    await setPos(page, dx + ox, dy);
    const bubble = (await page.locator('[data-testid="door-bubble"]').count()) > 0;
    if (!bubble) {
      outsideClearDist = ox;
      break;
    }
  }
  return {
    building: key,
    door: [dx, dy],
    bubbleAtDoor: appearAtDoor,
    appearDistancePx: firstAppearDist,
    maxVisibleDistancePx: maxDistWhileVisible,
    clearsOutsideDistancePx: outsideClearDist,
    triggerHalfW: TRIGGER_HW,
    triggerHalfH: TRIGGER_HH,
    probes,
  };
}

async function facingKeyboardAfterStop(page, dir, expectedRow, spawn = [720, 1020]) {
  const keys = {
    ArrowRight: "ArrowRight",
    ArrowLeft: "ArrowLeft",
    ArrowUp: "ArrowUp",
    ArrowDown: "ArrowDown",
  };
  await setPos(page, spawn[0], spawn[1]);
  await page.locator(".hud-title").click({ force: true }).catch(() => {});
  const k = keys[dir];
  await page.keyboard.down(k);
  await sleep(700);
  for (let i = 0; i < 10; i++) {
    await page.keyboard.press(k);
    await sleep(45);
  }
  await sleep(200);
  await page.keyboard.up(k);
  await sleep(250);
  const hero = await readHeroFrame(page);
  return {
    input: "keyboard-autorepeat",
    dir,
    hero,
    expectedRow,
    ok: hero?.row === String(expectedRow) && hero?.col === "0" && hero?.active === "false",
  };
}

async function facingPadAfterStop(page, padTestId, dir, expectedRow, spawn = [720, 1020]) {
  await setPos(page, spawn[0], spawn[1]);
  const pad = page.locator(`[data-testid="${padTestId}"]`);
  if (!(await pad.count())) {
    return { input: "pad", padTestId, dir, ok: false, error: "missing pad" };
  }
  await pad.dispatchEvent("pointerdown");
  await sleep(900);
  await pad.dispatchEvent("pointerup");
  await sleep(300);
  const hero = await readHeroFrame(page);
  return {
    input: "pad",
    padTestId,
    dir,
    hero,
    expectedRow,
    ok: hero?.row === String(expectedRow) && hero?.col === "0" && hero?.active === "false",
  };
}

export async function runV921hVerify(page, errors = []) {
  mkdirSync(ART, { recursive: true });
  const report = { tag: TAG, bubble: {}, facing: { keyboard: {}, pad: {} }, screenshots: {} };

  for (const [w, h, tag] of [
    [1280, 800, "1280x800"],
    [390, 844, "390x844"],
  ]) {
    await page.setViewportSize({ width: w, height: h });
    await pickCharacter(page);
    await sleep(600);
    const shot = `${ART}/${TAG}-map-no-ovals-${tag}.png`;
    await page.locator(".island-viewport").screenshot({ path: shot });
    report.screenshots[tag] = shot;
  }

  // Door bubble distances (1280 fit = landscape doors)
  await page.setViewportSize({ width: 1280, height: 800 });
  await pickCharacter(page);
  const doors1280 = await doorsForViewport(page);
  report.bubble.viewport1280 = { orient: "landscape-fit", buildings: {} };
  for (const key of Object.keys(doors1280)) {
    const m = await measureDoorBubble(page, key, doors1280);
    report.bubble.viewport1280.buildings[key] = m;
    writeFileSync(`${ART}/${TAG}-door-bubble-${key}-1280.json`, JSON.stringify(m, null, 2));
    if (!m.bubbleAtDoor) errors.push(`bubble ${key}@1280: not at door point`);
    if (m.appearDistancePx == null) errors.push(`bubble ${key}@1280: never appeared`);
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await pickCharacter(page);
  report.bubble.viewport390 = { orient: "portrait-follow", buildings: {} };
  for (const key of Object.keys(doorsPortrait)) {
    const m = await measureDoorBubble(page, key, doorsPortrait);
    report.bubble.viewport390.buildings[key] = m;
    writeFileSync(`${ART}/${TAG}-door-bubble-${key}-390.json`, JSON.stringify(m, null, 2));
    if (!m.bubbleAtDoor) errors.push(`bubble ${key}@390: not at door point`);
    if (m.appearDistancePx == null) errors.push(`bubble ${key}@390: never appeared`);
  }

  const rows = { ArrowRight: 2, ArrowLeft: 1, ArrowUp: 3, ArrowDown: 0 };
  const padNames = {
    ArrowRight: ["fit-pad-right", "pad-right"],
    ArrowLeft: ["fit-pad-left", "pad-left"],
    ArrowUp: ["fit-pad-up", "pad-up"],
    ArrowDown: ["fit-pad-down", "pad-down"],
  };

  await page.setViewportSize({ width: 1280, height: 800 });
  await pickCharacter(page);
  const spawnL = [MAP_CFG.spawn_landscape.x, MAP_CFG.spawn_landscape.y];
  for (const [dir, row] of Object.entries(rows)) {
    const r = await facingKeyboardAfterStop(page, dir, row, spawnL);
    report.facing.keyboard[`1280-${dir}`] = r;
    if (!r.ok) errors.push(`facing keyboard 1280 ${dir}: row=${r.hero?.row} col=${r.hero?.col}`);
    const pr = await facingPadAfterStop(page, padNames[dir][0], dir, row, spawnL);
    report.facing.pad[`1280-${dir}`] = pr;
    if (!pr.ok) errors.push(`facing pad 1280 ${dir}: ${pr.error ?? `row=${pr.hero?.row}`}`);
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await pickCharacter(page);
  const spawnP = [MAP_CFG.spawn_portrait.x, MAP_CFG.spawn_portrait.y];
  for (const [dir, row] of Object.entries(rows)) {
    const r = await facingKeyboardAfterStop(page, dir, row, spawnP);
    report.facing.keyboard[`390-${dir}`] = r;
    if (!r.ok) errors.push(`facing keyboard 390 ${dir}: row=${r.hero?.row}`);
    const pr = await facingPadAfterStop(page, padNames[dir][1], dir, row, spawnP);
    report.facing.pad[`390-${dir}`] = pr;
    if (!pr.ok) errors.push(`facing pad 390 ${dir}: ${pr.error ?? `row=${pr.hero?.row}`}`);
  }

  await runAutoRepeatWalk(page, errors);

  report.doorApproach = await runDoorBubbleApproach(page, errors);
  report.doorPathApproach = await runDoorPathApproach(page, errors);

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.evaluate(() => localStorage.clear());
  await page.goto(BASE, { waitUntil: "networkidle", timeout: 120000 });
  await runCharacterPersist(page, errors);

  writeFileSync(`${ART}/${TAG}-door-bubble-report.json`, JSON.stringify(report.bubble, null, 2));
  writeFileSync(`${ART}/${TAG}-facing-report.json`, JSON.stringify(report.facing, null, 2));
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
