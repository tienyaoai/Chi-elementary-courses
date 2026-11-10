import { readFileSync } from "node:fs";
import path from "node:path";

const STEP = 4;

const PORTRAIT_BLOCKED = [{ x: 400, y: 900, w: 148, h: 320 }];

const PORTRAIT_OVERRIDES = [
  { x: 300, y: 1176, w: 58, h: 42 },
  { x: 328, y: 1186, w: 52, h: 44 },
  { x: 684, y: 1268, w: 48, h: 40 },
  { x: 292, y: 1494, w: 180, h: 32 },
  { x: 502, y: 1256, w: 58, h: 38 },
];

const LANDSCAPE_OVERRIDES = [
  { x: 1238, y: 939, w: 280, h: 110 },
  { x: 782, y: 960, w: 140, h: 220 },
];

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
  if (orient !== "portrait") return false;
  return PORTRAIT_BLOCKED.some(
    (r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h
  );
}

function tooCloseToWater(mask, x, y) {
  if (mask.orient !== "portrait") return false;
  const BUF = 12;
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

export function canStand(mask, x, y) {
  const overrides = mask.orient === "landscape" ? LANDSCAPE_OVERRIDES : PORTRAIT_OVERRIDES;
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
