/**
 * Per-building door bubble appear distance: approach from 4 axes in 8px steps.
 * Enter / bubble button must not fire outside the 30×26 door rect.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  DOOR_TRIGGER_HALF_W,
  DOOR_TRIGGER_HALF_H_DOWN,
  DOOR_TRIGGER_HALF_H_UP,
  inDoorTrigger,
} from "./door_trigger.mjs";

const ART = "/opt/cursor/artifacts";
const TAG = process.env.E2E_TAG || "v9.21h";
const MAP_CFG = JSON.parse(
  readFileSync(path.resolve("..", "src", "map_config.json"), "utf8")
);
const ORIENT_P = "portrait";
const ORIENT_L = "landscape";
const APPROACH_START = 120;
const APPROACH_STEP = 8;
const MAX_APPEAR_PX = 20;
/** Max difference between buildings' worst-axis appear distance on the same viewport. */
const BUILDING_SPREAD_TOL_PX = 12;

const DOORS_P = MAP_CFG.door_points_portrait;
const DOORS_L = MAP_CFG.door_points_landscape;

const DIRS = [
  { id: "east", startOx: APPROACH_START, startOy: 0, dOx: -APPROACH_STEP, dOy: 0 },
  { id: "west", startOx: -APPROACH_START, startOy: 0, dOx: APPROACH_STEP, dOy: 0 },
  { id: "south", startOx: 0, startOy: APPROACH_START, dOx: 0, dOy: -APPROACH_STEP },
  { id: "north", startOx: 0, startOy: -APPROACH_START, dOx: 0, dOy: APPROACH_STEP },
];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function doorDist(dx, dy) {
  return Math.max(Math.abs(dx), Math.abs(dy));
}

function inDoorRect(px, py, building, orient) {
  return inDoorTrigger(building, px, py, orient);
}

async function setPos(page, x, y) {
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
  await page.locator(".island-viewport").first().waitFor({ state: "visible", timeout: 60000 });
  await page.locator('[data-testid="island-player"]').waitFor({ state: "attached", timeout: 60000 });
  await sleep(350);
}

async function bubbleVisible(page) {
  return (await page.locator('[data-testid="door-bubble"]').count()) > 0;
}

async function readHero(page) {
  return page.evaluate(() => {
    const el = document.querySelector('[data-testid="island-player"]');
    return {
      x: parseFloat(el?.getAttribute("data-world-x") || "0"),
      y: parseFloat(el?.getAttribute("data-world-y") || "0"),
    };
  });
}

/** Walk along axis from 120px out toward door; record first bubble distance (Chebyshev from door foot). */
async function measureApproaches(page, building, door) {
  const [dx, dy] = door;
  const byDir = {};
  for (const dir of DIRS) {
    let ox = dir.startOx;
    let oy = dir.startOy;
    let firstDist = null;
    const samples = [];
    for (let step = 0; step <= Math.ceil((APPROACH_START * 2) / APPROACH_STEP); step++) {
      const x = dx + ox;
      const y = dy + oy;
      await setPos(page, x, y);
      const bubble = await bubbleVisible(page);
      const dist = doorDist(ox, oy);
      samples.push({ x, y, ox, oy, dist, bubble });
      if (bubble && firstDist == null) {
        firstDist = dist;
      }
      if (dist <= 0 && bubble) break;
      ox += dir.dOx;
      oy += dir.dOy;
      if (doorDist(ox, oy) > APPROACH_START + APPROACH_STEP) break;
    }
    byDir[dir.id] = { firstAppearDistPx: firstDist, samples };
  }
  return { building, door, byDir };
}

async function assertEnterBlockedOutside(page, building, door, errors, ctx) {
  const [dx, dy] = door;
  const outside = [
    [dx + DOOR_TRIGGER_HALF_W + 12, dy],
    [dx, dy + DOOR_TRIGGER_HALF_H_DOWN + 12],
    [dx - DOOR_TRIGGER_HALF_W - 12, dy],
    [dx, dy - DOOR_TRIGGER_HALF_H_UP - 12],
  ];
  for (const [x, y] of outside) {
    if (inDoorRect(x, y, building, ctx.includes("1280") || ctx.includes("1920") ? ORIENT_L : ORIENT_P))
      continue;
    await setPos(page, x, y);
    const bubble = await bubbleVisible(page);
    if (bubble) {
      errors.push(`${ctx} ${building}: bubble visible outside rect at (${x},${y})`);
    }
    const beforeHub = await page.locator(".grade1-hub").count();
    await page.keyboard.press("Enter");
    await sleep(250);
  const hubNow = await page.locator(".grade1-hub").count();
    const onMap = (await page.locator(".island-viewport").count()) > 0;
    if (building === "chinese" && hubNow > beforeHub) {
      errors.push(`${ctx} chinese: Enter opened hub from outside at (${x},${y})`);
      await page.evaluate(() => history.back());
      await sleep(400);
    }
    if (building === "treasure" && !onMap && hubNow === 0) {
      const coll = await page.locator(".collection-screen, [data-testid='collection']").count();
      if (coll > 0) {
        errors.push(`${ctx} treasure: Enter opened collection from outside at (${x},${y})`);
        await page.evaluate(() => history.back());
        await sleep(400);
      }
    }
    if (bubble) {
      errors.push(`${ctx} ${building}: bubble visible outside rect at (${x},${y})`);
    }
  }
}

export async function runDoorBubbleApproach(page, errors = []) {
  const viewports = [
    { tag: "390x844", w: 390, h: 844, doors: DOORS_P },
    { tag: "1280x800", w: 1280, h: 800, doors: DOORS_L },
    { tag: "1920x1080", w: 1920, h: 1080, doors: DOORS_L },
  ];
  const report = { tag: TAG, viewports: {}, summary: {} };

  for (const vp of viewports) {
    await page.setViewportSize({ width: vp.w, height: vp.h });
    await page.goto(process.env.E2E_BASE || "http://127.0.0.1:8788", {
      waitUntil: "networkidle",
      timeout: 120000,
    });
    if (await page.locator(".char-grid-12 .char-card").count()) {
      await page.locator(".char-grid-12 .char-card").first().click();
      await page.locator("button.pixel-btn.primary.big-touch").click();
    }
    await page.locator(".island-viewport").first().waitFor({ state: "visible", timeout: 60000 });
    await sleep(400);

    const buildings = {};
    const perBuildingWorst = {};
    for (const key of Object.keys(vp.doors)) {
      const door = vp.doors[key];
      buildings[key] = await measureApproaches(page, key, door);
      let worst = 0;
      for (const dir of Object.keys(buildings[key].byDir)) {
        const d = buildings[key].byDir[dir].firstAppearDistPx;
        if (d == null) {
          errors.push(`${vp.tag} ${key} ${dir}: bubble never appeared along approach`);
        } else if (d > MAX_APPEAR_PX + 2) {
          errors.push(`${vp.tag} ${key} ${dir}: bubble at ${d}px > ${MAX_APPEAR_PX}px`);
        } else {
          worst = Math.max(worst, d);
        }
      }
      perBuildingWorst[key] = worst;
      if (key === "chinese" || key === "treasure") {
        await assertEnterBlockedOutside(page, key, door, errors, vp.tag);
      }
    }
    const vals = Object.values(perBuildingWorst).filter((v) => v > 0);
    const spread = vals.length ? Math.max(...vals) - Math.min(...vals) : 0;
    report.summary[vp.tag] = { perBuildingWorst, spread };
    if (spread > BUILDING_SPREAD_TOL_PX) {
      errors.push(
        `${vp.tag}: building appear spread ${spread.toFixed(1)}px > ${BUILDING_SPREAD_TOL_PX}px (${JSON.stringify(perBuildingWorst)})`
      );
    }
    report.viewports[vp.tag] = { buildings, perBuildingWorst };

    if (vp.tag === "390x844") {
      await page.evaluate(() => localStorage.clear());
      await page.goto(process.env.E2E_BASE || "http://127.0.0.1:8788", {
        waitUntil: "networkidle",
        timeout: 120000,
      });
      if (await page.locator(".char-grid-12 .char-card").count()) {
        await page.locator(".char-grid-12 .char-card").first().click();
        await page.locator("button.pixel-btn.primary.big-touch").click();
      }
      await sleep(500);
      if (await bubbleVisible(page)) {
        errors.push(`${vp.tag}: bubble visible at portrait spawn before reaching any door`);
      }
    }
  }

  const outPath = `${ART}/${TAG}-door-approach-distances.json`;
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  const table = [];
  for (const [vp, data] of Object.entries(report.summary)) {
    for (const [building, worst] of Object.entries(data.perBuildingWorst || {})) {
      table.push({ viewport: vp, building, worstAxisAppearPx: worst });
    }
  }
  const tablePath = `${ART}/${TAG}-door-approach-table.json`;
  writeFileSync(tablePath, JSON.stringify({ tag: TAG, table, summary: report.summary }, null, 2));
  report.outPath = outPath;
  report.tablePath = tablePath;
  return report;
}
