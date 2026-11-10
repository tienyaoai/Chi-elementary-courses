#!/usr/bin/env node
import { chromium } from "playwright";
import { spawn, execSync } from "node:child_process";
import { createReadStream, writeFileSync } from "node:fs";
import { PNG } from "pngjs";
import path from "node:path";
import { canStand, loadWalkMask } from "./walk_mask.mjs";
import { assertDoorReachability, DOOR_COORDS } from "./walk_reach.mjs";

const ART = "/opt/cursor/artifacts";
const TAG = process.env.E2E_TAG || "v9.19";
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

async function ensureMapScreen(page) {
  if (await page.locator(".island-viewport").count()) {
    return;
  }
  if (await page.locator(".unit-island-card").count()) {
    await exitToMap(page);
  }
  if (await page.locator(".island-viewport").count()) {
    return;
  }
  await page.goto(BASE, { waitUntil: "load", timeout: 120000 });
  if (await page.locator(".char-grid-12 .char-card").count()) {
    await pickCharacter(page);
  }
  await waitMapReady(page);
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
    const maxCover = key === "treasure" ? 0.26 : 0.15;
    if (lmArea > 0 && inter / lmArea > maxCover) {
      errors.push(
        `${key} label covers ${((inter / lmArea) * 100).toFixed(0)}% of landmark (max ${(maxCover * 100).toFixed(0)}%)`
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
  for (const key of ["chinese", "math", "english"]) {
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

async function assertDoorBubbleLayout(page, errors, label) {
  const r = await page.evaluate(() => {
    const vp = document.querySelector(".island-viewport");
    const bubble = document.querySelector('[data-testid="door-bubble"]');
    const hero = document.querySelector('[data-testid="island-player"]');
    const school = document.querySelector('[data-testid="landmark-chinese"]');
    if (!vp || !bubble) {
      return { ok: false, reason: "missing" };
    }
    const vr = vp.getBoundingClientRect();
    const br = bubble.getBoundingClientRect();
    const tol = 2;
    const inside =
      br.left >= vr.left - tol &&
      br.top >= vr.top - tol &&
      br.right <= vr.right + tol &&
      br.bottom <= vr.bottom + tol;
    const overlap = (a, b) =>
      !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
    let heroOk = true;
    let schoolOk = true;
    if (hero) {
      heroOk = !overlap(br, hero.getBoundingClientRect());
    }
    if (school) {
      schoolOk = !overlap(br, school.getBoundingClientRect());
    }
    return {
      ok: inside && heroOk && schoolOk,
      inside,
      heroOk,
      schoolOk,
      bw: br.width,
      bh: br.height,
    };
  });
  if (!r.ok) {
    errors.push(
      `${label}: bubble layout inside=${r.inside} heroClear=${r.heroOk} schoolClear=${r.schoolOk} ${r.bw ? `${r.bw.toFixed(0)}x${r.bh.toFixed(0)}` : r.reason}`
    );
  }
  if (r.bh && r.bh > 112) {
    errors.push(`${label}: bubble height ${r.bh.toFixed(0)}px > 112`);
  }
  if (r.bw && r.bw > 340) {
    errors.push(`${label}: bubble width ${r.bw.toFixed(0)}px > 340`);
  }
}

async function teleportSchoolDoor(page, landscape) {
  const [dx, dy] = landscape
    ? DOOR_COORDS.landscape.chinese
    : DOOR_COORDS.portrait.chinese;
  await page.evaluate(
    ({ px, py }) => {
      const p = JSON.parse(localStorage.getItem("zhuzhu-pixel-adventure-v1"));
      p.player_x = px;
      p.player_y = py;
      localStorage.setItem("zhuzhu-pixel-adventure-v1", JSON.stringify(p));
    },
    { px: dx, py: dy }
  );
  await page.reload({ waitUntil: "networkidle" });
  await waitMapReady(page);
  await sleep(600);
}

async function assertHeroViewportMargin(page, errors, margin = 24) {
  const r = await page.evaluate((m) => {
    const vp = document.querySelector(".island-viewport");
    const hero = document.querySelector('[data-testid="island-player"]');
    if (!vp || !hero) return { ok: false, reason: "missing" };
    const vr = vp.getBoundingClientRect();
    const hr = hero.getBoundingClientRect();
    const topGap = hr.top - vr.top;
    const bottomGap = vr.bottom - hr.bottom;
    return {
      ok: topGap >= m - 2 && bottomGap >= m - 2,
      topGap,
      bottomGap,
    };
  }, margin);
  if (!r.ok) {
    errors.push(
      `hero viewport margin fail top=${r.topGap?.toFixed?.(0) ?? r.reason} bottom=${r.bottomGap?.toFixed?.(0) ?? ""}`
    );
  }
}

async function assertBubbleNearHero(page, errors, maxGap = 24) {
  const r = await page.evaluate((maxG) => {
    const bubble = document.querySelector('[data-testid="door-bubble"]');
    const hero = document.querySelector('[data-testid="island-player"]');
    if (!bubble || !hero) return { ok: false, reason: "missing" };
    const br = bubble.getBoundingClientRect();
    const hr = hero.getBoundingClientRect();
    const overlapY = Math.min(br.bottom, hr.bottom) - Math.max(br.top, hr.top);
    if (overlapY <= 0) {
      const d = Math.hypot(
        Math.max(0, Math.max(br.left - hr.right, hr.left - br.right)),
        Math.max(0, Math.max(br.top - hr.bottom, hr.top - br.bottom))
      );
      return { ok: d <= maxG + 40, gap: d, axis: "corner" };
    }
    const hGap = Math.max(0, Math.max(br.left - hr.right, hr.left - br.right));
    return { ok: hGap <= maxG + 8, gap: hGap, axis: "h" };
  }, maxGap);
  if (!r.ok) {
    errors.push(
      `door bubble not beside hero gap=${r.gap?.toFixed(0) ?? r.reason}px (${r.axis ?? ""})`
    );
  }
}

async function assertPhoneMapHeightBand(page, errors, minPx = 400, maxPx = null) {
  const vp = await page.locator(".island-viewport-follow").boundingBox();
  if (!vp) {
    errors.push("follow map viewport missing");
    return;
  }
  const screenH = page.viewportSize()?.height ?? 844;
  const cap = maxPx ?? (screenH >= 800 ? 720 : 520);
  if (vp.height < minPx) {
    errors.push(`phone map viewport height ${vp.height.toFixed(0)}px < ${minPx}px`);
  }
  if (vp.height > cap) {
    errors.push(`phone map viewport height ${vp.height.toFixed(0)}px > ${cap}px`);
  }
}

async function assertNoPageScroll(page, errors, label = "") {
  const r = await page.evaluate(() => {
    const el = document.scrollingElement;
    const ih = window.innerHeight;
  const sh = el ? el.scrollHeight : document.body.scrollHeight;
    return { sh, ih, padOk: sh <= ih + 2 };
  });
  if (!r.padOk) {
    errors.push(`${label} page scrolls: scrollHeight ${r.sh} > innerHeight ${r.ih}`);
  }
}

async function assertPadButtonsInViewport(page, errors, label = "") {
  const r = await page.evaluate(() => {
    const ih = window.innerHeight;
    const iw = window.innerWidth;
    const btns = [...document.querySelectorAll(".action-dock .pad-btn")];
    if (!btns.length) return { ok: false, reason: "no pads" };
    for (const b of btns) {
      const br = b.getBoundingClientRect();
      if (br.top < -1 || br.left < -1 || br.bottom > ih + 1 || br.right > iw + 1) {
        return {
          ok: false,
          fail: `${br.top.toFixed(0)},${br.left.toFixed(0)},${br.bottom.toFixed(0)},${br.right.toFixed(0)}`,
        };
      }
    }
    return { ok: true };
  });
  if (!r.ok) {
    errors.push(`${label} pad button outside viewport: ${r.reason ?? r.fail}`);
  }
}

async function assertHeroFeetWalkable(page, errors, distRoot) {
  const pos = await playerPos(page);
  if (!pos) {
    errors.push("walkable check: player pos missing");
    return;
  }
  const mask = loadWalkMask(distRoot, "portrait");
  if (!canStand(mask, pos.x, pos.y)) {
    errors.push(`hero on non-walkable tile (${pos.x.toFixed(0)},${pos.y.toFixed(0)})`);
  }
}

async function assertDoorEnterInViewport(page, errors, label) {
  const r = await page.evaluate(() => {
    const vp = document.querySelector(".island-viewport");
    const btn = document.querySelector('[data-testid="door-enter-btn"]');
    if (!vp || !btn) return { ok: false, reason: "missing" };
    const vr = vp.getBoundingClientRect();
    const br = btn.getBoundingClientRect();
    const inside =
      br.width > 8 &&
      br.height > 8 &&
      br.left >= vr.left - 2 &&
      br.right <= vr.right + 2 &&
      br.top >= vr.top - 2 &&
      br.bottom <= vr.bottom + 2;
    return { ok: inside, bh: br.height, bw: br.width };
  });
  if (!r.ok) {
    errors.push(`${label} door enter not in map viewport (${r.reason ?? `${r.bw}x${r.bh}`})`);
  }
}

async function setPlayerPos(page, x, y) {
  await page.evaluate(({ px, py }) => {
    const p = JSON.parse(localStorage.getItem("zhuzhu-pixel-adventure-v1"));
    p.player_x = px;
    p.player_y = py;
    localStorage.setItem("zhuzhu-pixel-adventure-v1", JSON.stringify(p));
  }, { px: x, py: y });
  await page.reload({ waitUntil: "networkidle" });
  await waitMapReady(page);
  await sleep(450);
}

async function walkWithArrowsUntil(page, keys, predicate, maxMs = 16000) {
  for (const k of keys) {
    await page.keyboard.down(k);
  }
  const deadline = Date.now() + maxMs;
  let ok = false;
  try {
    while (Date.now() < deadline) {
      if (await predicate()) {
        ok = true;
        break;
      }
      await sleep(55);
    }
  } finally {
    for (const k of keys) {
      await page.keyboard.up(k);
    }
    await sleep(300);
  }
  return ok;
}

async function waitHubOrLesson(page) {
  await page.waitForSelector(".unit-island-card, .opt-grid, .grade1-hub", { timeout: 20000 });
}

async function exitToMap(page) {
  const btn = page.locator("button.pixel-btn", { hasText: "回地圖" });
  if (await btn.count()) {
    await btn.first().click();
    await page.waitForSelector(".island-viewport", { timeout: 30000 });
    await sleep(400);
    return;
  }
  if (await page.locator(".grade1-hub, .opt-grid").count()) {
    await page.keyboard.press("Escape");
    await sleep(200);
  }
}

async function assertBubbleReturns(page, errors, label, awayKeys, backKeys, pos) {
  if (pos) {
    const [ax, ay, bx, by] = pos;
    await setPlayerPos(page, ax, ay);
    if (await page.locator('[data-testid="door-bubble"]').count()) {
      errors.push(`${label}: bubble still visible when away from door`);
      return;
    }
    await setPlayerPos(page, bx, by);
    if (!(await page.locator('[data-testid="door-bubble"]').count())) {
      errors.push(`${label}: door bubble did not return after stepping back to door`);
    }
    return;
  }
  const had = await walkWithArrowsUntil(page, awayKeys, async () => {
    const c = await page.locator('[data-testid="door-bubble"]').count();
    return c === 0;
  });
  if (!had) {
    errors.push(`${label}: could not walk away from door bubble`);
    return;
  }
  const back = await walkWithArrowsUntil(page, backKeys, async () => {
    const c = await page.locator('[data-testid="door-bubble"]').count();
    return c > 0;
  });
  if (!back) {
    errors.push(`${label}: door bubble did not return after walking back`);
  }
}

async function runKeyboardDoorEnterSuite(page, shots, errors) {
  const scenarios = [
    {
      id: "390",
      w: 390,
      h: 844,
      start: [280, 1200],
      keys: ["ArrowRight"],
      away: ["ArrowLeft"],
      back: ["ArrowRight"],
      buttonClick: true,
      bubbleReturnPos: [160, 1200, 304, 1200],
    },
    {
      id: "1280",
      w: 1280,
      h: 800,
      start: [760, 1068],
      keys: ["ArrowRight"],
      away: ["ArrowLeft"],
      back: ["ArrowRight"],
      shotLesson: true,
      bubbleReturnPos: [600, 1040, 790, 1040],
    },
    {
      id: "1920",
      w: 1920,
      h: 1072,
      start: [760, 1068],
      keys: ["ArrowRight"],
      away: ["ArrowLeft"],
      back: ["ArrowRight"],
      bubbleReturnPos: [600, 1040, 790, 1040],
    },
  ];

  for (const sc of scenarios) {
    await ensureMapScreen(page);
    await page.setViewportSize({ width: sc.w, height: sc.h });
    await ensureMapScreen(page);
    await setPlayerPos(page, sc.start[0], sc.start[1]);
    const reached = await walkWithArrowsUntil(page, sc.keys, async () => {
      return (await page.locator('[data-testid="door-bubble"]').count()) > 0;
    });
    if (!reached) {
      errors.push(`keyboard walk: no door bubble at ${sc.id}`);
      continue;
    }
  await page.keyboard.up("ArrowRight");
  await page.keyboard.up("ArrowLeft");
  await page.keyboard.up("ArrowUp");
  await page.keyboard.up("ArrowDown");
  await sleep(200);
  await page.keyboard.press("Enter");
    try {
      await waitHubOrLesson(page);
    } catch {
      errors.push(`keyboard Enter did not open hub at ${sc.id}`);
      continue;
    }
    if (sc.shotLesson) {
      const shot = `${ART}/${TAG}-lesson-enter-keyboard-1280.png`;
      await page.screenshot({ path: shot, fullPage: true });
      shots.push(shot);
    }
    await exitToMap(page);
    await assertBubbleReturns(page, errors, sc.id, sc.away, sc.back, sc.bubbleReturnPos);
    if (sc.buttonClick) {
      const btn = page.locator('[data-testid="door-enter-btn"]');
      if (!(await btn.isVisible())) {
        await walkWithArrowsUntil(page, sc.back, async () => {
          return (await page.locator('[data-testid="door-bubble"]').count()) > 0;
        });
      }
      try {
        await btn.click({ timeout: 10000 });
        await waitHubOrLesson(page);
      } catch {
        errors.push(`door button click did not open hub at ${sc.id}`);
      }
      await exitToMap(page);
    }
  }
}

async function holdKeysMs(page, keys, ms) {
  for (const k of keys) {
    await page.keyboard.down(k);
  }
  await sleep(ms);
  for (const k of keys) {
    await page.keyboard.up(k);
  }
  await sleep(350);
}

async function assertDoorZoneUnified(page, errors, ctx) {
  const r = await page.evaluate(() => {
    const bubble = document.querySelector('[data-testid="door-bubble"]');
    const enterBtn = document.querySelector('[data-testid="door-enter-btn"]');
    const hintDoor = document.querySelector('[data-testid="map-hint-door"]');
    const fitHint = document.querySelector(".action-dock-fit-below .map-hint-fit");
    const text = (fitHint || hintDoor)?.textContent ?? "";
    const hasEnterHint =
      text.includes("Enter") ||
      text.includes("進入答題") ||
      text.includes("按進入") ||
      Boolean(hintDoor);
    return {
      bubble: Boolean(bubble),
      enterBtn: Boolean(enterBtn && enterBtn.offsetParent !== null),
      hasEnterHint,
      stray屋前:
        text.includes("屋前") && !bubble,
    };
  });
  if (r.stray屋前) {
    errors.push(`${ctx}: 「屋前」hint without door bubble (dead zone)`);
  }
  if (r.bubble && !r.enterBtn) {
    errors.push(`${ctx}: bubble without enter button`);
  }
  if (r.bubble !== r.hasEnterHint && r.bubble) {
    errors.push(`${ctx}: bubble visible but dock hint missing enter cue`);
  }
}

async function runSchoolFacadeApproachSuite(page, shots, errors) {
  const plans = [
    {
      vp: "1920x1072",
      w: 1920,
      h: 1072,
      landscape: true,
      cases: [
        { id: "below-up-3s", start: [834, 1188], keys: ["ArrowUp"], ms: 3000, shot: true },
        { id: "facade-left", start: [700, 1068], keys: ["ArrowRight"], ms: 14000 },
        { id: "facade-right", start: [960, 1068], keys: ["ArrowLeft"], ms: 14000 },
      ],
    },
    {
      vp: "1280x800",
      w: 1280,
      h: 800,
      landscape: true,
      cases: [
        { id: "below-up-3s", start: [834, 1188], keys: ["ArrowUp"], ms: 3000 },
        { id: "facade-left", start: [700, 1068], keys: ["ArrowRight"], ms: 12000 },
        { id: "facade-right", start: [960, 1068], keys: ["ArrowLeft"], ms: 12000 },
      ],
    },
    {
      vp: "390x844",
      w: 390,
      h: 844,
      landscape: false,
      cases: [
        { id: "below-up-3s", start: [350, 1290], keys: ["ArrowUp"], ms: 3000 },
        { id: "facade-left", start: [270, 1200], keys: ["ArrowRight"], ms: 12000 },
        { id: "facade-right", start: [430, 1200], keys: ["ArrowLeft"], ms: 14000 },
      ],
    },
  ];

  for (const plan of plans) {
    await ensureMapScreen(page);
    await page.setViewportSize({ width: plan.w, height: plan.h });
    await ensureMapScreen(page);
    const mask = loadWalkMask(DIST, plan.landscape ? "landscape" : "portrait");

    for (const sc of plan.cases) {
      await setPlayerPos(page, sc.start[0], sc.start[1]);
      if (sc.keys.length === 1 && sc.id.startsWith("facade")) {
        const reached = await walkWithArrowsUntil(
          page,
          sc.keys,
          async () => (await page.locator('[data-testid="door-bubble"]').count()) > 0,
          sc.ms
        );
        if (!reached) {
          errors.push(`school approach ${plan.vp} ${sc.id}: no bubble after key hold`);
          continue;
        }
      } else {
        await holdKeysMs(page, sc.keys, sc.ms);
      }

      const bubble = await page.locator('[data-testid="door-bubble"]').count();
      if (!bubble) {
        errors.push(`school approach ${plan.vp} ${sc.id}: no bubble after key hold`);
        continue;
      }
      await assertDoorZoneUnified(page, errors, `${plan.vp}/${sc.id}`);
      await assertDoorBubbleUnified(page, errors, `${plan.vp}/${sc.id}`);

      const pos = await playerPos(page);
      if (
        plan.landscape &&
        sc.id !== "below-up-3s" &&
        pos &&
        pos.y < 1048
      ) {
        errors.push(
          `school approach ${plan.vp} ${sc.id}: hero on facade y=${pos.y.toFixed(0)}`
        );
      }
      if (pos && !canStand(mask, pos.x, pos.y)) {
        errors.push(
          `school approach ${plan.vp} ${sc.id}: hero not on walkable tile (${pos.x.toFixed(0)},${pos.y.toFixed(0)})`
        );
      }

      if (sc.shot) {
        const shot = `${ART}/${TAG}-school-overshoot-up-1920x1072-bubble.png`;
        await page.locator(".island-viewport").screenshot({ path: shot });
        shots.push(shot);
      }

      await page.keyboard.press("Enter");
      try {
        await waitHubOrLesson(page);
      } catch {
        errors.push(`school approach ${plan.vp} ${sc.id}: Enter did not open lesson`);
        continue;
      }
      await exitToMap(page);
      await ensureMapScreen(page);
    }
  }
}

async function recordWalkRightContact1920(browser, errors, shots) {
  const ctx = await browser.newContext({
    viewport: { width: 1920, height: 1072 },
    recordVideo: { dir: ART, size: { width: 1920, height: 1072 } },
  });
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: "networkidle" });
  await pickCharacter(page);
  await waitMapReady(page);
  await page.evaluate(() => {
    const p = JSON.parse(localStorage.getItem("zhuzhu-pixel-adventure-v1"));
    p.player_x = 900;
    p.player_y = 1020;
    localStorage.setItem("zhuzhu-pixel-adventure-v1", JSON.stringify(p));
  });
  await page.reload({ waitUntil: "networkidle" });
  await waitMapReady(page);

  const samples = [];
  await page.keyboard.down("ArrowRight");
  const t0 = Date.now();
  while (Date.now() - t0 < 2000) {
    samples.push(await sampleHeroSprite(page));
    await sleep(100);
  }
  await page.keyboard.up("ArrowRight");
  await sleep(300);

  const cols = samples.map((s) => s?.col).filter(Boolean);
  const bgs = samples.map((s) => s?.bg).filter(Boolean);
  if (new Set(cols).size < 2 && new Set(bgs).size < 2) {
    errors.push(
      `walk-right 1920: sprite did not cycle during 2s hold (cols=${cols.join(",")})`
    );
  }

  const vid = page.video();
  await ctx.close();
  if (!vid) {
    errors.push("walk-right 1920: no video handle");
    return;
  }
  const fs = await import("node:fs/promises");
  const webm = `${ART}/${TAG}-walk-right-1920x1072.webm`;
  await fs.rename(await vid.path(), webm);
  shots.push(webm);

  const frameDir = `${ART}/${TAG}-walk-frames-1920`;
  await fs.mkdir(frameDir, { recursive: true });
  execSync(
    `ffmpeg -y -i ${webm} -vf "fps=10" ${frameDir}/f_%02d.png`,
    { stdio: "pipe" }
  );
  const picks = [1, 3, 5, 7, 9, 11].map((n) => `${frameDir}/f_${String(n).padStart(2, "0")}.png`);
  const contact = `${ART}/${TAG}-walk-right-1920-contact.png`;
  const inputs = picks.flatMap((p) => ["-i", p]);
  execSync(
    `ffmpeg -y ${inputs.join(" ")} -filter_complex "[0:v][1:v][2:v]hstack=inputs=3[row1];[3:v][4:v][5:v]hstack=inputs=3[row2];[row1][row2]vstack=inputs=2" ${contact}`,
    { stdio: "pipe" }
  );
  shots.push(contact);

  let legDiff = 0;
  const readCropHash = (file) =>
    new Promise((resolve, reject) => {
      createReadStream(file)
        .pipe(new PNG())
        .on("parsed", function () {
          const hero = { x: Math.floor(this.width * 0.42), y: Math.floor(this.height * 0.38), w: 48, h: 64 };
          let h = 0;
          for (let y = hero.y; y < hero.y + hero.h; y += 2) {
            for (let x = hero.x; x < hero.x + hero.w; x += 2) {
              const i = (this.width * y + x) << 2;
              h = (h * 31 + this.data[i] + this.data[i + 1] + this.data[i + 2]) >>> 0;
            }
          }
          resolve(h);
        })
        .on("error", reject);
    });
  const hashes = [];
  for (const p of picks) {
    try {
      hashes.push(await readCropHash(p));
    } catch {
      // ignore
    }
  }
  legDiff = new Set(hashes).size;
  if (legDiff < 2) {
    errors.push(`walk-right 1920: video frames show <2 distinct hero crops (${legDiff})`);
  }
}

async function assertDoorBubbleTextFits(page, errors, ctx) {
  const r = await page.evaluate(() => {
    const bubble = document.querySelector('[data-testid="door-bubble"]');
    if (!bubble) return { ok: false, reason: "no bubble" };
    const pad = 2;
    const br = bubble.getBoundingClientRect();
    const nodes = bubble.querySelectorAll(
      ".door-bubble-text *, .door-bubble-enter, .door-bubble-text"
    );
    for (const el of nodes) {
      const tr = el.getBoundingClientRect();
      if (!tr.width || !tr.height) continue;
      if (tr.right > br.right + pad || tr.left < br.left - pad) {
        return {
          ok: false,
          axis: "h",
          text: (el.textContent || "").slice(0, 24),
          br: br.width,
          tr: tr.width,
        };
      }
      if (tr.bottom > br.bottom + pad || tr.top < br.top - pad) {
        return { ok: false, axis: "v", text: (el.textContent || "").slice(0, 24) };
      }
    }
    return { ok: true, bw: br.width, bh: br.height };
  });
  if (!r.ok) {
    errors.push(
      `${ctx} door bubble text overflow ${r.axis ?? r.reason} ${r.text ?? ""} bw=${r.bw?.toFixed?.(0) ?? ""}`
    );
  }
}

const SPAWN_WORLD = {
  portrait: { x: 322, y: 1194 },
  landscape: { x: 852, y: 1070 },
};

async function resetToSpawn(page, landscape) {
  const s = landscape ? SPAWN_WORLD.landscape : SPAWN_WORLD.portrait;
  await setPlayerPos(page, s.x, s.y);
}

/** Held arrow keys only from spawn: reach west bank, cross deck E/W, return — no teleport near bridge. */
async function assertBridgeCrossingHeldFromSpawn(page, errors) {
  const plans = [
    {
      id: "1920-landscape",
      w: 1920,
      h: 1072,
      landscape: true,
      phases: [
        { keys: ["ArrowRight"], until: (p) => p.x >= 1165 },
        { keys: ["ArrowUp"], until: (p) => p.y <= 1005 },
        { keys: ["ArrowRight"], until: (p) => p.x >= 1500 },
        { keys: ["ArrowLeft"], until: (p) => p.x <= 1140 },
      ],
    },
    {
      id: "1280-landscape",
      w: 1280,
      h: 800,
      landscape: true,
      phases: [
        { keys: ["ArrowRight"], until: (p) => p.x >= 1165 },
        { keys: ["ArrowUp"], until: (p) => p.y <= 1005 },
        { keys: ["ArrowRight"], until: (p) => p.x >= 1500 },
        { keys: ["ArrowLeft"], until: (p) => p.x <= 1140 },
      ],
    },
    {
      id: "390-portrait",
      w: 390,
      h: 844,
      landscape: false,
      phases: [
        { keys: ["ArrowRight"], until: (p) => p.x >= 475 },
        { keys: ["ArrowDown"], until: (p) => p.y >= 1260 },
        { keys: ["ArrowRight"], until: (p) => p.x >= 590 },
        { keys: ["ArrowLeft"], until: (p) => p.x <= 410 },
      ],
    },
  ];
  for (const plan of plans) {
    await ensureMapScreen(page);
    await page.setViewportSize({ width: plan.w, height: plan.h });
    await ensureMapScreen(page);
    await resetToSpawn(page, plan.landscape);
    for (let pi = 0; pi < plan.phases.length; pi++) {
      const phase = plan.phases[pi];
      const ok = await walkWithArrowsUntil(
        page,
        phase.keys,
        async () => {
          const p = await playerPos(page);
          return p && phase.until(p);
        },
        24000
      );
      if (!ok) {
        const p = await playerPos(page);
        errors.push(
          `bridge ${plan.id} phase ${pi} (${phase.keys.join("+")}) stuck at ${p?.x?.toFixed?.(0) ?? "?"},${p?.y?.toFixed?.(0) ?? "?"}`
        );
        break;
      }
    }
  }
}

async function walkToTreasureEnter(page, errors, label) {
  await ensureMapScreen(page);
  const landscape = page.viewportSize().width >= 700;
  const start = landscape ? [980, 820] : [640, 1025];
  await setPlayerPos(page, start[0], start[1]);
  const reached = await walkWithArrowsUntil(
    page,
    landscape ? ["ArrowRight"] : ["ArrowLeft"],
    async () => (await page.locator('[data-testid="door-bubble"]').count()) > 0,
    16000
  );
  if (!reached) {
    errors.push(`${label}: could not reach treasure bubble`);
    return;
  }
  const portal = await page
    .locator('[data-testid="door-bubble"]')
    .getAttribute("data-portal");
  if (portal !== "treasure") {
    errors.push(`${label}: expected treasure portal, got ${portal}`);
    return;
  }
  await page.keyboard.press("Enter");
  const opened = await page
    .waitForSelector(".collection-panel, .unit-island-card", { timeout: 15000 })
    .catch(() => null);
  if (!opened) {
    errors.push(`${label}: Enter at treasure did not open collection`);
    return;
  }
  if (await page.locator(".collection-panel").count()) {
    await page.keyboard.press("Escape");
    await sleep(300);
  } else if (await page.locator("button", { hasText: "回地圖" }).count()) {
    await exitToMap(page);
  }
}

async function assertAllBuildingBubblesTextFit(page, errors) {
  const views = [
    [1920, 1072, "chinese"],
    [1280, 800, "chinese"],
    [390, 844, "chinese"],
    [1280, 800, "treasure"],
    [390, 844, "treasure"],
    [1280, 800, "math"],
    [1280, 800, "english"],
  ];
  for (const [w, h, key] of views) {
    const landscape = w >= 700;
    await page.setViewportSize({ width: w, height: h });
    await ensureMapScreen(page);
    const [x, y] = DOOR_COORDS[landscape ? "landscape" : "portrait"][key];
    await teleportDoor(page, x, y);
    if (!(await page.locator('[data-testid="door-bubble"]').count())) {
      errors.push(`bubble text fit: no bubble ${key} ${w}x${h}`);
      continue;
    }
    await assertDoorBubbleTextFits(page, errors, `${key}-${w}x${h}`);
  }
}

async function captureV919DoorScreenshots(page, shots, errors) {
  const plans = [
    { w: 1280, h: 800, mode: "landscape" },
    { w: 390, h: 844, mode: "portrait" },
  ];
  const portals = ["chinese", "english", "math", "treasure"];
  for (const plan of plans) {
    await page.setViewportSize({ width: plan.w, height: plan.h });
    await ensureMapScreen(page);
    for (const portal of portals) {
      const [dx, dy] = DOOR_COORDS[plan.mode][portal];
      await teleportDoor(page, dx - (plan.mode === "landscape" ? 48 : 32), dy);
      const reached = await walkWithArrowsUntil(
        page,
        dx > 500 ? ["ArrowRight"] : ["ArrowLeft", "ArrowDown"],
        async () => (await page.locator('[data-testid="door-bubble"]').count()) > 0,
        14000
      );
      if (!reached) {
        errors.push(`v9.19 ${plan.w}x${plan.h} held-walk ${portal}: no door bubble`);
      }
      const shot = `${ART}/${TAG}-door-bubble-${portal}-${plan.w}x${plan.h}.png`;
      await page.locator(".island-viewport").screenshot({ path: shot });
      shots.push(shot);
    }
  }
}

async function captureV918Screenshots(page, shots) {
  await page.setViewportSize({ width: 1280, height: 800 });
  await ensureMapScreen(page);
  await page.evaluate(() => {
    const p = JSON.parse(localStorage.getItem("zhuzhu-pixel-adventure-v1"));
    p.player_x = 852;
    p.player_y = 900;
    localStorage.setItem("zhuzhu-pixel-adventure-v1", JSON.stringify(p));
  });
  await page.reload({ waitUntil: "networkidle" });
  await waitMapReady(page);
  await sleep(500);
  const mapShot = `${ART}/${TAG}-map-1280x800-treasure-spot.png`;
  await page.locator(".island-viewport").screenshot({ path: mapShot });
  shots.push(mapShot);

  const trL = DOOR_COORDS.landscape.treasure;
  await teleportDoor(page, trL[0], trL[1]);
  const chest1280 = `${ART}/${TAG}-door-bubble-treasure-1280x800.png`;
  await page.locator(".island-viewport").screenshot({ path: chest1280 });
  shots.push(chest1280);

  await page.setViewportSize({ width: 390, height: 844 });
  const trP = DOOR_COORDS.portrait.treasure;
  await teleportDoor(page, trP[0], trP[1]);
  const chest390 = `${ART}/${TAG}-door-bubble-treasure-390x844.png`;
  await page.locator(".island-viewport").screenshot({ path: chest390 });
  shots.push(chest390);

  await page.setViewportSize({ width: 1920, height: 1072 });
  const chL = DOOR_COORDS.landscape.chinese;
  await teleportDoor(page, chL[0], chL[1]);
  const school1920 = `${ART}/${TAG}-door-bubble-school-1920x1072.png`;
  await page.locator(".island-viewport").screenshot({ path: school1920 });
  shots.push(school1920);
}

async function teleportDoor(page, x, y) {
  await page.evaluate(({ px, py }) => {
    const p = JSON.parse(localStorage.getItem("zhuzhu-pixel-adventure-v1"));
    p.player_x = px;
    p.player_y = py;
    localStorage.setItem("zhuzhu-pixel-adventure-v1", JSON.stringify(p));
  }, { px: x, py: y });
  await page.reload({ waitUntil: "networkidle" });
  await waitMapReady(page);
  await sleep(650);
}

async function assertEveryBuildingDoor(page, errors, landscape, shots = []) {
  if (landscape) {
    await page.setViewportSize({ width: 1280, height: 800 });
  } else {
    await page.setViewportSize({ width: 390, height: 844 });
  }
  await ensureMapScreen(page);
  const mode = landscape ? "landscape" : "portrait";
  const doors = DOOR_COORDS[mode];
  for (const [key, [x, y]] of Object.entries(doors)) {
    await teleportDoor(page, x - (landscape ? 8 : 6), y + 6);
    const bubble = await page.locator('[data-testid="door-bubble"]').count();
    if (!bubble) {
      errors.push(`door bubble missing: ${key} ${mode}`);
      continue;
    }
    await assertDoorBubbleUnified(page, errors, `${key}-${mode}`);
    await assertDoorEnterInViewport(page, errors, `${key}-${mode}`);
    const portal = await page
      .locator('[data-testid="door-bubble"]')
      .getAttribute("data-portal");
    if (portal !== key) {
      errors.push(`door portal mismatch ${key} got ${portal}`);
    }
    if (landscape && page.viewportSize()?.width === 1280) {
      const shot = `${ART}/${TAG}-door-bubble-${key}-1280x800.png`;
      await page.locator(".island-viewport").screenshot({ path: shot });
      shots.push(shot);
      if (key === "chinese") {
        const legacy = `${ART}/${TAG}-door-bubble-1280x800.png`;
        await page.locator(".island-viewport").screenshot({ path: legacy });
        shots.push(legacy);
      }
    }
  }
}

async function assertDoorBubbleUnified(page, errors, ctx = "") {
  const ok = await page.evaluate(() => {
    const bubble = document.querySelector('[data-testid="door-bubble"]');
    const btn = document.querySelector('[data-testid="door-enter-btn"]');
    return Boolean(bubble && btn && bubble.contains(btn));
  });
  if (!ok) {
    errors.push(`${ctx} door enter button not inside door-bubble`);
  }
}

async function teleportMathDoor(page) {
  await page.evaluate(() => {
    const p = JSON.parse(localStorage.getItem("zhuzhu-pixel-adventure-v1"));
    p.player_x = 706;
    p.player_y = 1284;
    localStorage.setItem("zhuzhu-pixel-adventure-v1", JSON.stringify(p));
  });
  await page.reload({ waitUntil: "load" });
  await waitMapReady(page);
  await sleep(500);
}

async function assertPhoneHudCompact(page, errors) {
  const hud = await page.locator(".map-screen .hud").first().boundingBox();
  if (!hud) {
    errors.push("phone hud missing");
    return;
  }
  if (hud.height > 72) {
    errors.push(`phone hud height ${hud.height.toFixed(1)}px > 72px`);
  }
  const sound = await page.locator(".hud-sound-icon").boundingBox();
  if (sound && (sound.height > 48 || sound.width > 48)) {
    errors.push(`hud sound icon too large: ${sound.width?.toFixed(0)}x${sound.height?.toFixed(0)}`);
  }
}

async function assertDoorBubbleAtSchoolSizes(page, shots, errors) {
  const sizes = [
    [1280, 800],
    [1024, 768],
    [1920, 1080],
    [390, 844],
  ];
  for (const [w, h] of sizes) {
    await page.setViewportSize({ width: w, height: h });
    await teleportSchoolDoor(page, w >= 700);
    const bubble = page.locator('[data-testid="door-bubble"]');
    if (!(await bubble.count())) {
      errors.push(`door bubble missing at school ${w}x${h}`);
      continue;
    }
    await assertDoorBubbleLayout(page, errors, `school-bubble-${w}x${h}`);
    if (w === 1280 && h === 800) {
      await assertDoorBubbleUnified(page, errors, "school-1280");
      await assertBubbleNearHero(page, errors);
      const shot = `${ART}/${TAG}-door-bubble-1280x800.png`;
      await page.locator(".island-viewport").screenshot({ path: shot });
      shots.push(shot);
      const legacy = `${ART}/${TAG}-viewport-1280x800-school-door-bubble.png`;
      await page.screenshot({ path: legacy });
      shots.push(legacy);
    }
    if (w === 390 && h === 844) {
      await assertDoorBubbleUnified(page, errors, "school-390");
      const shot = `${ART}/${TAG}-door-bubble-390x844.png`;
      await page.locator(".island-viewport").screenshot({ path: shot });
      shots.push(shot);
      const legacy = `${ART}/${TAG}-viewport-390x844-school-door-bubble.png`;
      await page.screenshot({ path: legacy, fullPage: true });
      shots.push(legacy);
      const dock = await page.locator(".action-dock").boundingBox();
      if (dock && dock.height > 124) {
        errors.push(`390 dock hint strip too tall: ${dock.height.toFixed(0)}px`);
      }
      const shortHint = await page.locator('[data-testid="map-hint-door"]').count();
      if (!shortHint) {
        errors.push("390 missing short door hint at school");
      }
    }
  }
  await page.setViewportSize({ width: 1280, height: 800 });
  await teleportSchoolDoor(page, true);
}

async function sampleHeroSprite(page) {
  return page.evaluate(() => {
    const el = document.querySelector('[data-testid="island-player"]');
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return {
      col: el.getAttribute("data-walk-col"),
      row: el.getAttribute("data-walk-row"),
      h: rect.height,
      bg: getComputedStyle(el).backgroundPosition,
    };
  });
}

async function heroWalkCol(page) {
  return page.evaluate(
    () => document.querySelector('[data-testid="island-player"]')?.getAttribute("data-walk-col") ?? null
  );
}

async function waitHeroMotionSettle(page, maxMs = 700) {
  const deadline = Date.now() + maxMs;
  let last = await heroWorldX(page);
  while (Date.now() < deadline) {
    await sleep(45);
    const x = await heroWorldX(page);
    if (Number.isFinite(x) && Math.abs(x - last) < 0.08) {
      return true;
    }
    last = x;
  }
  return false;
}

async function heroWorldX(page) {
  return page.evaluate(() => {
    const el = document.querySelector('[data-testid="island-player"]');
    const attr = el?.getAttribute("data-world-x");
    if (attr != null && attr !== "") return parseFloat(attr);
    const raw = localStorage.getItem("zhuzhu-pixel-adventure-v1");
    if (!raw) return NaN;
    return JSON.parse(raw).player_x;
  });
}

async function heroWorldY(page) {
  return page.evaluate(() => {
    const el = document.querySelector('[data-testid="island-player"]');
    const attr = el?.getAttribute("data-world-y");
    if (attr != null && attr !== "") return parseFloat(attr);
    const raw = localStorage.getItem("zhuzhu-pixel-adventure-v1");
    if (!raw) return NaN;
    return JSON.parse(raw).player_y;
  });
}

/** Hold on-screen pad: smooth dt walk + leg frames; touch or real mouse (mousedown/up on fit pad). */
async function assertPadHoldSmooth(
  page,
  padTestId,
  errors,
  label,
  { touch = false, holdMs = 2000, axis = "x", sign = 1 } = {}
) {
  const pad = page.locator(`[data-testid="${padTestId}"]`);
  if (!(await pad.count())) {
    errors.push(`${label}: missing pad ${padTestId}`);
    return;
  }
  const coords = [];
  const cols = [];
  const snap = async () => {
    coords.push(axis === "y" ? await heroWorldY(page) : await heroWorldX(page));
    cols.push(await heroWalkCol(page));
  };
  await snap();
  const stepMs = 100;
  const fit = padTestId.startsWith("fit-");
  const box = await pad.boundingBox();
  if (!box) {
    errors.push(`${label}: pad bounding box missing`);
    return;
  }
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  if (fit && !touch) {
    await page.mouse.move(cx, cy);
    await page.mouse.down({ button: "left" });
  } else {
    await pad.dispatchEvent("pointerdown");
  }
  for (let t = 0; t < holdMs; t += stepMs) {
    await sleep(stepMs);
    await snap();
  }
  if (fit && !touch) await page.mouse.up({ button: "left" });
  else await pad.dispatchEvent("pointerup");
  let idleOk = false;
  try {
    await page.waitForFunction(
      () => document.querySelector('[data-testid="island-player"]')?.getAttribute("data-walk-col") === "0",
      { timeout: 500 }
    );
    idleOk = true;
  } catch {
    /* fall through */
  }
  if (!idleOk) {
    const idleCol = await heroWalkCol(page);
    if (idleCol !== "0") {
      errors.push(`${label}: after release expected idle walk col 0, got ${idleCol}`);
    }
  }
  if (!(await waitHeroMotionSettle(page))) {
    errors.push(`${label}: hero did not settle within 700ms after pad release`);
  }
  const stopCoord = axis === "y" ? await heroWorldY(page) : await heroWorldX(page);
  await sleep(80);
  const afterCoord = axis === "y" ? await heroWorldY(page) : await heroWorldX(page);

  const deltas = [];
  for (let i = 1; i < coords.length; i++) {
    deltas.push((coords[i] - coords[i - 1]) * sign);
    if (!((coords[i] - coords[i - 1]) * sign > 0) && i < coords.length - 2) {
      errors.push(
        `${label}: coord not strictly increasing at ${i}: ${coords[i - 1]} -> ${coords[i]} (axis=${axis})`
      );
    }
  }
  const moved = deltas.filter((d) => d > 0.02);
  const needSamples = Math.max(8, Math.floor(holdMs / stepMs) - 3);
  if (moved.length < needSamples) {
    errors.push(`${label}: too few walk samples (${moved.length}/${needSamples}) during ${holdMs}ms hold`);
  }
  if (moved.length >= 3) {
    const sorted = [...moved].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    for (let i = 0; i < deltas.length; i++) {
      if (deltas[i] > 0.02 && deltas[i] > median * 2 + 1.5) {
        errors.push(
          `${label}: step gap ${deltas[i].toFixed(2)} > 2× median ${median.toFixed(2)} at sample ${i}`
        );
      }
    }
  }
  let frameChanges = 0;
  for (let i = 1; i < cols.length; i++) {
    if (cols[i] != null && cols[i - 1] != null && cols[i] !== cols[i - 1]) frameChanges++;
  }
  if (frameChanges < 6) {
    errors.push(`${label}: walk frame changes ${frameChanges} (need ≥6); cols=${cols.join(",")}`);
  }
  if (Math.abs(afterCoord - stopCoord) > 3.0) {
    errors.push(`${label}: still drifting after release Δ=${(afterCoord - stopCoord).toFixed(2)}`);
  }
  const totalMove = (coords[coords.length - 1] - coords[0]) * sign;
  if (totalMove < 80) {
    errors.push(`${label}: hold walk Δ ${totalMove.toFixed(0)} (need ≥80 on ${axis})`);
  }
}

async function runPadHoldTouchMouseSuite(browser, errors) {
  const cases = [
    {
      label: "iphone-390-touch",
      w: 390,
      h: 844,
      hasTouch: true,
      pad: "pad-right",
      start: [80, 1275],
    },
    {
      label: "ipad-1024-touch",
      w: 1024,
      h: 1366,
      hasTouch: true,
      pad: "fit-pad-right",
      start: [80, 1060],
    },
    {
      label: "desktop-1280-mouse-right",
      w: 1280,
      h: 800,
      hasTouch: false,
      pad: "fit-pad-right",
      start: [150, 800],
      axis: "x",
      sign: 1,
    },
    {
      label: "desktop-1920-mouse-right",
      w: 1920,
      h: 1072,
      hasTouch: false,
      pad: "fit-pad-right",
      start: [150, 800],
      axis: "x",
      sign: 1,
    },
    {
      label: "desktop-1920-mouse-up",
      w: 1920,
      h: 1072,
      hasTouch: false,
      pad: "fit-pad-up",
      start: [400, 1100],
      axis: "y",
      sign: -1,
    },
  ];
  for (const c of cases) {
    const ctx = await browser.newContext({
      viewport: { width: c.w, height: c.h },
      hasTouch: c.hasTouch,
    });
    const page = await ctx.newPage();
    try {
      await page.goto(BASE, { waitUntil: "networkidle", timeout: 120000 });
      await pickCharacter(page);
      await setPlayerPos(page, c.start[0], c.start[1]);
      await assertPadHoldSmooth(page, c.pad, errors, c.label, {
        touch: c.hasTouch,
        axis: c.axis ?? "x",
        sign: c.sign ?? 1,
      });
    } catch (e) {
      errors.push(`${c.label}: ${e?.message ?? e}`);
    } finally {
      await ctx.close();
    }
  }
}

async function recordPadHold390Webm(browser, errors, shots) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    recordVideo: { dir: ART, size: { width: 390, height: 844 } },
  });
  const page = await ctx.newPage();
  try {
    await page.goto(BASE, { waitUntil: "networkidle", timeout: 120000 });
    await pickCharacter(page);
    await setPlayerPos(page, 80, 1275);
    const pad = page.locator('[data-testid="pad-right"]');
    await pad.dispatchEvent("pointerdown");
    await sleep(1800);
    await pad.dispatchEvent("pointerup");
    await sleep(400);
  } catch (e) {
    errors.push(`pad-hold-390-webm: ${e?.message ?? e}`);
  }
  const vid = page.video();
  await ctx.close();
  if (!vid) {
    errors.push("pad-hold-390-webm: no video handle");
    return;
  }
  const src = await vid.path();
  const dest = `${ART}/${TAG}-pad-hold-390.webm`;
  const fs = await import("node:fs/promises");
  await fs.rename(src, dest);
  shots.push(dest);
}

async function assertWalkSpriteAnim(page, errors, shots) {
  await page.locator(".island-viewport").click({ position: { x: 200, y: 200 } });
  await sleep(100);
  await page.keyboard.down("ArrowRight");
  const frames = [];
  for (let i = 0; i < 4; i++) {
    await sleep(125);
    frames.push(await sampleHeroSprite(page));
    const shot = `${ART}/${TAG}-walk-frame-${i}-1280.png`;
    await page.screenshot({ path: shot });
    shots.push(shot);
  }
  const firstCol = frames[0]?.col ?? "0";
  const firstBg = frames[0]?.bg ?? "";
  let sawChange = new Set(frames.map((f) => f?.col)).size >= 2;
  if (!sawChange) {
    try {
      await page.waitForFunction(
        ({ col0, bg0 }) => {
          const el = document.querySelector('[data-testid="island-player"]');
          if (!el) return false;
          const col = el.getAttribute("data-walk-col");
          const bg = getComputedStyle(el).backgroundPosition;
          return col !== col0 || bg !== bg0;
        },
        { col0: firstCol, bg0: firstBg },
        { timeout: 1500 }
      );
      sawChange = true;
      frames.push(await sampleHeroSprite(page));
    } catch {
      sawChange = false;
    }
  }
  await page.keyboard.up("ArrowRight");
  await sleep(250);
  const cols = frames.map((f) => f?.col);
  const bgs = frames.map((f) => f?.bg);
  const fitMode = await page.locator(".island-viewport-fit").count();
  if (!fitMode && !sawChange && new Set(cols).size < 2) {
    errors.push(`walk sprite data-walk-col static across 125ms samples: ${cols.join(",")}`);
  }
  if (!fitMode && !sawChange && new Set(bgs).size < 2) {
    errors.push(`walk sprite background-position static: ${bgs.join(" | ")}`);
  }
  const heights = frames.map((f) => f?.h).filter((h) => h != null);
  if (heights.length >= 4 && Math.max(...heights) - Math.min(...heights) > 2) {
    errors.push(
      `walk sprite height jitter ${(Math.max(...heights) - Math.min(...heights)).toFixed(2)}px > 2`
    );
  }
  if (frames[0]?.row !== "2") {
    errors.push(`expected walk row 2 (right), got ${frames[0]?.row}`);
  }
}

async function recordWalkAllDirections(browser, errors, shots) {
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    recordVideo: { dir: ART, size: { width: 1280, height: 800 } },
  });
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: "networkidle" });
  await pickCharacter(page);
  await waitMapReady(page);
  await page.evaluate(() => {
    const p = JSON.parse(localStorage.getItem("zhuzhu-pixel-adventure-v1"));
    p.player_x = 720;
    p.player_y = 780;
    localStorage.setItem("zhuzhu-pixel-adventure-v1", JSON.stringify(p));
  });
  await page.reload({ waitUntil: "networkidle" });
  await waitMapReady(page);
  for (const key of ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"]) {
    await page.keyboard.down(key);
    await sleep(1400);
    await page.keyboard.up(key);
    await sleep(350);
  }
  const vid = page.video();
  await ctx.close();
  if (!vid) {
    errors.push("walk webm: no video handle");
    return;
  }
  const src = await vid.path();
  const dest = `${ART}/${TAG}-walk-4dir.webm`;
  const fs = await import("node:fs/promises");
  await fs.rename(src, dest);
  shots.push(dest);
}

async function assertFitPlayerMoves(page, errors, shots = []) {
  await setPlayerPos(page, 720, 780);
  await page.keyboard.up("ArrowRight");
  await page.keyboard.up("ArrowLeft");
  await page.keyboard.up("ArrowUp");
  await page.keyboard.up("ArrowDown");
  await assertWalkSpriteAnim(page, errors, shots);
  const prog0 = await page.evaluate(() => {
    const p = JSON.parse(localStorage.getItem("zhuzhu-pixel-adventure-v1"));
    return { x: p.player_x, y: p.player_y };
  });
  await page.keyboard.down("ArrowRight");
  await sleep(1400);
  await page.keyboard.up("ArrowRight");
  await sleep(300);
  const prog1 = await page.evaluate(() => {
    const p = JSON.parse(localStorage.getItem("zhuzhu-pixel-adventure-v1"));
    return { x: p.player_x, y: p.player_y };
  });
  const walkShot = `${ART}/${TAG}-viewport-1280x800-walking.png`;
  await page.screenshot({ path: walkShot });
  shots.push(walkShot);
  if (prog1.x - prog0.x < 28) {
    errors.push(`fit hold ArrowRight: world Δx ${(prog1.x - prog0.x).toFixed(0)} (need >28)`);
  }
  await setPlayerPos(page, 520, 900);
  const progMid = await playerPos(page);
  await page.keyboard.down("ArrowRight");
  await page.keyboard.down("ArrowDown");
  await sleep(1100);
  await page.keyboard.up("ArrowRight");
  await page.keyboard.up("ArrowDown");
  await sleep(200);
  const progDiag = await page.evaluate(() => {
    const p = JSON.parse(localStorage.getItem("zhuzhu-pixel-adventure-v1"));
    return { x: p.player_x, y: p.player_y };
  });
  if (progDiag.x <= progMid.x + 6 && progDiag.y <= progMid.y + 6) {
    errors.push("fit diagonal keys did not move player on both axes");
  }
  const map = page.locator(".island-viewport-fit");
  const box = await map.boundingBox();
  const pl = await page.locator('[data-testid="island-player"]').boundingBox();
  if (box && pl) {
    const relX = Math.min(box.width - 8, Math.max(8, pl.x - box.x + 60));
    const relY = pl.y - box.y + pl.height * 0.2;
    await map.click({ position: { x: relX, y: relY } });
    await sleep(1500);
  }
  const pad = page.locator('[data-testid="fit-pad-right"]');
  const pb = await pad.boundingBox();
  if (pb) {
    await page.mouse.move(pb.x + pb.width / 2, pb.y + pb.height / 2);
    await page.mouse.down();
    await sleep(1600);
    await page.mouse.up();
  }
  await sleep(300);
  const progPad = await page.evaluate(() => JSON.parse(localStorage.getItem("zhuzhu-pixel-adventure-v1")).player_x);
  if (progPad <= progDiag.x + 4) {
    errors.push("fit pad hold-to-walk did not advance player");
  }
  if (await page.locator('[data-testid="enter-portal"]').count()) {
    errors.push("fit dock still has enter-portal (must use door bubble only)");
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
    await page.evaluate(() => {
      const p = JSON.parse(localStorage.getItem("zhuzhu-pixel-adventure-v1"));
      p.player_x = 852;
      p.player_y = 1070;
      localStorage.setItem("zhuzhu-pixel-adventure-v1", JSON.stringify(p));
    });
    await page.reload({ waitUntil: "networkidle" });
    await waitMapReady(page);
    await assertFitLabels(page, errors);
    await assertChestVisible(page, errors);
    await assertChestNotUnderLabels(page, errors);
    await assertHintOutsideMap(page, errors);
    await assertHintStripZhuyinInViewport(page, errors);
    await assertPlayerHeightFit(page, errors);
    await assertPlayerInsideMap(page, errors);
    if (w === 1280 && h === 800) {
      await assertFitPlayerMoves(page, errors, shots);
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

  await assertDoorBubbleAtSchoolSizes(page, shots, errors);
  const bubble = page.locator('[data-testid="door-bubble"]');
  if (!(await bubble.count())) {
    errors.push("door bubble missing at school door after size matrix (1280)");
  } else {
    await assertHintStripZhuyinInViewport(page, errors);
    await assertMapViewportHeightStable(page, mapHeightBaseline, errors, "door");
    await assertFitLabels(page, errors);
    await assertDoorBubbleLayout(page, errors, "school-bubble-1280-final");
    await page.keyboard.press("Enter");
    try {
      await waitHubOrLesson(page);
    } catch {
      errors.push("fit Enter at school door did not open hub");
      return;
    }
    await exitToMap(page);
    await teleportSchoolDoor(page, true);
    await page.locator('[data-testid="fit-pad-right"]').dispatchEvent("pointerdown");
    await sleep(400);
    await page.locator('[data-testid="fit-pad-right"]').dispatchEvent("pointerup");
    await sleep(300);
    if (!await page.locator(".unit-island-card").count()) {
      // good — pad alone must not enter
    } else {
      errors.push("pad near school auto-entered (forbidden)");
    }
    await teleportSchoolDoor(page, true);
    await page.keyboard.press("Enter");
    await waitHubOrLesson(page);
    await page.locator(".unit-island-card").first().click();
    await page.waitForSelector(".opt-grid button", { timeout: 30000 });
    const quizShot = `${ART}/${TAG}-quiz-1280-fit.png`;
    await page.screenshot({ path: quizShot, fullPage: true });
    shots.push(quizShot);
    await page.locator(".opt-grid button").first().click();
    await sleep(1200);
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
    const p = raw ? JSON.parse(raw) : {};
    const el = document.querySelector('[data-testid="island-player"]');
    const wx = el?.getAttribute("data-world-x");
    const wy = el?.getAttribute("data-world-y");
    return {
      x: wx != null && wx !== "" ? parseFloat(wx) : p.player_x,
      y: wy != null && wy !== "" ? parseFloat(wy) : p.player_y,
      id: p.character_id,
    };
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
    for (const msg of assertDoorReachability(DIST)) {
      errors.push(`reachability: ${msg}`);
    }
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
    try {
      await runKeyboardDoorEnterSuite(page, shots, errors);
    } catch (e) {
      errors.push(`keyboard door enter suite: ${e?.message ?? e}`);
    }
    await page.goto(BASE, { waitUntil: "load", timeout: 120000 });
    if (await page.locator(".char-grid-12 .char-card").count()) {
      await pickCharacter(page);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await ensureMapScreen(page);
    await setPlayerPos(page, 322, 1194);
    const initial390 = `${ART}/${TAG}-initial-390x844.png`;
    await page.screenshot({ path: initial390, fullPage: true });
    shots.push(initial390);
    await assertPhoneHudCompact(page, errors);
    await assertNoPageScroll(page, errors, "390-pre-walk");
    await assertPadButtonsInViewport(page, errors, "390-pre-walk");
    await assertPhoneMapHeightBand(page, errors);
    await assertViewportMode(page, "follow", errors);
    await page.keyboard.down("ArrowRight");
    await sleep(700);
    await assertHeroViewportMargin(page, errors);
    await assertHeroFeetWalkable(page, errors, DIST);
    await assertNoPageScroll(page, errors, "390-walking");
    await assertPadButtonsInViewport(page, errors, "390-walking");
    const walk390 = `${ART}/${TAG}-viewport-390x844-walking.png`;
    await page.screenshot({ path: walk390, fullPage: false });
    shots.push(walk390);
    await page.keyboard.up("ArrowRight");
    await sleep(200);

    await page.setViewportSize({ width: 375, height: 667 });
    await waitMapReady(page);
    await sleep(400);
    await assertNoPageScroll(page, errors, "375x667");
    await assertPadButtonsInViewport(page, errors, "375x667");
    const shot375 = `${ART}/${TAG}-map-screen-375x667.png`;
    await page.screenshot({ path: shot375, fullPage: false });
    shots.push(shot375);
    await page.setViewportSize({ width: 390, height: 844 });
    await waitMapReady(page);
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

    // Near school door (portrait map door point, south of facade for bubble clearance)
    await page.evaluate(() => {
      const p = JSON.parse(localStorage.getItem("zhuzhu-pixel-adventure-v1"));
      p.player_x = 350;
      p.player_y = 1200;
      localStorage.setItem("zhuzhu-pixel-adventure-v1", JSON.stringify(p));
    });
    await page.reload({ waitUntil: "networkidle" });
    await waitMapReady(page);
    await sleep(400);
    const schoolShot = `${ART}/${TAG}-map-school-390x844-bubble.png`;
    await page.screenshot({ path: schoolShot, fullPage: true });
    shots.push(schoolShot);

    const bubble390 = page.locator('[data-testid="door-bubble"]');
    if (!(await bubble390.count())) {
      errors.push("door bubble missing at school (390)");
    }
    const enter = page.locator('[data-testid="door-enter-btn"]');
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
      errors.push("door enter button not visible at school (390)");
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
    const chestBubble = page.locator('[data-testid="door-enter-btn"]');
    if (await chestBubble.count()) {
      await chestBubble.click({ force: true });
      await sleep(500);
      const chestShot = `${ART}/${TAG}-treasure-390.png`;
      await page.screenshot({ path: chestShot, fullPage: true });
      shots.push(chestShot);
      try {
        await page.locator(".collection-panel button.primary").click({ force: true, timeout: 8000 });
        await sleep(400);
      } catch {
        /* optional panel UX; not gating v9.17 door/walk checks */
      }
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

    await page.setViewportSize({ width: 390, height: 844 });
    await teleportMathDoor(page);
    const mathBubble = await page.locator('[data-testid="door-bubble"]').count();
    if (!mathBubble) {
      errors.push("math-390 door bubble missing");
    }
    await assertDoorEnterInViewport(page, errors, "math-390");
    await assertDoorBubbleUnified(page, errors, "math-390");
    const mathShot = `${ART}/${TAG}-door-bubble-math-390x844.png`;
    await page.locator(".island-viewport").screenshot({ path: mathShot });
    shots.push(mathShot);

    await assertEveryBuildingDoor(page, errors, false, shots);
    await page.setViewportSize({ width: 1280, height: 800 });
    await assertEveryBuildingDoor(page, errors, true, shots);

    try {
      await runSchoolFacadeApproachSuite(page, shots, errors);
    } catch (e) {
      errors.push(`school facade approach suite: ${e?.message ?? e}`);
    }

    try {
      await runPadHoldTouchMouseSuite(browser, errors);
      await recordPadHold390Webm(browser, errors, shots);
    } catch (e) {
      errors.push(`pad hold suite: ${e?.message ?? e}`);
    }

    await recordWalkRightContact1920(browser, errors, shots);
    await recordWalkAllDirections(browser, errors, shots);

    try {
      await assertBridgeCrossingHeldFromSpawn(page, errors);
      await page.setViewportSize({ width: 1280, height: 800 });
      await walkToTreasureEnter(page, errors, "treasure-1280");
      await page.setViewportSize({ width: 390, height: 844 });
      await walkToTreasureEnter(page, errors, "treasure-390");
      await assertAllBuildingBubblesTextFit(page, errors);
      await captureV919DoorScreenshots(page, shots, errors);
      await captureV918Screenshots(page, shots);
    } catch (e) {
      errors.push(`v9.19 suite: ${e?.message ?? e}`);
    }

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
