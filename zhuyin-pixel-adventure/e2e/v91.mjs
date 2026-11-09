#!/usr/bin/env node
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { createReadStream, writeFileSync } from "node:fs";
import { PNG } from "pngjs";
import path from "node:path";

const ART = "/opt/cursor/artifacts";
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
    const p1 = `${ART}/v9.1-select-390-full.png`;
    await page.screenshot({ path: p1, fullPage: true });
    shots.push(p1);

    await pickCharacter(page);
    await waitMapReady(page);
    const mapShot = `${ART}/v9.1-map-390.png`;
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
    const bridgeShot = `${ART}/v9.1-map-bridge-390.png`;
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
    const schoolShot = `${ART}/v9.1-map-school-390.png`;
    await vp.screenshot({ path: schoolShot });
    shots.push(schoolShot);

    const enter = page.locator('[data-testid="enter-portal"]');
    if (await enter.count()) {
      await enter.click({ force: true });
      await sleep(800);
      await page.locator(".unit-island-card").first().click();
      await page.waitForSelector(".opt-grid button", { timeout: 30000 });
      const quizShot = `${ART}/v9.1-quiz-390.png`;
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
      const chestShot = `${ART}/v9.1-treasure-390.png`;
      await page.screenshot({ path: chestShot, fullPage: true });
      shots.push(chestShot);
      await page.locator(".collection-panel button.primary").click({ force: true });
      await sleep(400);
    }

    const beforeId = await playerPos(page);
    await page.reload({ waitUntil: "networkidle" });
    await waitMapReady(page);
    const afterId = await playerPos(page);
    const refreshShot = `${ART}/v9.1-refresh-390.png`;
    await vp.screenshot({ path: refreshShot });
    shots.push(refreshShot);
    if (beforeId?.id && afterId?.id && beforeId.id !== afterId.id) {
      errors.push("character lost after refresh");
    }

  await page.setViewportSize({ width: 1280, height: 800 });
    await page.reload({ waitUntil: "networkidle" });
    await waitMapReady(page);
    const desk = `${ART}/v9.1-desktop-1280.png`;
    await page.locator(".island-viewport").screenshot({ path: desk });
    shots.push(desk);

    const summary = {
      ok: errors.length === 0,
      errors,
      screenshots: shots,
      blueCheck: br,
    };
    writeFileSync(`${ART}/v9.1-e2e-result.json`, JSON.stringify(summary, null, 2));
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
