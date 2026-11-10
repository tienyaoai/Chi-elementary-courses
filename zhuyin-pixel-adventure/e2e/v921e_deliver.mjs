#!/usr/bin/env node
import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { footOnLand, isWaterPixel, loadWalkMask } from "./walk_mask.mjs";

const ART = "/opt/cursor/artifacts";
const TAG = process.env.E2E_TAG || "v9.21e";
const BASE = process.env.E2E_BASE || "http://127.0.0.1:8765";
const dist = path.resolve("..", "dist");

async function pickCharacter(page) {
  await page.goto(BASE, { waitUntil: "networkidle", timeout: 120000 });
  if (await page.locator(".char-grid-12 .char-card").count()) {
    await page.locator(".char-grid-12 .char-card").first().click();
    await page.locator("button.pixel-btn.primary.big-touch").click();
  }
  await page.waitForSelector(".island-viewport", { timeout: 60000 });
  await page.waitForFunction(
    () => !document.body.textContent.includes("地圖載入中"),
    { timeout: 120000 }
  );
}

async function resetPos(page, x, y) {
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
  await pickCharacter(page);
}

async function holdPad(page, pad, touch, ms) {
  const loc = page.locator(`[data-testid="${pad}"]`);
  if (touch) {
    await loc.dispatchEvent("mousedown");
  } else {
    const box = await loc.boundingBox();
    if (box) await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
  }
  const t0 = Date.now();
  while (Date.now() - t0 < ms) await page.waitForTimeout(50);
  if (touch) await loc.dispatchEvent("mouseup");
  else await page.mouse.up();
}

export async function runV921eDeliver(browser, errors = []) {
  mkdirSync(ART, { recursive: true });
  const maskL = loadWalkMask(dist, "landscape");
  const shots = [];

  for (const view of [
    { w: 1280, h: 800, file: `${TAG}-ne-up-1280x800.png`, start: [1900, 1050] },
    { w: 1920, h: 1072, file: `${TAG}-ne-up-1920x1080.png`, start: [1900, 1050] },
  ]) {
    const ctx = await browser.newContext({ viewport: { width: view.w, height: view.h } });
    const page = await ctx.newPage();
    try {
      await pickCharacter(page);
      await resetPos(page, ...view.start);
      await holdPad(page, "fit-pad-up", false, 6000);
      const hero = await page.evaluate(() => {
        const el = document.querySelector('[data-testid="island-player"]');
        return el
          ? {
              x: parseFloat(el.getAttribute("data-world-x")),
              y: parseFloat(el.getAttribute("data-world-y")),
            }
          : null;
      });
      if (!hero || !footOnLand(maskL, hero.x, hero.y)) {
        errors.push(`${view.file}: hero off land at (${hero?.x},${hero?.y})`);
      }
      const px = hero ? await page.evaluate(async ({ x, y }) => {
        const img = document.querySelector(".island-bg");
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const c = canvas.getContext("2d");
        c.drawImage(img, 0, 0);
        const xi = Math.round(x);
        const yi = Math.round(y);
        const d = c.getImageData(xi, yi, 1, 1).data;
        return { r: d[0], g: d[1], b: d[2], a: d[3], x: xi, y: yi };
      }, hero) : null;
      if (px && isWaterPixel(px.r, px.g, px.b, px.a)) {
        errors.push(`${view.file}: foot on water rgb=${px.r},${px.g},${px.b}`);
      }
      const out = `${ART}/${view.file}`;
      await page.screenshot({ path: out });
      shots.push({ file: view.file, hero, px });
      writeFileSync(`${ART}/${view.file.replace(".png", ".json")}`, JSON.stringify({ hero, px }, null, 2));
    } finally {
      await ctx.close();
    }
  }

  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  try {
    await pickCharacter(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    await resetPos(page, 806, 1076);
    const bubble = page.locator('[data-testid="door-bubble"]');
  await bubble.waitFor({ state: "visible", timeout: 20000 });
    const enter = page.locator('[data-testid="door-enter-btn"]');
    if (await enter.count()) await enter.click();
    else await page.keyboard.press("Enter");
    await page.waitForSelector(".hub-panel, .opt-grid", { timeout: 30000 });
    const backBtn = page.locator(".hub-panel button.pixel-btn.ghost.big-touch");
    await backBtn.waitFor({ state: "visible", timeout: 30000 });
    const t0 = Date.now();
    await backBtn.click();
    await page.waitForFunction(
      () => {
        const img = document.querySelector(".island-bg");
        const vp = document.querySelector(".island-viewport");
        return (
          vp &&
          img &&
          img.complete &&
          img.naturalWidth > 0 &&
          getComputedStyle(vp).visibility !== "hidden"
        );
      },
      { timeout: 5000 }
    );
    const readyMs = Date.now() - t0;
    const bg = await page.evaluate(() => {
      const img = document.querySelector(".island-bg");
      return img
        ? {
            complete: img.complete,
            nw: img.naturalWidth,
            nh: img.naturalHeight,
          }
        : null;
    });
    if (readyMs > 100) errors.push(`map-return: island-bg not ready in ${readyMs}ms (need <100ms)`);
    if (!bg?.complete || !bg.nw) errors.push("map-return: island-bg not decoded after 回地圖");
    await page.screenshot({ path: `${ART}/${TAG}-map-return-instant-1280.png` });
    shots.push({ file: `${TAG}-map-return-instant-1280.png`, readyMs, bg });
    writeFileSync(`${ART}/${TAG}-map-return-timing.json`, JSON.stringify({ readyMs, bg }, null, 2));
  } catch (e) {
    errors.push(`map-return: ${e?.message ?? e}`);
  } finally {
    await ctx.close();
  }

  writeFileSync(`${ART}/${TAG}-deliver-report.json`, JSON.stringify({ shots, errors }, null, 2));
  return { shots, errors };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const errors = [];
  const browser = await chromium.launch({ headless: true });
  try {
    await runV921eDeliver(browser, errors);
    console.log(JSON.stringify({ ok: errors.length === 0, errors }, null, 2));
    process.exit(errors.length ? 1 : 0);
  } finally {
    await browser.close();
  }
}
