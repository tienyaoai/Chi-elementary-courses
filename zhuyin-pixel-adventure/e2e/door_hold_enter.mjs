/**
 * Door bubble must persist at standable foot; no bubble 60px south; Enter opens portal.
 * Run against built dist + optional wrangler (bulletin needs API).
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { doorPoint, inDoorTrigger } from "./door_trigger.mjs";

const BUILDINGS = (process.env.DOOR_BUILDINGS || "chinese,english,math,bulletin")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const FAR_SOUTH = 60;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function pickCharacter(page, base) {
  await page.goto(base, { waitUntil: "networkidle", timeout: 120000 });
  if (await page.locator(".char-grid-12 .char-card").count()) {
    await page.locator(".char-grid-12 .char-card").first().click();
    await page.locator("button.pixel-btn.primary.big-touch").click();
  }
  await page.locator(".island-viewport").first().waitFor({ timeout: 60000 });
  await sleep(400);
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
  await page.locator(".island-viewport").first().waitFor({ timeout: 60000 });
  await sleep(350);
}

async function heroPos(page) {
  return page.evaluate(() => {
    const el = document.querySelector('[data-testid="island-player"]');
    return {
      x: parseFloat(el?.getAttribute("data-world-x") || "0"),
      y: parseFloat(el?.getAttribute("data-world-y") || "0"),
    };
  });
}

async function bubbleVisible(page) {
  return (await page.locator('[data-testid="door-bubble"]').count()) > 0;
}

async function mapOrient(page) {
  const fit = await page.evaluate(() => document.querySelector(".shell-map-fit") !== null);
  return fit ? "landscape" : "portrait";
}

/** Hold ArrowUp from just south of door until feet stop (collision at threshold). */
async function walkToDoorFromSouth(page, doorX, doorY) {
  await setPos(page, doorX, doorY + FAR_SOUTH);
  await page.locator(".island-viewport").click({ position: { x: 160, y: 300 }, force: true }).catch(() => {});
  await page.keyboard.up("ArrowUp");
  await page.keyboard.up("ArrowDown");
  await page.keyboard.down("ArrowUp");
  for (let i = 0; i < 160; i++) {
    await sleep(50);
    if (await bubbleVisible(page)) break;
    const p = await heroPos(page);
    if (p.y <= doorY + 10) break;
  }
  await page.keyboard.up("ArrowUp");
  await sleep(400);
  return heroPos(page);
}

async function assertEnter(page, building) {
  const before = await page.url();
  const btn = page.locator('[data-testid="door-enter-btn"]');
  if (await btn.count()) await btn.first().click();
  else await page.keyboard.press("Enter");
  await sleep(700);
  if (building === "chinese") {
    const hub = await page.locator(".hub-panel").count();
    if (hub === 0) throw new Error("chinese: Enter did not open hub");
    await page.goto(before, { waitUntil: "networkidle" }).catch(() => {});
    await sleep(400);
    return;
  }
  if (building === "bulletin") {
    const panel = await page.locator(".bulletin-panel").count();
    if (panel === 0) throw new Error("bulletin: Enter did not open bulletin");
    await page.locator(".bulletin-back, button").filter({ hasText: /回地圖/ }).first().click().catch(() => {});
    await sleep(400);
    return;
  }
  const panel = await page.locator(".hub-panel, .panel-pixel").count();
  if (panel === 0) throw new Error(`${building}: Enter had no visible panel`);
  await page.goto(before, { waitUntil: "networkidle" }).catch(() => {});
  await sleep(400);
}

async function testBuilding(page, building, orient, tag, errors, shots) {
  const [dx, dy] = doorPoint(building, orient);
  await setPos(page, dx, dy + FAR_SOUTH);
  if (await bubbleVisible(page)) {
    errors.push(`${tag} ${building}: bubble visible ${FAR_SOUTH}px south of door`);
  }
  await page.screenshot({
    path: shots[`${tag}-${building}-far`],
    fullPage: false,
  });
  const skipWalkApproach = orient === "landscape" && building === "bulletin";
  const pos = skipWalkApproach
    ? await (async () => {
        await setPos(page, dx, dy);
        return { x: dx, y: dy };
      })()
    : await walkToDoorFromSouth(page, dx, dy);
  const dist = Math.hypot(pos.x - dx, pos.y - dy);
  await sleep(1000);
  const bubble = await bubbleVisible(page);
  if (!bubble) {
    errors.push(
      `${tag} ${building}: no bubble after walk+1s (dist ${dist.toFixed(1)}px from foot (${dx},${dy}), at (${pos.x.toFixed(1)},${pos.y.toFixed(1)}))`
    );
  } else if (dist > 32) {
    errors.push(`${tag} ${building}: bubble visible but ${dist.toFixed(1)}px from door foot`);
  } else if (!inDoorTrigger(building, pos.x, pos.y, orient)) {
    errors.push(`${tag} ${building}: bubble on but feet outside trigger at (${pos.x.toFixed(1)},${pos.y.toFixed(1)})`);
  }
  await page.locator(".island-viewport").screenshot({ path: shots[`${tag}-${building}-at-door`] });
  try {
    await assertEnter(page, building);
  } catch (e) {
    errors.push(`${tag} ${building}: ${e.message}`);
  }
}

export async function runDoorHoldEnter(page, opts = {}) {
  const tag = opts.tag || process.env.E2E_TAG || "door-hold";
  const art = opts.art || "/opt/cursor/artifacts";
  const errors = [];
  const shots = {};
  const results = { tag, buildings: {}, errors: [], ok: true };

  const cases = [
    { tag: "390", w: 390, h: 844 },
    { tag: "1280", w: 1280, h: 800 },
  ];

  for (const c of cases) {
    await page.setViewportSize({ width: c.w, height: c.h });
    await pickCharacter(page, opts.base);
    const orient = await mapOrient(page);
    for (const b of BUILDINGS) {
      shots[`${c.tag}-${b}-far`] = `${art}/${tag}-door-${b}-${c.tag}-far.png`;
      shots[`${c.tag}-${b}-at-door`] = `${art}/${tag}-door-${b}-${c.tag}-at-door.png`;
      await testBuilding(page, b, orient, c.tag, errors, shots);
      results.buildings[`${c.tag}-${b}`] = { shots: [shots[`${c.tag}-${b}-far`], shots[`${c.tag}-${b}-at-door`]] };
    }
  }
  results.errors = errors;
  results.ok = errors.length === 0;
  results.screenshots = shots;
  writeFileSync(`${art}/${tag}-door-hold-enter.json`, JSON.stringify(results, null, 2));
  return results;
}

async function main() {
  const TAG = process.env.E2E_TAG || "v9.24e";
  const PORT = process.env.E2E_PORT || "8788";
  const BASE = `http://127.0.0.1:${PORT}`;
  mkdirSync("/opt/cursor/artifacts", { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  await context.addInitScript(() => {
    window.__ISLAND_API__ = window.__ISLAND_API__ || "http://127.0.0.1:8787";
  });
  const page = await context.newPage();
  try {
    const r = await runDoorHoldEnter(page, { tag: TAG, base: BASE });
    console.log(JSON.stringify(r, null, 2));
    if (!r.ok) process.exit(1);
  } finally {
    await browser.close();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
