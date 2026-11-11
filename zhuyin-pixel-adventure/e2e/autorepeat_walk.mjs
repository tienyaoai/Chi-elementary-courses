#!/usr/bin/env node
/**
 * Desktop arrow keys with OS auto-repeat: hold + repeated keydown events must not
 * stall movement or freeze walk sprite on frame 0.
 */
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const ART = "/opt/cursor/artifacts";
const TAG = process.env.E2E_TAG || "v9.21g-hotfix";
const BASE = process.env.E2E_BASE || "http://127.0.0.1:8777";
const PORT = new URL(BASE).port || "8777";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function pickCharacter(page) {
  await page.goto(BASE, { waitUntil: "networkidle", timeout: 120000 });
  if (await page.locator(".char-grid-12 .char-card").count()) {
    await page.locator(".char-grid-12 .char-card").first().click();
    await page.locator("button.pixel-btn.primary.big-touch").click();
  }
  await page.locator(".island-viewport").first().waitFor({ state: "visible", timeout: 120000 });
  await page.waitForFunction(
    () => !document.body.textContent.includes("地圖載入中"),
    { timeout: 120000 }
  );
}

async function resetPos(page, x = 720, y = 1020) {
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
  await page.locator(".island-viewport").first().waitFor({ state: "visible", timeout: 120000 });
  await sleep(500);
}

function focusMap(page) {
  return page.evaluate(() => {
    window.focus();
    try {
      document.body.setAttribute("tabindex", "-1");
      document.body.focus();
    } catch {
      /* ignore */
    }
  });
}

/** In-page sampler tied to rAF (~16ms). */
async function startSampler(page) {
  return page.evaluateHandle(() => {
    window.__walkSamples = [];
    let running = true;
    const tick = () => {
      if (!running) return;
      const el = document.querySelector('[data-testid="island-player"]');
      if (el) {
        window.__walkSamples.push({
          t: performance.now(),
          x: parseFloat(el.getAttribute("data-world-x") || "NaN"),
          y: parseFloat(el.getAttribute("data-world-y") || "NaN"),
          col: el.getAttribute("data-walk-col"),
          row: el.getAttribute("data-walk-row"),
          active: el.getAttribute("data-walk-active"),
        });
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    return () => {
      running = false;
    };
  });
}

async function stopSampler(page, stopHandle) {
  await page.evaluate((stop) => stop(), stopHandle);
  return page.evaluate(() => window.__walkSamples || []);
}

async function dispatchAutoRepeat(page, code, ms = 3000, everyMs = 33) {
  await page.evaluate(
    async ({ code, ms, everyMs }) => {
      const win = window;
      const t0 = performance.now();
      while (performance.now() - t0 < ms) {
        const key =
          code === "ArrowRight"
            ? "ArrowRight"
            : code === "ArrowLeft"
              ? "ArrowLeft"
              : code === "ArrowUp"
                ? "ArrowUp"
                : "ArrowDown";
        win.dispatchEvent(
          new KeyboardEvent("keydown", {
            code,
            key,
            bubbles: true,
            cancelable: true,
            repeat: true,
          })
        );
        await new Promise((r) => setTimeout(r, everyMs));
      }
    },
    { code, ms, everyMs }
  );
}

function analyze(samples, errors, label, expectFacing) {
  if (samples.length < 30) {
    errors.push(`${label}: too few samples (${samples.length})`);
    return null;
  }
  const moving = samples.filter((s) => s.active === "true");
  const cols = new Set(moving.map((s) => s.col).filter((c) => c != null));
  let bestSecCols = 0;
  const t0 = samples[0].t;
  for (let w = 0; w <= 2500; w += 250) {
    const window = moving.filter((s) => s.t >= t0 + w && s.t < t0 + w + 1000);
    if (window.length < 20) continue;
    const wCols = new Set(window.map((s) => s.col));
    bestSecCols = Math.max(bestSecCols, wCols.size);
  }
  if (bestSecCols < 4) {
    errors.push(`${label}: no 1s window with 4 walk cols (best=${bestSecCols})`);
  }
  let maxStall = 0;
  for (let i = 1; i < samples.length; i++) {
    const dt = samples[i].t - samples[i - 1].t;
    const dx = Math.hypot(
      samples[i].x - samples[i - 1].x,
      samples[i].y - samples[i - 1].y
    );
    if (dx < 0.5 && dt > 50) maxStall = Math.max(maxStall, dt);
  }
  if (maxStall > 50) {
    errors.push(`${label}: position stall ${maxStall.toFixed(0)}ms (>50ms)`);
  }
  const faceSamples = moving;
  const faceOk =
    faceSamples.length === 0 ||
    faceSamples.filter((s) => s.row === String(expectFacing)).length / faceSamples.length >= 0.92;
  if (!faceOk) {
    errors.push(`${label}: facing row drift (want ${expectFacing})`);
  }
  const x0 = samples[0].x;
  const x1 = samples[samples.length - 1].x;
  const travel = Math.abs(x1 - x0) + Math.abs(samples[samples.length - 1].y - samples[0].y);
  if (travel < 40) {
    errors.push(`${label}: moved only ${travel.toFixed(0)}px in hold window`);
  }
  if (cols.size < 2) {
    errors.push(`${label}: walk cols frozen: ${[...cols].join(",")}`);
  }
  let sameColRun = 1;
  let maxSameColMs = 0;
  for (let i = 1; i < moving.length; i++) {
    const dt = moving[i].t - moving[i - 1].t;
    if (moving[i].col === moving[i - 1].col) {
      sameColRun += 1;
      if (sameColRun > 12) {
        maxSameColMs = Math.max(maxSameColMs, sameColRun * dt);
      }
    } else {
      sameColRun = 1;
    }
  }
  if (maxSameColMs > 220) {
    errors.push(`${label}: leg frame stuck ${maxSameColMs.toFixed(0)}ms on one col`);
  }
  return {
    label,
    samples: samples.length,
    distinctCols: [...cols],
    travel: travel.toFixed(1),
    maxStallMs: maxStall,
  };
}

async function holdWithAutoRepeat(page, keys, durationMs) {
  const codes = {
    ArrowRight: "ArrowRight",
    ArrowLeft: "ArrowLeft",
    ArrowUp: "ArrowUp",
    ArrowDown: "ArrowDown",
  };
  for (const k of keys) await page.keyboard.down(k);
  const primary = keys[0];
  await dispatchAutoRepeat(page, codes[primary], durationMs, 33);
  for (const k of keys) await page.keyboard.up(k);
  await sleep(120);
}

export async function runAutoRepeatWalk(page, errors = []) {
  mkdirSync(ART, { recursive: true });
  await page.setViewportSize({ width: 1280, height: 800 });
  await pickCharacter(page);
  await resetPos(page, 720, 1020);
  await focusMap(page);

  const report = { tag: TAG, runs: [], bundleNote: process.env.E2E_BUNDLE || "current-dist" };
  const facing = { ArrowRight: 2, ArrowLeft: 1, ArrowUp: 3, ArrowDown: 0 };
  const start = {
    ArrowRight: [720, 1020],
    ArrowLeft: [1200, 1020],
    ArrowUp: [852, 1100],
    ArrowDown: [852, 400],
  };

  for (const dir of ["ArrowRight", "ArrowLeft", "ArrowUp", "ArrowDown"]) {
    await resetPos(page, ...start[dir]);
    await focusMap(page);
    const stop = await startSampler(page);
    await holdWithAutoRepeat(page, [dir], 3000);
    const samples = await stopSampler(page, stop);
    const summary = analyze(samples, errors, `autorepeat-${dir}`, facing[dir]);
    const jsonPath = `${ART}/${TAG}-autorepeat-${dir}.json`;
    const plot = samples.filter((_, i) => i % 4 === 0).map((s) => ({ t: Math.round(s.t - samples[0].t), x: +s.x.toFixed(1), y: +s.y.toFixed(1), col: s.col }));
    writeFileSync(jsonPath, JSON.stringify({ samples, summary, plot }, null, 2));
    report.runs.push({ dir, summary, jsonPath });
  }

  await resetPos(page, 720, 1020);
  await focusMap(page);
  const stopTap = await startSampler(page);
  await page.keyboard.down("ArrowRight");
  await sleep(80);
  await page.keyboard.up("ArrowRight");
  await sleep(400);
  const tapSamples = await stopSampler(page, stopTap);
  report.tapRelease = { samples: tapSamples.length };
  if (tapSamples.length > 2) {
    const moved = Math.hypot(
      tapSamples[tapSamples.length - 1].x - tapSamples[0].x,
      tapSamples[tapSamples.length - 1].y - tapSamples[0].y
    );
    if (moved < 4) errors.push("autorepeat-tap: quick tap did not nudge player");
  }

  await resetPos(page, 720, 1020);
  await focusMap(page);
  const stopDiag = await startSampler(page);
  await page.keyboard.down("ArrowRight");
  await page.keyboard.down("ArrowUp");
  await dispatchAutoRepeat(page, "ArrowRight", 2500, 33);
  await dispatchAutoRepeat(page, "ArrowUp", 2500, 33);
  await page.keyboard.up("ArrowRight");
  await page.keyboard.up("ArrowUp");
  await sleep(120);
  const diagSamples = await stopSampler(page, stopDiag);
  const diagSummary = analyze(diagSamples, errors, "autorepeat-Right+Up", 2);
  report.runs.push({ dir: "ArrowRight+ArrowUp", summary: diagSummary });

  writeFileSync(`${ART}/${TAG}-autorepeat-walk-report.json`, JSON.stringify(report, null, 2));
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
  await sleep(400);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await runAutoRepeatWalk(page, errors);
    const out = { ok: errors.length === 0, errors, tag: TAG };
    writeFileSync(`${ART}/${TAG}-autorepeat-result.json`, JSON.stringify(out, null, 2));
    console.log(JSON.stringify(out, null, 2));
    process.exitCode = errors.length ? 1 : 0;
  } finally {
    await browser.close();
    server.kill("SIGTERM");
  }
}
