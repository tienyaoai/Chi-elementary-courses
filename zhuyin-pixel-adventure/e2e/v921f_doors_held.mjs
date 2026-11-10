/**
 * From spawn: BFS-mask path rendered as held arrow phases → bubble → Enter.
 */
import { DOOR_COORDS, bfsPathChains } from "./walk_reach.mjs";
import { loadWalkMask } from "./walk_mask.mjs";
import path from "node:path";

const DIST = path.resolve("..", "dist");
const SPAWN = { portrait: { x: 322, y: 1194 }, landscape: { x: 852, y: 1070 } };

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function setSpawn(page, landscape) {
  const s = landscape ? SPAWN.landscape : SPAWN.portrait;
  await page.evaluate(
    ({ x, y }) => {
      const p = JSON.parse(localStorage.getItem("zhuzhu-pixel-adventure-v1") || "{}");
      p.player_x = x;
      p.player_y = y;
      localStorage.setItem("zhuzhu-pixel-adventure-v1", JSON.stringify(p));
    },
    { x: s.x, y: s.y }
  );
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector(".island-viewport", { timeout: 60000 });
  await sleep(500);
}

async function portalBubble(page, portal) {
  const bubble = page.locator('[data-testid="door-bubble"]');
  if (!(await bubble.count())) return false;
  const a = await bubble.first().getAttribute("data-portal").catch(() => null);
  return a === portal;
}

async function walkWithArrowsUntil(page, keys, predicate, maxMs = 36000) {
  for (const k of keys) await page.keyboard.down(k);
  const t0 = Date.now();
  let ok = false;
  try {
    while (Date.now() - t0 < maxMs) {
      if (await predicate()) {
        ok = true;
        break;
      }
      await sleep(50);
    }
  } finally {
    for (const k of keys) {
      await page.keyboard.up(k);
    }
    await sleep(150);
  }
  return ok;
}

async function exitDoorUi(page) {
  if (await page.locator(".hub-panel").count()) {
    const back = page.locator(".hub-panel button.pixel-btn.ghost.big-touch");
    if (await back.count()) await back.click();
    else await page.keyboard.press("Escape");
  } else {
    await page.keyboard.press("Escape");
  }
  await page.waitForSelector(".island-viewport", { timeout: 20000 });
  await sleep(300);
}

const HAND_OVERRIDE = {
  landscape: {
    english: [["ArrowRight"], ["ArrowUp"]],
    treasure: [["ArrowRight"], ["ArrowUp"]],
  },
};

function chainsFor(mode, portal) {
  if (HAND_OVERRIDE[mode]?.[portal]) return HAND_OVERRIDE[mode][portal];
  const mask = loadWalkMask(DIST, mode);
  mask.orient = mode;
  const s = SPAWN[mode];
  const door = DOOR_COORDS[mode][portal];
  return bfsPathChains(mask, s.x, s.y, door[0], door[1]) ?? [];
}

export async function runV921fDoorsHeld(page, errors) {
  const plans = [
    { id: "390-portrait", w: 390, h: 844, mode: "portrait" },
    { id: "1280-landscape", w: 1280, h: 800, mode: "landscape" },
  ];
  for (const plan of plans) {
    await page.setViewportSize({ width: plan.w, height: plan.h });
    for (const portal of Object.keys(DOOR_COORDS[plan.mode])) {
      await setSpawn(page, plan.mode === "landscape");
      const chains = chainsFor(plan.mode, portal);
      let atDoor = await portalBubble(page, portal);
      for (const keys of chains) {
        if (atDoor) break;
        atDoor = await walkWithArrowsUntil(page, keys, () => portalBubble(page, portal));
      }
      if (!atDoor) {
        errors.push(`${plan.id} ${portal}: held keys did not reach door bubble`);
        continue;
      }
      const enter = page.locator('[data-testid="door-enter-btn"]');
      if (await enter.count()) await enter.click();
      else await page.keyboard.press("Enter");
      const opened = await page
        .waitForSelector(
          ".hub-panel, .collection-panel, [data-testid='map-hint-locked']",
          { timeout: 15000 }
        )
        .catch(() => null);
      if (!opened) {
        errors.push(`${plan.id} ${portal}: Enter did not open door UI`);
        continue;
      }
      await exitDoorUi(page);
    }
  }
}
