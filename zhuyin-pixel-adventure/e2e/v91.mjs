#!/usr/bin/env node
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { createReadStream, writeFileSync } from "node:fs";
import { PNG } from "pngjs";
import path from "node:path";

const ART = "/opt/cursor/artifacts";
const TAG = process.env.E2E_TAG || "v9.13";
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
  if (r.bw && r.bw > 268) {
    errors.push(`${label}: bubble width ${r.bw.toFixed(0)}px > 268`);
  }
}

async function teleportSchoolDoor(page, landscape) {
  await page.evaluate((land) => {
    const p = JSON.parse(localStorage.getItem("zhuzhu-pixel-adventure-v1"));
    if (land) {
      p.player_x = 834;
      p.player_y = 1192;
    } else {
      p.player_x = 350;
      p.player_y = 1200;
    }
    localStorage.setItem("zhuzhu-pixel-adventure-v1", JSON.stringify(p));
  }, landscape);
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

async function assertPhoneMapTall(page, errors, minPx = 420) {
  const vp = await page.locator(".island-viewport-follow").boundingBox();
  if (!vp) {
    errors.push("follow map viewport missing");
    return;
  }
  if (vp.height < minPx) {
    errors.push(`390 map viewport height ${vp.height.toFixed(0)}px < ${minPx}px`);
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
  if (!sawChange && new Set(cols).size < 2) {
    errors.push(`walk sprite data-walk-col static across 125ms samples: ${cols.join(",")}`);
  }
  if (!sawChange && new Set(bgs).size < 2) {
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
  await page.evaluate(() => {
    const p = JSON.parse(localStorage.getItem("zhuzhu-pixel-adventure-v1"));
    p.player_x = 1180;
    p.player_y = 820;
    localStorage.setItem("zhuzhu-pixel-adventure-v1", JSON.stringify(p));
  });
  await page.reload({ waitUntil: "load" });
  await waitMapReady(page);
  await assertWalkSpriteAnim(page, errors, shots);
  const prog0 = await page.evaluate(() => {
    const p = JSON.parse(localStorage.getItem("zhuzhu-pixel-adventure-v1"));
    return { x: p.player_x, y: p.player_y };
  });
  await page.keyboard.down("ArrowRight");
  await sleep(1000);
  await page.keyboard.up("ArrowRight");
  await sleep(300);
  const prog1 = await page.evaluate(() => {
    const p = JSON.parse(localStorage.getItem("zhuzhu-pixel-adventure-v1"));
    return { x: p.player_x, y: p.player_y };
  });
  const walkShot = `${ART}/${TAG}-viewport-1280x800-walking.png`;
  await page.screenshot({ path: walkShot });
  shots.push(walkShot);
  if (prog1.x - prog0.x < 50) {
    errors.push(`fit hold ArrowRight: world Δx ${(prog1.x - prog0.x).toFixed(0)} (need >50)`);
  }
  await page.keyboard.down("ArrowRight");
  await page.keyboard.down("ArrowDown");
  await sleep(600);
  await page.keyboard.up("ArrowRight");
  await page.keyboard.up("ArrowDown");
  await sleep(200);
  const progDiag = await page.evaluate(() => {
    const p = JSON.parse(localStorage.getItem("zhuzhu-pixel-adventure-v1"));
    return { x: p.player_x, y: p.player_y };
  });
  if (progDiag.x <= prog1.x + 20 || progDiag.y <= prog1.y + 20) {
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
  await pad.dispatchEvent("pointerdown");
  await sleep(800);
  await pad.dispatchEvent("pointerup");
  await sleep(200);
  const progPad = await page.evaluate(() => JSON.parse(localStorage.getItem("zhuzhu-pixel-adventure-v1")).player_x);
  if (progPad <= progDiag.x + 15) {
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
    await page.locator('[data-testid="fit-pad-right"]').dispatchEvent("pointerdown");
    await sleep(400);
    await page.locator('[data-testid="fit-pad-right"]').dispatchEvent("pointerup");
    await sleep(300);
    if (!await page.locator(".unit-island-card").count()) {
      // good — pad alone must not enter
    } else {
      errors.push("pad near school auto-entered (forbidden)");
    }
    await page.keyboard.press("Enter");
    await sleep(800);
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
    await assertPhoneHudCompact(page, errors);
    await assertPhoneMapTall(page, errors);
    await assertViewportMode(page, "follow", errors);
    await page.keyboard.down("ArrowRight");
    await sleep(600);
    await assertHeroViewportMargin(page, errors);
    const walk390 = `${ART}/${TAG}-viewport-390x844-walking.png`;
    await page.screenshot({ path: walk390, fullPage: true });
    shots.push(walk390);
    await page.keyboard.up("ArrowRight");
    await sleep(200);
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

    await page.setViewportSize({ width: 390, height: 844 });
    await teleportMathDoor(page);
    const mathBubble = await page.locator('[data-testid="door-bubble"]').count();
    if (!mathBubble) {
      errors.push("math-390 door bubble missing");
    }
    const mathShot = `${ART}/${TAG}-door-bubble-math-390x844.png`;
    await page.locator(".island-viewport").screenshot({ path: mathShot });
    shots.push(mathShot);

    await recordWalkAllDirections(browser, errors, shots);

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
