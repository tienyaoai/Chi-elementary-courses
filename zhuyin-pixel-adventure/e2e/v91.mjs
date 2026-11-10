#!/usr/bin/env node
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { createReadStream, writeFileSync } from "node:fs";
import { PNG } from "pngjs";
import path from "node:path";

const ART = "/opt/cursor/artifacts";
const TAG = process.env.E2E_TAG || "v9.8";
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

async function assertNoVerticalScroll(page, errors) {
  const scroll = await page.evaluate(() => ({
    sh: document.documentElement.scrollHeight,
    ch: document.documentElement.clientHeight,
  }));
  if (scroll.sh > scroll.ch + 2) {
    errors.push(`vertical scroll ${scroll.sh} > ${scroll.ch}`);
  }
}

async function assertMapAreaTall(page, errors, minRatio = 0.7) {
  const vp = page.viewportSize();
  const map = await page.locator(".island-viewport-fit").boundingBox();
  if (!vp || !map) {
    errors.push("fit map box missing for height ratio");
    return;
  }
  const ratio = map.height / vp.height;
  if (ratio < minRatio - 0.02) {
    errors.push(`map height ratio ${(ratio * 100).toFixed(0)}% < ${minRatio * 100}%`);
  }
}

async function assertPlayerInsideMap(page, errors) {
  const map = await page.locator(".island-viewport-fit").boundingBox();
  const player = await page.locator('[data-testid="island-player"]').boundingBox();
  if (!map || !player) {
    errors.push("player/map box missing for inside check");
    return;
  }
  const inside =
    player.x >= map.x - 2 &&
    player.y >= map.y - 2 &&
    player.x + player.width <= map.x + map.width + 2 &&
    player.y + player.height <= map.y + map.height + 2;
  if (!inside) errors.push("player bbox not fully inside map viewport");
}

async function assertHintStripZhuyinInViewport(page, errors) {
  const ok = await page.evaluate(() => {
    const dock = document.querySelector('[data-testid="fit-hint-strip"]');
    if (!dock) return { missing: true };
    const db = dock.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const bad = [];
    dock.querySelectorAll(".bpmf-glyph, .bpmf-col, .han").forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return;
      if (
        r.bottom > db.bottom + 10 ||
        r.top < db.top - 2 ||
        r.right > vw - 0.5 ||
        r.left < -0.5
      ) {
        bad.push({
          cls: el.className,
          bottom: Math.round(r.bottom),
          dockBottom: Math.round(db.bottom),
        });
      }
    });
    return { bad };
  });
  if (ok.missing) {
    errors.push("fit-hint-strip missing for zhuyin check");
    return;
  }
  if (ok.bad?.length) {
    errors.push(`hint strip zhuyin clipped: ${JSON.stringify(ok.bad.slice(0, 4))}`);
  }
}

async function assertHintOutsideMap(page, errors) {
  const map = await page.locator(".island-viewport-fit").boundingBox();
  const dock = await page.locator(".action-dock-fit-below").boundingBox();
  if (!map || !dock) {
    errors.push("fit map or hint dock-below missing");
    return;
  }
  if (dock.y < map.y + map.height - 1) {
    errors.push("hint strip overlaps map viewport (dock top above map bottom)");
  }
  const inter = intersectArea(map, dock);
  if (inter > 4) errors.push(`hint strip intersects map by ${inter.toFixed(0)}px²`);
}

async function assertChestNotUnderLabels(page, errors) {
  const chest = await page.locator('[data-testid="landmark-treasure"]').boundingBox();
  if (!chest) {
    errors.push("treasure chest missing for label overlap check");
    return;
  }
  const chestArea = chest.width * chest.height;
  for (const key of ["chinese", "treasure", "math", "english"]) {
    const lb = await page.locator(`[data-testid="fit-label-${key}"]`).boundingBox();
    if (!lb) continue;
    const inter = intersectArea(lb, chest);
    if (chestArea > 0 && inter / chestArea > 0.12) {
      errors.push(`label ${key} covers ${((inter / chestArea) * 100).toFixed(0)}% of chest sprite`);
    }
  }
}

async function assertChestVisible(page, errors) {
  const chest = await page.locator('[data-testid="landmark-treasure"]').boundingBox();
  if (!chest || chest.width < 8 || chest.height < 8) {
    errors.push("treasure chest sprite not visible");
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

async function playerScreenPos(page) {
  return page.evaluate(() => {
    const el = document.querySelector('[data-testid="island-player"]');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
}

async function assertFitPlayerMoves(page, errors) {
  const p0 = await playerScreenPos(page);
  const prog0 = await page.evaluate(() => {
    const p = JSON.parse(localStorage.getItem("zhuzhu-pixel-adventure-v1"));
    return p.player_x;
  });
  if (!p0) {
    errors.push("fit movement: player missing");
    return;
  }
  await page.locator("main.shell-map-fit").focus();
  for (let i = 0; i < 10; i++) {
    await page.locator("main.shell-map-fit").press("ArrowRight");
    await sleep(20);
  }
  await sleep(500);
  const prog1 = await page.evaluate(() => {
    const p = JSON.parse(localStorage.getItem("zhuzhu-pixel-adventure-v1"));
    return p.player_x;
  });
  const p1 = await playerScreenPos(page);
  const moved =
    (p1 && p1.x - p0.x >= 40) || (typeof prog1 === "number" && prog1 - prog0 > 40);
  if (!moved) {
    errors.push(
      `fit movement: keyboard ArrowRight screen ${p1 ? (p1.x - p0.x).toFixed(0) : "n/a"}px world ${typeof prog1 === "number" ? (prog1 - prog0).toFixed(0) : "n/a"}`
    );
  }
  const map = page.locator(".island-viewport-fit");
  const box = await map.boundingBox();
  const pl = await page.locator('[data-testid="island-player"]').boundingBox();
  if (!box || !pl) {
    errors.push("fit movement: map bbox missing for click");
    return;
  }
  const relX = Math.min(
    box.width - 8,
    Math.max(8, pl.x - box.x - Math.min(120, box.width * 0.14))
  );
  const relY = pl.y - box.y + pl.height * 0.35;
  await map.click({ position: { x: relX, y: relY } });
  await sleep(2200);
  const p2 = await playerScreenPos(page);
  if (!p2 || Math.hypot(p2.x - p1.x, p2.y - p1.y) < 40) {
    errors.push(
      `fit movement: click-to-walk delta ${p2 ? Math.hypot(p2.x - p1.x, p2.y - p1.y).toFixed(0) : "n/a"}px`
    );
  }
  const beforePad = await playerScreenPos(page);
  for (let i = 0; i < 8; i++) {
    await page.locator('[data-testid="fit-pad-right"]').click();
    await sleep(50);
  }
  await sleep(400);
  const afterPad = await playerScreenPos(page);
  if (!beforePad || !afterPad || afterPad.x - beforePad.x < 40) {
    errors.push(
      `fit movement: on-screen right pad delta ${beforePad && afterPad ? (afterPad.x - beforePad.x).toFixed(0) : "n/a"}px`
    );
  }
  const prog = await page.evaluate(() => {
    const p = JSON.parse(localStorage.getItem("zhuzhu-pixel-adventure-v1"));
    return [p.player_x, p.player_y];
  });
  if (prog[1] > 1450) {
    errors.push(`fit movement: player_y still portrait-space (${prog[1]})`);
  }
}

async function assertMapViewportHeightStable(page, baseHeight, errors, ctx = "") {
  const map = await page.locator(".island-viewport-fit").boundingBox();
  if (!map || baseHeight == null) return;
  if (Math.abs(map.height - baseHeight) > 4) {
    errors.push(
      `${ctx} map viewport height ${map.height.toFixed(0)} != baseline ${baseHeight.toFixed(0)}`
    );
  }
  const dock = await page.locator(".action-dock-fit-below").boundingBox();
  if (dock && dock.height > 112) {
    errors.push(`${ctx} hint strip too tall: ${dock.height.toFixed(0)}px`);
  }
}

async function runFitDesktopSuite(page, shots, errors) {
  const sizes = [
    [1280, 800],
    [1440, 900],
    [1920, 1080],
    [1024, 768],
  ];
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.evaluate(() => localStorage.clear());
  await page.goto(BASE, { waitUntil: "networkidle" });
  await pickCharacter(page);
  await waitMapReady(page);
  let mapHeightBaseline = null;
  for (const [w, h] of sizes) {
    await page.setViewportSize({ width: w, height: h });
    await page.reload({ waitUntil: "networkidle" });
    await waitMapReady(page);
    const minSide = Math.min(w, h);
    if (minSide < FIT_MIN) {
      errors.push(`${w}x${h} below fit threshold`);
    }
    await assertViewportMode(page, "fit", errors);
    await assertNoVerticalScroll(page, errors);
    await assertMapAreaTall(page, errors, 0.65);
    await assertFourLandmarksInViewport(page, errors);
    await assertFitLabels(page, errors);
    await assertChestVisible(page, errors);
    await assertChestNotUnderLabels(page, errors);
    await assertHintOutsideMap(page, errors);
    await assertHintStripZhuyinInViewport(page, errors);
    await assertPlayerHeightFit(page, errors);
    await assertPlayerInsideMap(page, errors);
    if (w === 1280 && h === 800) {
      await assertFitPlayerMoves(page, errors);
    }
    const mapBox = await page.locator(".island-viewport-fit").boundingBox();
    if (w === 1280 && h === 800 && mapBox) mapHeightBaseline = mapBox.height;
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
    await assertHintStripZhuyinInViewport(page, errors);
    await assertMapViewportHeightStable(page, mapHeightBaseline, errors, "enter");
    await assertFitLabels(page, errors);
    await assertPlayerInsideMap(page, errors);
    const enterHintShot = `${ART}/${TAG}-viewport-1280x800-school-enter.png`;
    await page.screenshot({ path: enterHintShot });
    shots.push(enterHintShot);
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
      p.player_x = 528;
      p.player_y = 1235;
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
