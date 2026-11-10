#!/usr/bin/env node
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { createReadStream, writeFileSync } from "node:fs";
import { PNG } from "pngjs";
import path from "node:path";

const ART = "/opt/cursor/artifacts";
const TAG = process.env.E2E_TAG || "v9.4";
const FIT_MIN = 700;
const DIST = path.resolve("..", "dist");
const BASE = process.env.E2E_BASE || "http://127.0.0.1:8765";
const PORT = new URL(BASE).port || "8765";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function blueRatioPng(file) {
  return new Promise((resolve, reject) => {
    createReadStream(file)
      .pipe(new PNG())
      .on("parsed", function () {
        let blue = 0;
        const total = this.width * this.height;
        for (let y = 0; y < this.height; y++) {
          for (let x = 0; x < this.width; x++) {
            const i = (this.width * y + x) << 2;
            const r = this.data[i];
            const g = this.data[i + 1];
            const b = this.data[i + 2];
            // 視窗舊版純藍底 #5ab0e8
            if (r >= 78 && r <= 102 && g >= 160 && g <= 195 && b >= 215 && b <= 245) {
              blue++;
            }
          }
        }
        resolve({ blue, total, ratio: blue / total });
      })
      .on("error", reject);
  });
}

async function startServer() {
  return spawn("python3", ["-m", "http.server", PORT, "--bind", "127.0.0.1"], {
    cwd: DIST,
    stdio: "ignore",
  });
}

async function pickCharacter(page) {
  await page.waitForSelector(".char-grid-12 .char-card", { timeout: 120000 });
  await page.locator(".char-grid-12 .char-card").first().click();
  await sleep(200);
  const start = page.locator("button.pixel-btn.primary.big-touch");
  await start.waitFor({ state: "visible", timeout: 60000 });
  await expectEnabled(start, page);
  await start.click();
}

async function expectEnabled(locator, page) {
  await page.waitForFunction(
    (sel) => {
      const el = document.querySelector(sel);
      return el && !el.disabled;
    },
    "button.pixel-btn.primary.big-touch",
    { timeout: 60000 }
  );
}

async function waitMapReady(page) {
  await page.waitForSelector(".island-viewport", { timeout: 60000 });
  await page.waitForFunction(
    () => !document.body.textContent.includes("地圖載入中"),
    { timeout: 120000 }
  );
  await sleep(800);
}

async function assertViewportMode(page, mode, errors) {
  const cls = mode === "fit" ? "island-viewport-fit" : "island-viewport-follow";
  const has = await page.locator(`.island-viewport.${cls}`).count();
  if (!has) {
    const vp = page.viewportSize();
    errors.push(`expected .${cls} at ${vp?.width}x${vp?.height}`);
  }
}

async function assertMapViewportNotScrollable(page, errors) {
  const ok = await page.evaluate(() => {
    const vp = document.querySelector(".island-viewport");
    if (!vp) return false;
    return vp.scrollHeight <= vp.clientHeight + 1 && vp.scrollWidth <= vp.clientWidth + 1;
  });
  if (!ok) errors.push("island-viewport has internal scroll");
}

async function assertFourLandmarksInViewport(page, errors) {
  const vp = page.locator(".island-viewport");
  const vpb = await vp.boundingBox();
  if (!vpb) {
    errors.push("no island-viewport box");
    return;
  }
  for (const cls of ["lm-chinese", "lm-english", "lm-math", "lm-treasure"]) {
    const loc = page.locator(`.island-landmark.${cls}`);
    if (!(await loc.count())) {
      errors.push(`missing landmark .${cls}`);
      continue;
    }
    const visible = await loc.isVisible();
    if (!visible) errors.push(`${cls} not visible`);
    const box = await loc.boundingBox();
    if (!box) {
      errors.push(`${cls} no bounding box`);
      continue;
    }
    const inside =
      box.x >= vpb.x - 2 &&
      box.y >= vpb.y - 2 &&
      box.x + box.width <= vpb.x + vpb.width + 2 &&
      box.y + box.height <= vpb.y + vpb.height + 2;
    if (!inside) errors.push(`${cls} outside viewport`);
  }
}

async function legacyBlankBlueRatio(file) {
  const br = await blueRatioPng(file);
  return br.ratio;
}

function intersectArea(a, b) {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);
  if (x2 <= x1 || y2 <= y1) return 0;
  return (x2 - x1) * (y2 - y1);
}

async function assertFitLabels(page, errors) {
  const pairs = [
    ["chinese", "lm-chinese"],
    ["english", "lm-english"],
    ["math", "lm-math"],
    ["treasure", "lm-treasure"],
  ];
  const labelBoxes = [];
  for (const [key] of pairs) {
    const label = page.locator(`[data-testid="fit-label-${key}"]`);
    const lm = page.locator(`[data-testid="landmark-${key}"]`);
    const lb = await label.boundingBox();
    const mb = await lm.boundingBox();
    if (!lb || !mb) {
      errors.push(`fit label/landmark box missing ${key}`);
      continue;
    }
    labelBoxes.push({ key, ...lb });
    const inter = intersectArea(lb, mb);
    const lmArea = mb.width * mb.height;
    if (lmArea > 0 && inter / lmArea > 0.15) {
      errors.push(
        `${key} label covers ${((inter / lmArea) * 100).toFixed(0)}% of landmark (max 15%)`
      );
    }
  }
  for (let i = 0; i < labelBoxes.length; i++) {
    for (let j = i + 1; j < labelBoxes.length; j++) {
      const inter = intersectArea(labelBoxes[i], labelBoxes[j]);
      if (inter > 6) {
        errors.push(
          `labels ${labelBoxes[i].key} & ${labelBoxes[j].key} overlap ${inter.toFixed(0)}px²`
        );
      }
    }
  }
}

async function assertPlayerHeightFit(page, errors, minPx = 64) {
  const hasFit = await page.locator(".island-viewport-fit").count();
  if (!hasFit) return;
  const height = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="island-player"]');
    return el ? el.getBoundingClientRect().height : 0;
  });
  if (height < minPx - 2) {
    errors.push(`player screen height ${height.toFixed(0)} < ${minPx}px in fit mode`);
  }
}

async function runFitDesktopSuite(page, shots, errors) {
  const sizes = [
    [1280, 800],
    [1920, 1080],
    [1024, 768],
  ];
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.evaluate(() => localStorage.clear());
  await page.goto(BASE, { waitUntil: "networkidle" });
  await pickCharacter(page);
  await waitMapReady(page);
  for (const [w, h] of sizes) {
    await page.setViewportSize({ width: w, height: h });
    await page.reload({ waitUntil: "networkidle" });
    await waitMapReady(page);
    const minSide = Math.min(w, h);
    if (minSide < FIT_MIN) {
      errors.push(`${w}x${h} below fit threshold`);
    }
    await assertViewportMode(page, "fit", errors);
    await assertFourLandmarksInViewport(page, errors);
    await assertFitLabels(page, errors);
    await assertPlayerHeightFit(page, errors);
    const vpShot = `${ART}/${TAG}-viewport-${w}x${h}.png`;
    await page.screenshot({ path: vpShot });
    shots.push(vpShot);
    const shot = `${ART}/${TAG}-map-${w}x${h}.png`;
    await page.locator(".island-viewport").screenshot({ path: shot });
    shots.push(shot);
    const blank = await legacyBlankBlueRatio(shot);
    if (blank >= 0.12) {
      errors.push(`fit ${w}x${h} legacy blue blank ${(blank * 100).toFixed(1)}% >= 12%`);
    }
  }

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.reload({ waitUntil: "networkidle" });
  await waitMapReady(page);
  await page.evaluate(() => {
    const p = JSON.parse(localStorage.getItem("zhuzhu-pixel-adventure-v1"));
    p.player_x = 812;
    p.player_y = 824;
    localStorage.setItem("zhuzhu-pixel-adventure-v1", JSON.stringify(p));
  });
  await page.reload({ waitUntil: "networkidle" });
  await waitMapReady(page);
  await sleep(800);
  const enter = page.locator('[data-testid="enter-portal"]');
  try {
    await enter.waitFor({ state: "visible", timeout: 15000 });
  } catch {
  }
  if (await enter.count()) {
    await enter.click({ force: true });
    await sleep(800);
    await page.locator(".unit-island-card").first().click();
    await page.waitForSelector(".opt-grid button", { timeout: 30000 });
    const quizShot = `${ART}/${TAG}-quiz-1280-fit.png`;
    await page.screenshot({ path: quizShot, fullPage: true });
    shots.push(quizShot);
    await page.locator(".opt-grid button").first().click();
    await sleep(1200);
  } else {
    errors.push("fit mode: enter portal not visible at school (1280)");
  }
}

async function tapDir(page, label, times = 1) {
  const btn = page.locator(".pad-btn", { hasText: label });
  for (let i = 0; i < times; i++) {
    await btn.click();
    await sleep(60);
  }
}

async function playerPos(page) {
  return page.evaluate(() => {
    const raw = localStorage.getItem("zhuzhu-pixel-adventure-v1");
    if (!raw) return null;
    const p = JSON.parse(raw);
    return { x: p.player_x, y: p.player_y, id: p.character_id };
  });
}

async function main() {
  const shots = [];
  const server = await startServer();
  await sleep(500);
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errors = [];
  let br = { blue: 0, total: 0, ratio: 0 };

  try {
    // --- Mobile select ---
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(BASE, { waitUntil: "load", timeout: 120000 });
    await page.waitForSelector(".char-grid-12, .loading-pixel", { timeout: 120000 });
    await page.waitForFunction(
      () => document.querySelector(".char-grid-12") !== null,
      { timeout: 120000 }
    );
    await page.waitForSelector(".char-grid-12", { timeout: 60000 });
    const p1 = `${ART}/${TAG}-select-390-full.png`;
    await page.screenshot({ path: p1, fullPage: true });
    shots.push(p1);

    await pickCharacter(page);
    await waitMapReady(page);
    await assertViewportMode(page, "follow", errors);
    const mapShot = `${ART}/${TAG}-map-390x844.png`;
    const vpShot390 = `${ART}/${TAG}-viewport-390x844.png`;
    await page.screenshot({ path: vpShot390 });
    shots.push(vpShot390);
    const vp = page.locator(".island-viewport");
    await vp.screenshot({ path: mapShot });
    shots.push(mapShot);
    br = await blueRatioPng(mapShot);
    if (br.ratio >= 0.3) {
      errors.push(`map blue ratio ${(br.ratio * 100).toFixed(1)}% >= 30%`);
    }

    // Walk toward bridge / school
    await tapDir(page, "▲", 28);
    await tapDir(page, "▶", 8);
    const bridgeShot = `${ART}/${TAG}-map-bridge-390.png`;
    await vp.screenshot({ path: bridgeShot });
    shots.push(bridgeShot);

    // Try water: click top-center of viewport (likely lake on map)
    const box = await vp.boundingBox();
    const before = await playerPos(page);
    await vp.click({ position: { x: Math.floor(box.width * 0.52), y: Math.floor(box.height * 0.28) } });
    await sleep(1200);
    const after = await playerPos(page);
    if (before && after) {
      const moved = Math.hypot(after.x - before.x, after.y - before.y);
      if (moved > 40) {
        errors.push(`water click moved player ${moved.toFixed(0)}px (expected blocked)`);
      }
    }

    // Near school
    await page.evaluate(() => {
      const p = JSON.parse(localStorage.getItem("zhuzhu-pixel-adventure-v1"));
      p.player_x = 360;
      p.player_y = 1120;
      localStorage.setItem("zhuzhu-pixel-adventure-v1", JSON.stringify(p));
    });
    await page.reload({ waitUntil: "networkidle" });
    await waitMapReady(page);
    await sleep(400);
    const schoolShot = `${ART}/${TAG}-map-school-390.png`;
    await vp.screenshot({ path: schoolShot });
    shots.push(schoolShot);

    const enter = page.locator('[data-testid="enter-portal"]');
    if (await enter.count()) {
      await enter.click({ force: true });
      await sleep(800);
      await page.locator(".unit-island-card").first().click();
      await page.waitForSelector(".opt-grid button", { timeout: 30000 });
      const quizShot = `${ART}/${TAG}-quiz-390.png`;
      await page.screenshot({ path: quizShot, fullPage: true });
      shots.push(quizShot);
      await page.locator(".opt-grid button").first().click();
      await sleep(1500);
      await page.locator("button.lesson-btn").first().click({ force: true });
      await sleep(600);
      await page.locator(".hub-panel button.ghost.big-touch").click({ force: true });
      await sleep(600);
    } else {
      errors.push("enter portal not visible at school");
    }

    await waitMapReady(page);
    await page.evaluate(() => {
      const p = JSON.parse(localStorage.getItem("zhuzhu-pixel-adventure-v1"));
      p.player_x = 350;
      p.player_y = 1370;
      localStorage.setItem("zhuzhu-pixel-adventure-v1", JSON.stringify(p));
    });
    await page.reload({ waitUntil: "networkidle" });
    await waitMapReady(page);
    if (await enter.count()) {
      await enter.click({ force: true });
      await sleep(500);
      const chestShot = `${ART}/${TAG}-treasure-390.png`;
      await page.screenshot({ path: chestShot, fullPage: true });
      shots.push(chestShot);
      await page.locator(".collection-panel button.primary").click({ force: true });
      await sleep(400);
    }

    const beforeId = await playerPos(page);
    await page.reload({ waitUntil: "networkidle" });
    await waitMapReady(page);
    const afterId = await playerPos(page);
    await page.evaluate(() => {
      const p = JSON.parse(localStorage.getItem("zhuzhu-pixel-adventure-v1"));
      p.player_x = 360;
      p.player_y = 1245;
      localStorage.setItem("zhuzhu-pixel-adventure-v1", JSON.stringify(p));
    });
    await page.reload({ waitUntil: "networkidle" });
    await waitMapReady(page);
    const landmarksShot = `${ART}/${TAG}-map-landmarks-390.png`;
    await vp.screenshot({ path: landmarksShot });
    shots.push(landmarksShot);

    const refreshShot = `${ART}/${TAG}-refresh-390.png`;
    await vp.screenshot({ path: refreshShot });
    shots.push(refreshShot);
    if (beforeId?.id && afterId?.id && beforeId.id !== afterId.id) {
      errors.push("character lost after refresh");
    }

    await runFitDesktopSuite(page, shots, errors);

    const summary = {
      ok: errors.length === 0,
      errors,
      screenshots: shots,
      blueCheck: br,
      fitThresholdPx: FIT_MIN,
    };
    writeFileSync(`${ART}/${TAG}-e2e-result.json`, JSON.stringify(summary, null, 2));
    console.log(JSON.stringify(summary, null, 2));
    if (errors.length) process.exitCode = 1;
  } finally {
    await browser.close();
    server.kill("SIGTERM");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
