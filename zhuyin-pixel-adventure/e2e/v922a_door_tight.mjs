/**
 * v9.22a: tight door-step bubbles — appear within ~20px of door foot; beside / one step out = off.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import {
  DOOR_TRIGGER_HALF_W,
  DOOR_TRIGGER_HALF_H_DOWN,
  distToDoorFoot,
  doorPoint,
  inDoorTrigger,
} from "./door_trigger.mjs";

const ART = "/opt/cursor/artifacts";
const TAG = process.env.E2E_TAG || "v9.22a";
const MAX_APPEAR_DIST = 20;
const BUILDINGS = ["chinese", "english", "math", "treasure"];

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
  await sleep(320);
}

async function bubbleVisible(page) {
  return (await page.locator('[data-testid="door-bubble"]').count()) > 0;
}

async function pickMap(page) {
  if (await page.locator(".char-grid-12 .char-card").count()) {
    await page.locator(".char-grid-12 .char-card").first().click();
    await page.locator("button.pixel-btn.primary.big-touch").click();
  }
  await page.locator(".island-viewport").first().waitFor({ state: "visible", timeout: 60000 });
  await sleep(350);
}

/** Step along +y toward door from 96px south; record first bubble distance from door foot. */
async function approachFromSouth(page, building, orient) {
  const [dx, dy] = doorPoint(building, orient);
  let first = null;
  for (let oy = 96; oy >= -8; oy -= 4) {
    const x = dx;
    const y = dy + oy;
    await setPos(page, x, y);
    const bubble = await bubbleVisible(page);
    const dist = distToDoorFoot(x, y, building, orient);
    if (bubble && first == null) first = { x, y, distPx: +dist.toFixed(2), oy };
  }
  return first;
}

async function testBuilding(page, building, orient, ctx, errors, shots) {
  const [dx, dy] = doorPoint(building, orient);
  const appear = await approachFromSouth(page, building, orient);
  if (!appear) {
    errors.push(`${ctx} ${building}: bubble never appeared approaching from south`);
    return;
  }
  if (appear.distPx > MAX_APPEAR_DIST + 0.5) {
    errors.push(
      `${ctx} ${building}: bubble at ${appear.distPx}px from door (max ${MAX_APPEAR_DIST}) at (${appear.x},${appear.y})`
    );
  }
  const beside = [dx + DOOR_TRIGGER_HALF_W + 14, dy];
  const stepOut = [dx, dy + DOOR_TRIGGER_HALF_H_DOWN + 14];
  for (const [x, y, label] of [
    [beside[0], beside[1], "beside"],
    [stepOut[0], stepOut[1], "step-out"],
  ]) {
    await setPos(page, x, y);
    if (inDoorTrigger(building, x, y, orient)) continue;
    if (await bubbleVisible(page)) {
      errors.push(`${ctx} ${building}: bubble at ${label} (${x},${y}) outside trigger`);
    }
  }
  if (ctx === "390x844") {
    await setPos(page, appear.x, appear.y);
    await sleep(200);
    const onPath = `${ART}/${TAG}-${building}-bubble-on-390.png`;
    await page.locator(".island-viewport").screenshot({ path: onPath });
    shots[`${building}-on`] = onPath;
    await setPos(page, stepOut[0], stepOut[1]);
    await sleep(200);
    const offPath = `${ART}/${TAG}-${building}-bubble-off-390.png`;
    await page.locator(".island-viewport").screenshot({ path: offPath });
    shots[`${building}-off`] = offPath;
  }
  return appear;
}

/** 國語直式：土路 (275,1200) 不應出現；木門 (304,1200) 應出現。 */
async function testChinesePathSpine(page, errors) {
  await page.setViewportSize({ width: 390, height: 844 });
  await setPos(page, 275, 1200);
  if (await bubbleVisible(page)) {
    errors.push("390 chinese: bubble on path spine (275,1200) before door step");
  }
  await setPos(page, 288, 1200);
  const mid = await bubbleVisible(page);
  await setPos(page, 304, 1200);
  if (!(await bubbleVisible(page))) {
    errors.push("390 chinese: no bubble at wooden door (304,1200)");
  }
  return { pathSpine: [275, 1200], midApproach: mid, door: [304, 1200] };
}

export async function runV922aDoorTight(page, errors = []) {
  mkdirSync(ART, { recursive: true });
  const report = { tag: TAG, maxAppearDistPx: MAX_APPEAR_DIST, results: [], screenshots: {} };

  await page.goto(process.env.E2E_BASE || "http://127.0.0.1:8788", {
    waitUntil: "networkidle",
    timeout: 120000,
  });
  await pickMap(page);

  report.chinesePathSpine = await testChinesePathSpine(page, errors);

  for (const [ctx, w, h, orient] of [
    ["390x844", 390, 844, "portrait"],
    ["1280x800", 1280, 800, "landscape"],
  ]) {
    await page.setViewportSize({ width: w, height: h });
    await sleep(300);
    const row = { viewport: ctx, buildings: {} };
    for (const b of BUILDINGS) {
      row.buildings[b] = await testBuilding(page, b, orient, ctx, errors, report.screenshots);
    }
    report.results.push(row);
  }

  const out = `${ART}/${TAG}-door-tight-report.json`;
  writeFileSync(out, JSON.stringify(report, null, 2));
  report.outPath = out;
  return report;
}
