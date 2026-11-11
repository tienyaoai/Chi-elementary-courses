/**
 * v9.21j: walk along real path spine to each door; bubble must appear at the door mouth (esp. 國語).
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { inDoorTrigger } from "./door_trigger.mjs";

const ART = "/opt/cursor/artifacts";
const TAG = process.env.E2E_TAG || "v9.21k";
const MAP_CFG = JSON.parse(
  readFileSync(path.resolve("..", "src", "map_config.json"), "utf8")
);

const TRIGGER_HW = 30;
const TRIGGER_HH = 26;

/** World waypoints along dirt path (not straight line to door center). */
const PATHS_PORTRAIT = {
  chinese: [
    [258, 1225],
    [275, 1210],
    [292, 1202],
    [304, 1200],
  ],
  math: [
    [322, 1230],
    [400, 1250],
    [520, 1270],
    [650, 1290],
    [720, 1288],
    [732, 1284],
  ],
  english: [
    [322, 1230],
    [500, 1100],
    [700, 850],
    [820, 750],
    [884, 724],
  ],
  treasure: [
    [322, 1230],
    [400, 1180],
    [480, 1100],
    [520, 1060],
    [555, 1024],
  ],
};

const PATHS_LANDSCAPE = {
  chinese: [
    [852, 1070],
    [830, 1076],
    [806, 1076],
  ],
  math: [
    [852, 1070],
    [1200, 1020],
    [1500, 1000],
    [1698, 999],
  ],
  english: [
    [852, 1070],
    [1400, 700],
    [1800, 600],
    [2074, 575],
  ],
  treasure: [
    [852, 1070],
    [1000, 950],
    [1164, 788],
  ],
};

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
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
  await sleep(300);
}

async function bubbleVisible(page) {
  return (await page.locator('[data-testid="door-bubble"]').count()) > 0;
}

function inDoorRect(x, y, building, orient) {
  return inDoorTrigger(building, x, y, orient);
}

export async function runDoorPathApproach(page, errors = []) {
  const doorsP = MAP_CFG.door_points_portrait;
  const doorsL = MAP_CFG.door_points_landscape;
  const report = { tag: TAG, runs: [] };

  for (const [vp, doors, paths, w, h, orient] of [
    ["390x844", doorsP, PATHS_PORTRAIT, 390, 844, "portrait"],
    ["1280x800", doorsL, PATHS_LANDSCAPE, 1280, 800, "landscape"],
  ]) {
    await page.setViewportSize({ width: w, height: h });
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

    for (const [key, waypoints] of Object.entries(paths)) {
      const door = doors[key];
      let bubbleAtDoor = false;
      const trail = [];
      for (const [x, y] of waypoints) {
        await setPos(page, x, y);
        const bubble = await bubbleVisible(page);
        const atDoor = inDoorRect(x, y, key, orient);
        trail.push({ x, y, bubble, atDoor });
        if (atDoor && bubble) bubbleAtDoor = true;
      }
      const last = waypoints[waypoints.length - 1];
      const finalBubble = await bubbleVisible(page);
      if (!finalBubble) {
        errors.push(`${vp} ${key}: no bubble after path approach ending (${last[0]},${last[1]})`);
      }
      if (inDoorRect(last[0], last[1], key, orient) && !bubbleAtDoor) {
        errors.push(`${vp} ${key}: stood in door rect on path but bubble never on`);
      }
      report.runs.push({ viewport: vp, building: key, door, final: last, bubbleAtDoor, trail });
    }
  }

  const shotP = `${ART}/${TAG}-chinese-door-bubble-390.png`;
  await page.setViewportSize({ width: 390, height: 844 });
  await setPos(page, ...PATHS_PORTRAIT.chinese.slice(-1)[0]);
  await sleep(400);
  await page.locator(".island-viewport").screenshot({ path: shotP });
  report.screenshots = { portraitChinese: shotP };

  await page.setViewportSize({ width: 1280, height: 800 });
  await setPos(page, ...PATHS_LANDSCAPE.chinese.slice(-1)[0]);
  await sleep(400);
  const shotL = `${ART}/${TAG}-chinese-door-bubble-1280.png`;
  await page.locator(".island-viewport").screenshot({ path: shotL });
  report.screenshots.landscapeChinese = shotL;

  const out = `${ART}/${TAG}-door-path-approach.json`;
  writeFileSync(out, JSON.stringify(report, null, 2));
  report.outPath = out;
  return report;
}
