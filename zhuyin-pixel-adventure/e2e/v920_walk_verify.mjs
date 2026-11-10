#!/usr/bin/env node
/**
 * v9.20 real-input walk verification: keyboard + mouse/touch pad holds per direction.
 */
import { chromium } from "playwright";
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { footOnLand, isWaterPixel, loadWalkMask } from "./walk_mask.mjs";

const ART = "/opt/cursor/artifacts";
const TAG = process.env.E2E_TAG || "v9.21f";
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
      right: [720, 1020],
      left: [1780, 1020],
      up: [1140, 1420],
      down: [1140, 580],
    };
    return table[planId];
  }
  /** Longest open run on portrait spine (see e2e/WALK_HARNESS_STARTS.md). */
  const table = {
    right: [120, 1260],
    left: [960, 1260],
    up: [860, 1420],
    down: [860, 600],
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

async function assertMapCoversViewport(page, errors, ctx) {
  const ok = await page.evaluate(() => {
    const vp = document.querySelector(".island-viewport");
    const world = document.querySelector(".island-world");
    if (!vp || !world) return false;
    const vr = vp.getBoundingClientRect();
    const wr = world.getBoundingClientRect();
    const tol = 4;
    return (
      wr.left <= vr.left + tol &&
      wr.right >= vr.right - tol &&
      wr.top <= vr.top + tol &&
      wr.bottom >= vr.bottom - tol
    );
  });
  if (!ok) errors.push(`${ctx}: map layer does not cover viewport (void visible)`);
}

function rectsIntersect(a, b, pad = 2) {
  return !(
    a.x + a.width + pad < b.x ||
    b.x + b.width + pad < a.x ||
    a.y + a.height + pad < b.y ||
    b.y + b.height + pad < a.y
  );
}

async function assertNoUiOverlap(page, errors, ctx) {
  const vp = page.locator(".island-viewport");
  const names = ["island-player", "door-bubble", "fit-label-chinese", "fit-label-math", "fit-label-english", "fit-label-treasure"];
  const boxes = {};
  for (const testid of names) {
    const el = page.locator(`[data-testid="${testid}"]`);
    if ((await el.count()) === 0) continue;
    const b = await el.boundingBox();
    if (b) boxes[testid] = b;
  }
  const labels = Object.keys(boxes).filter((k) => k.startsWith("fit-label"));
  for (let i = 0; i < labels.length; i++) {
    for (let j = i + 1; j < labels.length; j++) {
      if (rectsIntersect(boxes[labels[i]], boxes[labels[j]], 4)) {
        errors.push(`${ctx}: labels overlap ${labels[i]} vs ${labels[j]}`);
      }
    }
  }
  for (const lab of labels) {
    if (boxes["door-bubble"] && rectsIntersect(boxes[lab], boxes["door-bubble"], 4)) {
      errors.push(`${ctx}: label ${lab} overlaps door bubble`);
    }
    if (boxes["island-player"] && rectsIntersect(boxes[lab], boxes["island-player"], 4)) {
      errors.push(`${ctx}: label ${lab} overlaps hero`);
    }
  }
  if (boxes["door-bubble"] && boxes["island-player"] && rectsIntersect(boxes["door-bubble"], boxes["island-player"], 4)) {
    errors.push(`${ctx}: door bubble overlaps hero`);
  }
  const vpb = await vp.boundingBox();
  if (vpb) {
    for (const lab of labels) {
      if (boxes[lab].x < vpb.x - 2 || boxes[lab].x + boxes[lab].width > vpb.x + vpb.width + 2) {
        errors.push(`${ctx}: label ${lab} clips viewport horizontally`);
      }
    }
  }
}

async function sampleFootMapPixel(page, wx, wy) {
  return page.evaluate(
    async ({ wx, wy }) => {
      const img = document.querySelector(".island-bg");
      if (!img || !img.naturalWidth) return null;
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const c = canvas.getContext("2d");
      c.drawImage(img, 0, 0);
      const x = Math.max(0, Math.min(canvas.width - 1, Math.round(wx)));
      const y = Math.max(0, Math.min(canvas.height - 1, Math.round(wy)));
      const d = c.getImageData(x, y, 1, 1).data;
      return { x, y, r: d[0], g: d[1], b: d[2], a: d[3] };
    },
    { wx, wy }
  );
}

async function assertLabelInViewport(page, key, errors) {
  const vp = page.locator(".island-viewport");
  const label = page.locator(`[data-testid="fit-label-${key}"]`);
  const vpb = await vp.boundingBox();
  const lb = await label.boundingBox();
  if (!vpb || !lb) {
    errors.push(`390: label ${key} missing bbox`);
    return;
  }
  const tol = 2;
  if (lb.x < vpb.x - tol || lb.x + lb.width > vpb.x + vpb.width + tol) {
    errors.push(`390: label ${key} clips viewport horizontally`);
  }
  if (lb.y < vpb.y - tol || lb.y + lb.height > vpb.y + vpb.height + tol) {
    errors.push(`390: label ${key} clips viewport vertically`);
  }
}

async function auditFootLandAfterHolds(browser, errors) {
  const dist = path.resolve("..", "dist");
  const plans = [
    {
      orient: "portrait",
      w: 390,
      h: 844,
      touch: true,
      starts: [[120, 1240], [235, 1695], [304, 1200], [884, 724]],
    },
    {
      orient: "landscape",
      w: 1280,
      h: 800,
      touch: false,
      starts: [
        [600, 1070],
        [1100, 1020],
        [1900, 1050],
        [2100, 1000],
        [1880, 1160],
      ],
    },
    {
      orient: "landscape",
      w: 1920,
      h: 1072,
      touch: false,
      starts: [[1900, 1050], [2100, 1000], [1880, 1160]],
    },
  ];
  const maskP = loadWalkMask(dist, "portrait");
  const maskL = loadWalkMask(dist, "landscape");
  for (const plan of plans) {
    const ctx = await browser.newContext({
      viewport: { width: plan.w, height: plan.h },
      hasTouch: plan.touch,
    });
    const page = await ctx.newPage();
    const mask = plan.orient === "portrait" ? maskP : maskL;
    try {
      await pickCharacter(page);
      for (const [sx, sy] of plan.starts) {
        for (const dir of DIR_PLANS) {
          await resetPos(page, sx, sy);
          if (plan.touch) {
            await holdPad(page, `pad-${dir.padSuffix}`, true, 6000);
          } else {
            await holdKeyboard(page, dir.keys, 6000);
          }
          const hero = await sampleHero(page);
          if (!hero || !Number.isFinite(hero.x)) {
            errors.push(`foot-audit: no hero ${plan.orient} ${sx},${sy} ${dir.id}`);
            continue;
          }
          if (!footOnLand(mask, hero.x, hero.y)) {
            errors.push(
              `foot-audit: hero on non-land ${plan.orient} after 6s ${dir.id} from ${sx},${sy} at (${hero.x.toFixed(0)},${hero.y.toFixed(0)})`
            );
          }
        }
      }
    } finally {
      await ctx.close();
    }
  }
}

async function capturePhoneShots(page, errors) {
  const doors = {
    chinese: [304, 1200],
    math: [732, 1284],
    english: [884, 724],
    treasure: [570, 988],
  };
  for (const [key, [x, y]] of Object.entries(doors)) {
    await resetPos(page, x, y);
    await sleep(700);
    const label = page.locator(`[data-testid="fit-label-${key}"]`);
    try {
      await label.waitFor({ state: "visible", timeout: 8000 });
    } catch {
      errors.push(`390: label ${key} not visible near door`);
    }
    await assertLabelInViewport(page, key, errors);
    await assertNoUiOverlap(page, errors, `390-label-${key}`);
    await assertMapCoversViewport(page, errors, `390-label-${key}`);
    const extraLocked = await page.locator(".locked-hint").count();
    if (extraLocked > 0) errors.push("390: stray .locked-hint panel breaks layout");
    if (key === "math" || key === "english") {
      const hint = await page.locator('[data-testid="map-hint-locked"]').boundingBox();
      const pad = await page.locator(".touch-pad").boundingBox();
      if (hint && pad && rectsIntersect(hint, pad, 2)) {
        errors.push(`390: dock hint overlaps touch pad at ${key}`);
      }
    }
    if (key === "chinese") {
      await page.screenshot({ path: `${ART}/${TAG}-labels-390x844.png` });
    }
    await page.screenshot({ path: `${ART}/${TAG}-labels-390-${key}.png` });
  }
  for (const w of [320, 390, 430]) {
    await page.setViewportSize({ width: w, height: 844 });
    await resetPos(page, 120, 1240);
    await sleep(400);
    await assertMapCoversViewport(page, errors, `phone-clamp-init-${w}`);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await resetPos(page, 120, 1240);
  await holdPad(page, "pad-right", true, 5000);
  await assertMapCoversViewport(page, errors, "390-hold-right-5s");
  const afterRight = await sampleHero(page);
  if (afterRight && afterRight.x > 962) {
    errors.push(`390: hero x=${afterRight.x} on portrait east padding`);
  }
  await page.screenshot({ path: `${ART}/${TAG}-clamp-right-5s-390x844.png` });
  await assertNoUiOverlap(page, errors, "390-clamp-right-5s");
  await resetPos(page, 230, 1790);
  await holdPad(page, "pad-up", true, 5000);
  await assertMapCoversViewport(page, errors, "390-hold-up-5s");
  const heroUp = await sampleHero(page);
  const maskP = loadWalkMask(path.resolve("..", "dist"), "portrait");
  const foot = heroUp
    ? {
        x: heroUp.x,
        y: heroUp.y,
        mask: footOnLand(maskP, heroUp.x, heroUp.y),
        pixel: await sampleFootMapPixel(page, heroUp.x, heroUp.y),
      }
    : null;
  if (foot?.pixel && isWaterPixel(foot.pixel.r, foot.pixel.g, foot.pixel.b, foot.pixel.a)) {
    errors.push(
      `390 clamp-up: hero feet on water-colored pixel rgb=(${foot.pixel.r},${foot.pixel.g},${foot.pixel.b}) at (${foot.x},${foot.y})`
    );
  }
  writeFileSync(`${ART}/${TAG}-clamp-up-foot.json`, JSON.stringify(foot, null, 2));
  await page.screenshot({ path: `${ART}/${TAG}-clamp-up-5s-390x844.png` });
  await assertNoUiOverlap(page, errors, "390-clamp-up-5s");
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
        await capturePhoneShots(page, errors);
      }
    } catch (e) {
      errors.push(`${view.id}: ${e?.message ?? e}`);
    } finally {
      await ctx.close();
    }
  }

  await auditFootLandAfterHolds(browser, errors);

  const { runV921eDeliver } = await import("./v921e_deliver.mjs");
  await runV921eDeliver(browser, errors);

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
