/**
 * v9.21k: 國語學校 — 三條進門路徑 + 離開一步泡泡消失；直式/橫式。
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { inDoorTrigger, doorPoint } from "./door_trigger.mjs";

const ART = "/opt/cursor/artifacts";
const TAG = process.env.E2E_TAG || "v9.21k";

const MAP_CFG = JSON.parse(
  readFileSync(path.resolve("..", "src", "map_config.json"), "utf8")
);

const CHINESE_DOOR_P = MAP_CFG.door_points_portrait.chinese;
const CHINESE_DOOR_L = MAP_CFG.door_points_landscape.chinese;

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
  await sleep(350);
}

async function bubbleVisible(page) {
  return (await page.locator('[data-testid="door-bubble"]').count()) > 0;
}

const PATHS_P = {
  dirtPath: [
    [258, 1225],
    [268, 1220],
    [278, 1210],
    [292, 1202],
    CHINESE_DOOR_P,
  ],
  southStraight: [
    [304, 1240],
    [304, 1225],
    [304, 1210],
    CHINESE_DOOR_P,
  ],
  fromRight: [
    [340, 1200],
    [322, 1200],
    [304, 1200],
  ],
};

const PATHS_L = {
  dirtPath: [
    [880, 1080],
    [850, 1078],
    [830, 1076],
    CHINESE_DOOR_L,
  ],
  southStraight: [
    [806, 1105],
    [806, 1090],
    CHINESE_DOOR_L,
  ],
  fromRight: [
    [850, 1070],
    [830, 1074],
    CHINESE_DOOR_L,
  ],
};

async function runPath(page, name, waypoints, orient, errors, ctx) {
  let bubbleOnDoor = false;
  for (const [x, y] of waypoints) {
    await setPos(page, x, y);
    const bubble = await bubbleVisible(page);
    const inZ = inDoorTrigger("chinese", x, y, orient);
    if (inZ && !bubble) {
      errors.push(`${ctx} ${name}: in zone at (${x},${y}) but no bubble`);
    }
    if (inZ && bubble && (x === waypoints.at(-1)[0] && y === waypoints.at(-1)[1])) {
      bubbleOnDoor = true;
    }
  }
  const [fx, fy] = waypoints.at(-1);
  if (!bubbleOnDoor) {
    errors.push(`${ctx} ${name}: no bubble at door (${fx},${fy})`);
  }
  const exits = [
    [fx, fy + 34],
    [fx - 34, fy],
    [fx + 34, fy],
    [245, fy],
  ];
  for (const [x, y] of exits) {
    if (inDoorTrigger("chinese", x, y, orient)) continue;
    await setPos(page, x, y);
    if (await bubbleVisible(page)) {
      errors.push(`${ctx} ${name}: bubble still visible outside zone at (${x},${y})`);
    }
  }
  return { name, door: waypoints.at(-1), bubbleOnDoor };
}

export async function runV921kChineseDoor(page, errors = []) {
  const report = { tag: TAG, paths: [], screenshots: {} };

  await page.goto(process.env.E2E_BASE || "http://127.0.0.1:8788", {
    waitUntil: "networkidle",
    timeout: 120000,
  });
  if (await page.locator(".char-grid-12 .char-card").count()) {
    await page.locator(".char-grid-12 .char-card").first().click();
    await page.locator("button.pixel-btn.primary.big-touch").click();
  }
  await page.locator(".island-viewport").first().waitFor({ state: "visible", timeout: 60000 });

  for (const [ctx, w, h, orient, paths, door] of [
    ["390x844", 390, 844, "portrait", PATHS_P, CHINESE_DOOR_P],
    ["1280x800", 1280, 800, "landscape", PATHS_L, CHINESE_DOOR_L],
  ]) {
    await page.setViewportSize({ width: w, height: h });
    await sleep(400);
    const runs = [];
    for (const [name, waypoints] of Object.entries(paths)) {
      runs.push(await runPath(page, name, waypoints, orient, errors, ctx));
    }
    report.paths.push({ viewport: ctx, runs });
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await setPos(page, ...CHINESE_DOOR_P);
  await sleep(400);
  const front = `${ART}/${TAG}-chinese-door-front-390.png`;
  await page.locator(".island-viewport").screenshot({ path: front });
  report.screenshots.doorFront390 = front;

  await setPos(page, 275, 1200);
  if (!(await bubbleVisible(page))) {
    errors.push("390: path spine (275,1200) should show bubble inside extended zone");
  }
  const pathShot = `${ART}/${TAG}-chinese-door-path-390.png`;
  await page.locator(".island-viewport").screenshot({ path: pathShot });
  report.screenshots.dirtPath390 = pathShot;

  await setPos(page, ...CHINESE_DOOR_P);
  await sleep(200);
  if (!(await bubbleVisible(page))) {
    errors.push("390: door front (304,1200) must show bubble");
  }

  const out = `${ART}/${TAG}-chinese-door-paths.json`;
  writeFileSync(out, JSON.stringify(report, null, 2));
  report.outPath = out;
  return report;
}
