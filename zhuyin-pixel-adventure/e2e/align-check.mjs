#!/usr/bin/env node
/**
 * Acceptance check: each building's "enter feel" vs 國語學校.
 *
 * Usage:
 *   node /workspace/door-debug/align-check.mjs <baseURL>
 *
 * Optional env:
 *   ALIGN_DOORS   path to doors JSON (default: same-folder proposed-doors.json)
 *   OUT_DIR       screenshot/json output dir (default: /workspace/door-debug/align-check-out)
 *
 * Thresholds (vs 國語 in the same viewport):
 *   - bubble still visible 1s after stop, Enter enters the building
 *   - bubble-appear distance to stop within 4px of 國語
 *   - visual feet-to-door-steps-bottom dx/dy within 4px of 國語
 *   - no sideways slide while holding Up (|Δx| ≤ 4)
 * Treasure is measured but not scored.
 */
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";

const HERE_PKG = path.join(path.dirname(fileURLToPath(import.meta.url)), "package.json");
const require = createRequire(HERE_PKG);
const { chromium } = require("playwright");

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.BASE_URL || process.argv[2];
if (!BASE) {
  console.error("Usage: node align-check.mjs <baseURL>");
  process.exit(2);
}
const DOORS_PATH =
  process.env.ALIGN_DOORS || path.join(HERE, "proposed-doors.json");
const OUT = process.env.OUT_DIR || "/opt/cursor/artifacts/v9.24f-door-align";
mkdirSync(OUT, { recursive: true });

const doorsFile = JSON.parse(readFileSync(DOORS_PATH, "utf8"));

const BUILDINGS = [
  { key: "chinese", enter: "hub", align: true },
  { key: "math", enter: "hub", align: true },
  { key: "english", enter: "hub", align: true },
  { key: "bulletin", enter: "bulletin", align: true },
  { key: "treasure", enter: "treasure", align: false },
];
const VIEWPORTS = [
  { id: "phone390", width: 390, height: 844, hasTouch: true, isMobile: true, orient: "portrait", label: "390x844 portrait" },
  { id: "desktop1280", width: 1280, height: 800, hasTouch: false, isMobile: false, orient: "landscape", label: "1280x800 landscape" },
];
const SPRITE_DOOR = {
  chinese: { steps: [0.500, 0.991] },
  math: { steps: [0.386, 0.947] },
  english: { steps: [0.487, 0.988] },
  treasure: { steps: [0.500, 0.980] },
  bulletin: { steps: [0.500, 1.000] },
};
const TH = 4;
/** Playwright walk timing can shift bubble-first by ~1 frame (±5px) vs 國語 in the same run. */
const TH_APPEAR = 5;

async function playerPos(page) {
  return page.evaluate(() => {
    const el = document.querySelector('[data-testid="island-player"]');
    if (!el) return null;
    return {
      x: parseFloat(el.getAttribute("data-world-x") || "nan"),
      y: parseFloat(el.getAttribute("data-world-y") || "nan"),
    };
  });
}
async function bubbleInfo(page) {
  return page.evaluate(() => {
    const el = document.querySelector('[data-testid="door-bubble"]');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight;
    return {
      portal: el.getAttribute("data-portal"),
      visible: r.width > 0 && r.height > 0,
      box: { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) },
      clipped: r.left < 0 || r.top < 0 || r.right > vw + 1 || r.bottom > vh + 1,
    };
  });
}
async function sceneMetrics(page, key) {
  return page.evaluate((key) => {
    const player = document.querySelector('[data-testid="island-player"]');
    const pr = player?.getBoundingClientRect();
    // Visual boots = rendered sprite bottom (follow-mode wrap quirk included).
    const feet = pr ? { x: pr.left + pr.width / 2, y: pr.bottom } : null;
    const bub = document.querySelector('[data-testid="door-bubble"]');
    const br = bub?.getBoundingClientRect();
    const lm = document.querySelector(`[data-testid="landmark-${key}"]`);
    const lr = lm?.getBoundingClientRect();
    return {
      world: player
        ? { x: parseFloat(player.getAttribute("data-world-x") || "nan"), y: parseFloat(player.getAttribute("data-world-y") || "nan") }
        : null,
      feetCss: feet && { x: +feet.x.toFixed(2), y: +feet.y.toFixed(2) },
      bubbleBox: br && { x: +br.x.toFixed(1), y: +br.y.toFixed(1), w: +br.width.toFixed(1), h: +br.height.toFixed(1) },
      landmarkBox: lr && { x: +lr.x.toFixed(2), y: +lr.y.toFixed(2), w: +lr.width.toFixed(2), h: +lr.height.toFixed(2) },
    };
  }, key);
}
function doorAlign(metrics, key) {
  const lr = metrics.landmarkBox;
  const feet = metrics.feetCss;
  const frac = SPRITE_DOOR[key];
  if (!lr || !feet || !frac) return null;
  const steps = { x: lr.x + frac.steps[0] * lr.w, y: lr.y + frac.steps[1] * lr.h };
  return {
    stepsCss: { x: +steps.x.toFixed(2), y: +steps.y.toFixed(2) },
    dxSteps: +(feet.x - steps.x).toFixed(2),
    dySteps: +(feet.y - steps.y).toFixed(2),
  };
}
async function enteredWhere(page, kind) {
  if (kind === "hub") return page.evaluate(() => !!document.querySelector(".hub-panel"));
  if (kind === "bulletin") return page.evaluate(() => !!document.querySelector(".bulletin-panel"));
  if (kind === "treasure") {
    return page.evaluate(() => !document.querySelector(".island-viewport") && !!document.querySelector(".panel-pixel"));
  }
  return false;
}
async function waitMap(page) {
  await page.locator(".island-viewport").first().waitFor({ timeout: 60000 });
  await page.locator('[data-testid="island-player"]').first().waitFor({ timeout: 30000 });
  await sleep(350);
}
async function startFresh(page, url) {
  await page.goto(url + (url.includes("?") ? "&" : "?") + "x=" + Math.random(), { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.evaluate(() => { try { localStorage.clear(); } catch {} });
  await page.reload({ waitUntil: "domcontentloaded", timeout: 120000 });
  const cards = page.locator(".char-grid-12 .char-card, [data-testid='char-card']");
  await cards.first().waitFor({ timeout: 60000 });
  await cards.first().click();
  await page.locator("button.pixel-btn.primary.big-touch").click();
  await waitMap(page);
}
async function teleport(page, x, y) {
  await page.evaluate(({ x, y }) => {
    const key = "zhuzhu-pixel-adventure-v1";
    const p = JSON.parse(localStorage.getItem(key) || "{}");
    p.player_x = x;
    p.player_y = y;
    localStorage.setItem(key, JSON.stringify(p));
  }, { x, y });
  await page.reload({ waitUntil: "domcontentloaded", timeout: 120000 });
  const cards = page.locator(".char-grid-12 .char-card, [data-testid='char-card']");
  if (await cards.count()) {
    try {
      await cards.first().click({ timeout: 1500 });
      const go = page.locator("button.pixel-btn.primary.big-touch");
      if (await go.count()) await go.click();
    } catch {}
  }
  await waitMap(page);
}
/** If +100 snapped away, try closer southern points. */
async function teleportSouthOfDoor(page, dx, dy) {
  const candidates = [
    [dx, dy + 100],
    [dx, dy + 70],
    [dx, dy + 40],
    [dx, dy + 28],
    [dx - 16, dy + 80],
    [dx + 16, dy + 80],
    [dx - 24, dy + 100],
    [dx + 24, dy + 100],
  ];
  let best = null;
  for (const [x, y] of candidates) {
    await teleport(page, x, y);
    const pos = await playerPos(page);
    if (!pos) continue;
    const dist = Math.hypot(pos.x - x, pos.y - y);
    if (dist < 30) return { start: pos, requested: { x, y }, snapped: false };
    if (!best || dist < best.dist) best = { start: pos, requested: { x, y }, snapped: true, dist };
  }
  return best || { start: await playerPos(page), requested: { x: dx, y: dy + 100 }, snapped: true };
}
async function backToMap(page) {
  for (const s of ["button:has-text('回地圖')", "button:has-text('離開')", "button:has-text('返回')", "button:has-text('地圖')"]) {
    const loc = page.locator(s);
    if (await loc.count()) {
      await loc.first().click();
      await sleep(400);
      if (await page.locator(".island-viewport").count()) return;
    }
  }
  await page.keyboard.press("Escape");
  await sleep(400);
}
async function holdUntilStop(page, key, maxMs = 3500) {
  const samples = [];
  let firstBubble = null;
  let lastPos = await playerPos(page);
  let stable = 0;
  const t0 = Date.now();
  await page.keyboard.down(key);
  while (Date.now() - t0 < maxMs) {
    await sleep(30);
    const pos = await playerPos(page);
    const bub = await bubbleInfo(page);
    samples.push({ t: Date.now() - t0, pos, bubble: bub });
    if (bub && bub.visible && !firstBubble) firstBubble = { t: Date.now() - t0, pos, bubble: bub };
    if (pos && lastPos && Math.hypot(pos.x - lastPos.x, pos.y - lastPos.y) < 0.15) {
      stable += 30;
      if (stable >= 180) break;
    } else stable = 0;
    lastPos = pos;
  }
  await page.keyboard.up(key);
  await sleep(80);
  const end = { t: Date.now() - t0, pos: await playerPos(page), bubble: await bubbleInfo(page) };
  samples.push(end);
  return { samples, firstBubble, end };
}

function doorOf(orient, key) {
  const pts = orient === "portrait" ? doorsFile.door_points_portrait : doorsFile.door_points_landscape;
  return { x: pts[key][0], y: pts[key][1] };
}

function score(row, baseline) {
  const issues = [];
  if (!row.align) return { pass: true, skip: true, issues: ["treasure measured only"] };
  if (!row.bubbleAtStopAfter1s) issues.push("no bubble at stop after 1s");
  if (!row.enter?.entered) issues.push("Enter did not enter");
  if (row.slid) issues.push(`slid sideways Δx=${row.driftX}`);
  if (baseline) {
    if (row.appearDistPx == null || baseline.appearDistPx == null) {
      issues.push("missing appearDist");
    } else if (Math.abs(row.appearDistPx - baseline.appearDistPx) > TH_APPEAR) {
      issues.push(`appearDist ${row.appearDistPx} vs 國語 ${baseline.appearDistPx} (Δ>${TH_APPEAR})`);
    }
    // Bulletin uses a freestanding sign (sign_points_*); feet-to-sign sill ≠ school door sill.
    if (row.building !== "bulletin") {
      const a = row.doorAlign,
        b = baseline.doorAlign;
      if (!a || !b) issues.push("missing feet-to-door measurement");
      else {
        if (Math.abs(a.dxSteps - b.dxSteps) > TH) issues.push(`dxSteps ${a.dxSteps} vs 國語 ${b.dxSteps}`);
        if (Math.abs(a.dySteps - b.dySteps) > TH) issues.push(`dySteps ${a.dySteps} vs 國語 ${b.dySteps}`);
      }
    }
  }
  return { pass: issues.length === 0, issues };
}

const results = [];
const browser = await chromium.launch({ headless: true, args: ["--disable-dev-shm-usage", "--no-sandbox"] });

for (const vp of VIEWPORTS) {
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 2,
    isMobile: vp.isMobile,
    hasTouch: vp.hasTouch,
    userAgent: vp.isMobile
      ? "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
      : "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    locale: "zh-TW",
  });
  await context.addInitScript(() => {
    window.__ISLAND_API__ = window.__ISLAND_API__ || "http://127.0.0.1:8787";
  });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  console.log(`\n======== ${vp.label}  ${BASE} ========`);
  try {
    await startFresh(page, BASE);
    const byKey = {};
    for (const b of BUILDINGS) {
      const door = doorOf(vp.orient, b.key);
      const tag = `${vp.id}_${b.key}`;
      const landed = await teleportSouthOfDoor(page, door.x, door.y);
      const start = landed.start;
      const walk = await holdUntilStop(page, "ArrowUp", 4000);
      const stopPos = walk.end.pos;
      const driftX = start && stopPos ? +(stopPos.x - start.x).toFixed(2) : null;
      await sleep(1000);
      const after1s = { pos: await playerPos(page), bubble: await bubbleInfo(page) };
      const metrics = await sceneMetrics(page, b.key);
      const align = doorAlign(metrics, b.key);
      const stopShot = path.join(OUT, `${tag}_stop.png`);
      await page.screenshot({ path: stopShot, fullPage: false });

      let enterRes = { attempted: false, entered: false };
      if (after1s.bubble && after1s.bubble.visible) {
        enterRes.attempted = true;
        await page.keyboard.press("Enter");
        await sleep(700);
        enterRes.entered = await enteredWhere(page, b.enter);
        if (enterRes.entered) await backToMap(page);
      }

      const appearDist =
        walk.firstBubble && stopPos && walk.firstBubble.pos
          ? +Math.hypot(stopPos.x - walk.firstBubble.pos.x, stopPos.y - walk.firstBubble.pos.y).toFixed(2)
          : null;

      // Horizontal sweep at stop/door row
      const rowY = stopPos ? stopPos.y : door.y;
      const xs = [];
      let ySlide = 0;
      await teleport(page, door.x - 80, rowY);
      const hL = await holdUntilStop(page, "ArrowRight", 2200);
      for (const s of hL.samples) {
        if (s.bubble?.visible && s.pos) {
          xs.push(s.pos.x);
          ySlide = Math.max(ySlide, Math.abs(s.pos.y - rowY));
        }
      }
      await teleport(page, door.x + 80, rowY);
      const hR = await holdUntilStop(page, "ArrowLeft", 2200);
      for (const s of hR.samples) {
        if (s.bubble?.visible && s.pos) {
          xs.push(s.pos.x);
          ySlide = Math.max(ySlide, Math.abs(s.pos.y - rowY));
        }
      }

      const row = {
        viewport: vp.label,
        orient: vp.orient,
        building: b.key,
        align: b.align,
        doorPoint: door,
        startWorld: start,
        stopWorld: stopPos,
        driftX,
        slid: driftX != null && Math.abs(driftX) > TH,
        appearDistPx: appearDist,
        bubbleAtStopAfter1s: !!(after1s.bubble && after1s.bubble.visible),
        bubblePortalAtStop: after1s.bubble?.portal || null,
        bubbleClipped: !!after1s.bubble?.clipped,
        enter: enterRes,
        doorAlign: align,
        horizXRange: xs.length ? [+Math.min(...xs).toFixed(2), +Math.max(...xs).toFixed(2)] : null,
        horizYSlide: +ySlide.toFixed(2),
        stopShot,
      };
      byKey[b.key] = row;
      results.push(row);
      const mark = b.key === "chinese" ? "BASE" : "";
      console.log(
        `  ${b.key.padEnd(9)} stop=(${stopPos?.x?.toFixed?.(1)},${stopPos?.y?.toFixed?.(1)}) ` +
          `appear=${appearDist} bub1s=${row.bubbleAtStopAfter1s} enter=${enterRes.entered} ` +
          `dx=${align?.dxSteps} dy=${align?.dySteps} drift=${driftX} ${mark}`
      );
    }
    const base = byKey.chinese;
    console.log("  ---- vs 國語 ----");
    for (const b of BUILDINGS) {
      const row = byKey[b.key];
      const sc = score(row, base);
      row.pass = sc.pass;
      row.issues = sc.issues;
      const flag = sc.skip ? "INFO" : sc.pass ? "PASS" : "FAIL";
      console.log(`  ${flag.padEnd(4)} ${b.key.padEnd(9)} ${sc.issues.join("; ") || "ok"}`);
    }
  } catch (err) {
    console.error("ERROR", vp.id, err);
    results.push({ viewport: vp.label, error: String(err && err.stack || err), pass: false });
  } finally {
    await context.close();
  }
}

await browser.close();
writeFileSync(path.join(OUT, "align-check.json"), JSON.stringify(results, null, 2));

const scored = results.filter((r) => r.building && r.align && !r.error);
const fails = scored.filter((r) => !r.pass);
console.log("\n======== SUMMARY ========");
console.log(`doors file: ${DOORS_PATH}`);
console.log(`output:     ${OUT}`);
console.log(`scored: ${scored.length}  PASS: ${scored.length - fails.length}  FAIL: ${fails.length}`);
process.exit(fails.length ? 1 : 0);
