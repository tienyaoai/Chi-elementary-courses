import { readFileSync } from "node:fs";
import path from "node:path";

const STEP = 4;

const PORTRAIT_BLOCKED = [
  {
    "x": 248,
    "y": 988,
    "w": 92,
    "h": 148
  },
  {
    "x": 868,
    "y": 548,
    "w": 78,
    "h": 118
  },
  {
    "x": 652,
    "y": 1118,
    "w": 112,
    "h": 98
  },
  {
    "x": 538,
    "y": 898,
    "w": 58,
    "h": 48
  },
  {
    "x": 972,
    "y": 760,
    "w": 108,
    "h": 1160
  },
  {
    "x": 0,
    "y": 0,
    "w": 1080,
    "h": 280
  }
];

const LANDSCAPE_BLOCKED = [
  {
    "x": 718,
    "y": 768,
    "w": 158,
    "h": 218
  },
  {
    "x": 1618,
    "y": 838,
    "w": 132,
    "h": 108
  },
  {
    "x": 2058,
    "y": 438,
    "w": 92,
    "h": 108
  },
  {
    "x": 1148,
    "y": 688,
    "w": 72,
    "h": 58
  },
  {
    "x": 0,
    "y": 0,
    "w": 2560,
    "h": 160
  }
];

const PORTRAIT_OVERRIDES = [
  {
    "x": 380,
    "y": 1180,
    "w": 320,
    "h": 140
  },
  {
    "x": 254,
    "y": 1422,
    "w": 110,
    "h": 190
  },
  {
    "x": 300,
    "y": 1176,
    "w": 58,
    "h": 42
  },
  {
    "x": 328,
    "y": 1186,
    "w": 52,
    "h": 44
  },
  {
    "x": 684,
    "y": 1268,
    "w": 48,
    "h": 40
  },
  {
    "x": 838,
    "y": 698,
    "w": 72,
    "h": 40
  },
  {
    "x": 538,
    "y": 968,
    "w": 88,
    "h": 52
  },
  {
    "x": 468,
    "y": 1272,
    "w": 112,
    "h": 28
  },
  {
    "x": 262,
    "y": 1172,
    "w": 84,
    "h": 56
  },
  {
    "x": 842,
    "y": 696,
    "w": 84,
    "h": 56
  },
  {
    "x": 690,
    "y": 1256,
    "w": 84,
    "h": 56
  },
  {
    "x": 528,
    "y": 960,
    "w": 84,
    "h": 56
  }
];

const LANDSCAPE_OVERRIDES = [
  {
    "x": 1120,
    "y": 920,
    "w": 520,
    "h": 160
  },
  {
    "x": 672,
    "y": 1056,
    "w": 168,
    "h": 44
  },
  {
    "x": 798,
    "y": 1052,
    "w": 88,
    "h": 56
  },
  {
    "x": 2026,
    "y": 558,
    "w": 52,
    "h": 42
  },
  {
    "x": 1152,
    "y": 698,
    "w": 72,
    "h": 80
  },
  {
    "x": 758,
    "y": 1044,
    "w": 96,
    "h": 64
  },
  {
    "x": 2026,
    "y": 543,
    "w": 96,
    "h": 64
  },
  {
    "x": 1650,
    "y": 967,
    "w": 96,
    "h": 64
  },
  {
    "x": 1132,
    "y": 730,
    "w": 96,
    "h": 64
  }
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
  const rects = orient === "landscape" ? LANDSCAPE_BLOCKED : PORTRAIT_BLOCKED;
  return rects.some(
    (r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h
  );
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
