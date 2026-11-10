#!/usr/bin/env node
/**
 * v9.20 real-input walk verification: keyboard + mouse/touch pad holds per direction.
 */
import { chromium } from "playwright";
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

const ART = "/opt/cursor/artifacts";
const TAG = process.env.E2E_TAG || "v9.21";
const BASE = process.env.E2E_BASE || "http://127.0.0.1:8765";
const HOLD_MS = 3000;
const STEP_MS = 50;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitMapReady(page) {
  await page.waitForSelector(".island-viewport", { timeout: 60000 });
  await page.waitForFunction(
    () => !document.body.textContent.includes("地圖載入中"),
    { timeout: 120000 }
  );
  await sleep(800);
}

async function pickCharacter(page) {
  await page.goto(BASE, { waitUntil: "networkidle", timeout: 120000 });
  if (await page.locator(".char-grid-12 .char-card").count()) {
    await page.waitForSelector(".char-grid-12 .char-card", { timeout: 120000 });
    await page.locator(".char-grid-12 .char-card").first().click();
    await sleep(200);
    const start = page.locator("button.pixel-btn.primary.big-touch");
    await start.waitFor({ state: "visible", timeout: 60000 });
    await page.waitForFunction(
      () => {
        const el = document.querySelector("button.pixel-btn.primary.big-touch");
        return el && !el.disabled;
      },
      { timeout: 60000 }
    );
    await start.click();
  }
  await waitMapReady(page);
}

async function sampleHero(page) {
  return page.evaluate(() => {
    const el = document.querySelector('[data-testid="island-player"]');
    if (!el) return null;
    const bg = el.style.backgroundPosition || getComputedStyle(el).backgroundPosition;
    return {
      x: parseFloat(el.getAttribute("data-world-x") || "NaN"),
      y: parseFloat(el.getAttribute("data-world-y") || "NaN"),
      facing: el.getAttribute("data-walk-facing"),
      col: el.getAttribute("data-walk-col"),
      row: el.getAttribute("data-walk-row"),
      active: el.getAttribute("data-walk-active"),
      bg,
    };
  });
}

const DIR_PLANS = [
  {
    id: "down",
    keys: ["ArrowDown"],
    padSuffix: "down",
    expectRow: "0",
    axis: "y",
    sign: 1,
    start: [850, 400],
  },
  {
    id: "up",
    keys: ["ArrowUp"],
    padSuffix: "up",
    expectRow: "3",
    axis: "y",
    sign: -1,
    start: [850, 1100],
  },
  {
    id: "left",
    keys: ["ArrowLeft"],
    padSuffix: "left",
    expectRow: "1",
    axis: "x",
    sign: -1,
    start: [1200, 900],
  },
  {
    id: "right",
    keys: ["ArrowRight"],
    padSuffix: "right",
    expectRow: "2",
    axis: "x",
    sign: 1,
    start: [200, 900],
  },
];

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
  await waitMapReady(page);
  await page.waitForSelector('[data-testid="island-player"]', { timeout: 30000 });
  await sleep(500);
}

/** Mask-validated open runs (≥~864px) so 3s hold stays off walls. */
function startFor(view, planId) {
  if (view.w >= 700) {
    const table = {
      right: [200, 1030],
      left: [2300, 1030],
      up: [1600, 1310],
      down: [1775, 400],
    };
    return table[planId];
  }
  const table = {
    right: [200, 1240],
    left: [970, 1240],
    up: [235, 1800],
    down: [235, 400],
  };
  return table[planId];
}

async function holdKeyboard(page, keys, holdMs) {
  await page.locator(".island-viewport").click({ position: { x: 80, y: 80 }, force: true });
  await sleep(120);
  for (const k of keys) await page.keyboard.down(k);
  const samples = [];
  const t0 = Date.now();
  while (Date.now() - t0 < holdMs) {
    samples.push({ t: Date.now() - t0, ...(await sampleHero(page)) });
    await sleep(STEP_MS);
  }
  for (const k of keys) await page.keyboard.up(k);
  await sleep(200);
  return samples;
}

async function holdPad(page, padTestId, touch, holdMs) {
  const pad = page.locator(`[data-testid="${padTestId}"]`);
  const box = await pad.boundingBox();
  if (!box) throw new Error(`no pad ${padTestId}`);
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const samples = [];
  if (touch) {
    await page.touchscreen.tap(cx, cy);
    await pad.dispatchEvent("pointerdown", {
      pointerId: 1,
      pointerType: "touch",
      isPrimary: true,
      button: 0,
      buttons: 1,
      clientX: cx,
      clientY: cy,
    });
  } else {
    await page.mouse.move(cx, cy);
    await page.mouse.down({ button: "left" });
  }
  const t0 = Date.now();
  while (Date.now() - t0 < holdMs) {
    samples.push({ t: Date.now() - t0, ...(await sampleHero(page)) });
    await sleep(STEP_MS);
  }
  if (touch) {
    await pad.dispatchEvent("pointerup", {
      pointerId: 1,
      pointerType: "touch",
      isPrimary: true,
      button: 0,
      buttons: 0,
    });
  } else await page.mouse.up({ button: "left" });
  await sleep(200);
  return samples;
}

function analyze(samples, plan, errors, ctx) {
  const coordKey = plan.axis;
  const cols = new Set();
  const facings = new Set();
  let lastCoord = null;
  let lastMoveT = 0;
  let stallMax = 0;
  for (const s of samples) {
    if (s.t >= 250 && s.facing != null) facings.add(s.facing);
    if (s.col != null) cols.add(s.col);
    const c = s[coordKey];
    if (lastCoord != null && Number.isFinite(c)) {
      const d = (c - lastCoord) * plan.sign;
      if (d > 0.02) lastMoveT = s.t;
      else stallMax = Math.max(stallMax, s.t - lastMoveT);
    }
    if (Number.isFinite(c)) lastCoord = c;
  }
  const start = samples[0]?.[coordKey];
  const end = samples[samples.length - 1]?.[coordKey];
  const delta = Number.isFinite(start) && Number.isFinite(end) ? (end - start) * plan.sign : 0;
  if (delta < 60) errors.push(`${ctx}: moved only ${delta.toFixed(0)}px on ${plan.axis}`);
  let maxConsecMs = 0;
  let consec = 0;
  let stallAt = null;
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1][coordKey];
    const b = samples[i][coordKey];
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    const d = (b - a) * plan.sign;
    if (d <= 0.02) {
      consec += STEP_MS;
      if (consec > maxConsecMs) {
        maxConsecMs = consec;
        stallAt = { t: samples[i].t, x: samples[i].x, y: samples[i].y };
      }
    } else {
      consec = 0;
    }
  }
  if (maxConsecMs > 150) {
    const pos = stallAt ? ` at (${stallAt.x?.toFixed?.(0)},${stallAt.y?.toFixed?.(0)}) t=${stallAt.t}ms` : "";
    errors.push(`${ctx}: stall gap ${maxConsecMs}ms (>150ms) while held${pos}`);
  }
  if (facings.size > 1) errors.push(`${ctx}: facing unstable ${[...facings].join(",")}`);
  else if (facings.size === 1 && [...facings][0] !== plan.expectRow)
    errors.push(`${ctx}: facing ${[...facings][0]} expected row ${plan.expectRow}`);
  const walkCols = [...cols].filter((c) => c !== "0");
  if (walkCols.length < 3) errors.push(`${ctx}: only ${walkCols.length} walk cols (need ≥3): ${[...cols].join(",")}`);
  return { delta, cols: [...cols], facings: [...facings], stallMax: maxConsecMs, stallAt };
}

async function shotFrames(page, samples, outBase) {
  const picks = [0, Math.floor(samples.length / 3), (2 * samples.length) / 3, samples.length - 1];
  const paths = [];
  for (let i = 0; i < picks.length; i++) {
    const p = `${outBase}-f${i}.png`;
    await page.screenshot({ path: p });
    paths.push(p);
  }
  return paths;
}

async function labelStaticCheck(page, errors) {
  await resetPos(page, 200, 1070);
  await sleep(400);
  const math = page.locator('[data-testid="fit-label-math"]');
  await math.waitFor({ timeout: 10000 });
  const samples = [];
  for (let i = 0; i < 60; i++) {
    const box = await math.evaluate((el) => {
      const wx = el.getAttribute("data-world-x");
      const wy = el.getAttribute("data-world-y");
      const r = el.getBoundingClientRect();
      return { wx, wy, x: r.x, y: r.y, w: r.width, h: r.height };
    });
    samples.push({ t: i * 50, ...box });
    await sleep(50);
  }
  const wx0 = samples[0].wx;
  const wy0 = samples[0].wy;
  for (const s of samples) {
    if (s.wx !== wx0 || s.wy !== wy0) {
      errors.push(`math label world anchor moved ${wx0},${wy0} -> ${s.wx},${s.wy}`);
      break;
    }
  }
  writeFileSync(`${ART}/${TAG}-math-label-static.json`, JSON.stringify(samples, null, 2));
}

export async function runV920WalkVerify(browser, errors = []) {
  mkdirSync(ART, { recursive: true });
  const report = { tag: TAG, runs: [] };

  for (const view of [
    { id: "1280-keyboard", w: 1280, h: 800, touch: false, input: "keyboard", padPrefix: "fit-pad-" },
    { id: "1920-mouse", w: 1920, h: 1072, touch: false, input: "pad", padPrefix: "fit-pad-" },
    { id: "390-touch", w: 390, h: 844, touch: true, input: "pad", padPrefix: "pad-" },
  ]) {
    const ctx = await browser.newContext({
      viewport: { width: view.w, height: view.h },
      hasTouch: view.touch,
    });
    const page = await ctx.newPage();
    try {
      await pickCharacter(page);
      for (const plan of DIR_PLANS) {
        await page.setViewportSize({ width: view.w, height: view.h });
        const [sx, sy] = startFor(view, plan.id);
        await resetPos(page, sx, sy);
        const samples =
          view.input === "keyboard"
            ? await holdKeyboard(page, plan.keys, HOLD_MS)
            : await holdPad(page, `${view.padPrefix}${plan.padSuffix}`, view.touch, HOLD_MS);
        const ctxId = `${view.id}-${plan.id}`;
        const summary = analyze(samples, plan, errors, ctxId);
        const jsonPath = `${ART}/${TAG}-walk-${ctxId}.json`;
        writeFileSync(jsonPath, JSON.stringify({ samples, summary }, null, 2));
        const shots = await shotFrames(page, samples, `${ART}/${TAG}-walk-${ctxId}`);
        try {
          const { execSync } = await import("node:child_process");
          execSync(
            `montage ${shots.map((p) => `"${p}"`).join(" ")} -tile 4x1 -geometry +2+2 ${ART}/${TAG}-walk-${ctxId}-contact.png`,
            { stdio: "ignore" }
          );
        } catch {
          /* montage optional */
        }
        report.runs.push({ ctx: ctxId, summary, jsonPath, shots });
      }
      if (view.w === 1280) {
        await page.screenshot({ path: `${ART}/${TAG}-labels-1280x800.png`, fullPage: false });
        await labelStaticCheck(page, errors);
      }
      if (view.w === 390) {
        await page.screenshot({ path: `${ART}/${TAG}-labels-390x844.png`, fullPage: false });
      }
    } catch (e) {
      errors.push(`${view.id}: ${e?.message ?? e}`);
    } finally {
      await ctx.close();
    }
  }

  writeFileSync(`${ART}/${TAG}-walk-verify-report.json`, JSON.stringify(report, null, 2));
  return report;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const errors = [];
  const browser = await chromium.launch({ headless: true });
  try {
    await runV920WalkVerify(browser, errors);
    console.log(JSON.stringify({ ok: errors.length === 0, errors }, null, 2));
    process.exit(errors.length ? 1 : 0);
  } finally {
    await browser.close();
  }
}
