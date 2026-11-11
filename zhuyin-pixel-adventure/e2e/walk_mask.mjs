import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const STEP = 4;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MAP_CFG = JSON.parse(
  readFileSync(path.join(__dirname, "../src/map_config.json"), "utf8")
);

const PORTRAIT_BLOCKED = MAP_CFG.walk_blocked_portrait;
const LANDSCAPE_BLOCKED = MAP_CFG.walk_blocked_landscape;
const PORTRAIT_OVERRIDES = MAP_CFG.walk_overrides_portrait;
const LANDSCAPE_OVERRIDES = MAP_CFG.walk_overrides_landscape;

function inOverride(x, y, rects) {
  return rects.some(
    (r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h
  );
}

export function loadWalkMask(distRoot, orient) {
  const name = orient === "landscape" ? "walk-landscape.bin" : "walk-portrait.bin";
  const file = path.join(distRoot, "island", name);
  const buf = readFileSync(file);
  const mw = buf.readUInt32LE(0);
  const mh = buf.readUInt32LE(4);
  const bits = buf.subarray(8);
  return { mw, mh, bits, orient };
}

function sample(mask, x, y) {
  const mx = Math.floor(x / STEP);
  const my = Math.floor(y / STEP);
  if (mx < 0 || my < 0 || mx >= mask.mw || my >= mask.mh) {
    return false;
  }
  const i = my * mask.mw + mx;
  const b = mask.bits[i >> 3];
  return Boolean(b & (1 << (i % 8)));
}

function isBlocked(x, y, orient) {
  const rects = orient === "landscape" ? LANDSCAPE_BLOCKED : PORTRAIT_BLOCKED;
  return rects.some(
    (r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h
  );
}

/** Match tools/regen_walk_masks.py — art water / shallow / transparent. */
export function isWaterPixel(r, g, b, a = 255) {
  if (a < 128) return true;
  if (b > 95 && b > r + 18 && b > g + 8) return true;
  if (b > 170 && g > 140 && r > 100 && b >= r) return true;
  if (b > 60 && r < 80 && g < 120 && b > r + 30) return true;
  if (b >= 85 && g >= 85 && b > r + 12 && g > r + 35) return true;
  return false;
}

function tooCloseToWater(mask, x, y) {
  if (mask.orient !== "portrait") return false;
  const BUF = 16;
  const cardinals = [
    [BUF, 0],
    [-BUF, 0],
    [0, BUF],
    [0, -BUF],
  ];
  let hits = 0;
  for (const [dx, dy] of cardinals) {
    if (!sample(mask, x + dx, y + dy)) hits += 1;
  }
  if (!sample(mask, x, y)) return true;
  return hits >= 3;
}

/** Hero feet must be on walkable land (mask + water buffer), not water/cliffs. */
export function footOnLand(mask, x, y) {
  return canStand(mask, x, y);
}

export function canStand(mask, x, y) {
  if (isBlocked(x, y, mask.orient)) {
    return false;
  }
  const overrides = mask.orient === "landscape" ? LANDSCAPE_OVERRIDES : PORTRAIT_OVERRIDES;
  if (overrides.some((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h)) {
    return true;
  }
  const points = [
    [0, 0],
    [-10, 0],
    [10, 0],
    [0, -12],
    [0, 12],
    [-8, 8],
    [8, 8],
  ];
  return points.every(([dx, dy]) => {
    const px = x + dx;
    const py = y + dy;
    if (isBlocked(px, py, mask.orient)) {
      return false;
    }
    if (tooCloseToWater(mask, px, py)) {
      return false;
    }
    if (inOverride(px, py, overrides)) {
      return true;
    }
    return sample(mask, px, py);
  });
}
