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
  await page
    .locator(".map-screen:not(.map-screen-keeper) .island-viewport")
    .first()
    .waitFor({ state: "visible", timeout: 60000 });
  await page.waitForFunction(
    () => !document.body.textContent.includes("地圖載入中"),
    { timeout: 120000 }
  );
  await sleep(500);
}

async function portalBubble(page, portal) {
  const bubble = page.locator('[data-testid="door-bubble"]');
  if (!(await bubble.count())) return false;
  const a = await bubble.first().getAttribute("data-portal").catch(() => null);
  return a === portal;
}

async function walkWithArrowsUntil(page, keys, predicate, maxMs = 48000) {
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
  } else if (await page.locator(".collection-panel").count()) {
    const back = page.locator("button.pixel-btn", { hasText: "回地圖" });
    if (await back.count()) await back.first().click();
    else await page.keyboard.press("Escape");
  } else if (await page.locator(".panel-pixel").count()) {
    const back = page.locator(".panel-pixel button.pixel-btn", { hasText: "回地圖" });
    if (await back.count()) await back.first().click();
    else await page.keyboard.press("Escape");
  } else {
    await page.keyboard.press("Escape");
  }
  await page
    .locator(".map-screen:not(.map-screen-keeper) .island-viewport")
    .first()
    .waitFor({ state: "visible", timeout: 30000 });
  await sleep(400);
}

const HAND_OVERRIDE = {
  portrait: {
    english: [
      ["ArrowRight"],
      ["ArrowDown"],
      ["ArrowRight"],
      ["ArrowUp"],
      ["ArrowRight"],
      ["ArrowUp"],
      ["ArrowRight"],
      ["ArrowUp"],
      ["ArrowUp"],
      ["ArrowRight"],
    ],
  },
  landscape: {
    chinese: [["ArrowRight"]],
    english: [["ArrowRight"], ["ArrowRight"], ["ArrowUp"], ["ArrowRight"]],
    math: [["ArrowRight"], ["ArrowUp"]],
    treasure: [["ArrowRight"], ["ArrowRight"], ["ArrowUp"]],
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

async function focusMap(page) {
  const vp = page.locator(".island-viewport");
  if (await vp.count()) {
    await vp.click({ position: { x: 48, y: 48 }, force: true });
    await sleep(120);
  }
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
      await focusMap(page);
      const chains = chainsFor(plan.mode, portal) ?? [];
      let atDoor = await portalBubble(page, portal);
      for (const keys of chains) {
        if (atDoor) break;
        await focusMap(page);
        atDoor = await walkWithArrowsUntil(page, keys, () => portalBubble(page, portal));
      }
      if (!atDoor) {
        await focusMap(page);
        atDoor = await walkWithArrowsUntil(
          page,
          ["ArrowRight", "ArrowUp"],
          () => portalBubble(page, portal),
          12000
        );
      }
      if (!atDoor) {
        const p = await page.evaluate(() => {
          const raw = localStorage.getItem("zhuzhu-pixel-adventure-v1");
          return raw ? JSON.parse(raw) : null;
        });
        errors.push(
          `${plan.id} ${portal}: held keys did not reach door bubble at ${p?.player_x?.toFixed?.(0)},${p?.player_y?.toFixed?.(0)}`
        );
        continue;
      }
      const enter = page.locator('[data-testid="door-enter-btn"]');
      if (await enter.count()) await enter.click();
      else await page.keyboard.press("Enter");
      const opened = await page
        .waitForSelector(
          ".hub-panel, .collection-panel, .panel-pixel, [data-testid='map-hint-locked']",
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
