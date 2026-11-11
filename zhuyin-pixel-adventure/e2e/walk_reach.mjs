import { readFileSync } from "node:fs";
import path from "node:path";
import { canStand, loadWalkMask } from "./walk_mask.mjs";

const STEP = 16;
const CFG = JSON.parse(
  readFileSync(path.resolve("..", "src", "map_config.json"), "utf8")
);

const DOOR_COORDS = {
  portrait: CFG.door_points_portrait,
  landscape: CFG.door_points_landscape,
};

const SPAWNS = {
  portrait: [CFG.spawn_portrait.x, CFG.spawn_portrait.y],
  landscape: [CFG.spawn_landscape.x, CFG.spawn_landscape.y],
};

const PORTALS = ["chinese", "english", "math", "treasure"];

function bfsReach(mask, sx, sy, maxNodes = 140000) {
  const q = [[sx, sy]];
  const seen = new Set();
  const key = (x, y) => `${Math.round(x)}:${Math.round(y)}`;
  seen.add(key(sx, sy));
  let head = 0;
  while (head < q.length && seen.size < maxNodes) {
    const [x, y] = q[head++];
    const neighbors = [
      [STEP, 0],
      [-STEP, 0],
      [0, STEP],
      [0, -STEP],
      [STEP, STEP],
      [STEP, -STEP],
      [-STEP, STEP],
      [-STEP, -STEP],
    ];
    for (const [dx, dy] of neighbors) {
      const nx = x + dx;
      const ny = y + dy;
      const k = key(nx, ny);
      if (seen.has(k)) continue;
      if (!canStand(mask, nx, ny)) continue;
      seen.add(k);
      q.push([nx, ny]);
    }
  }
  return seen;
}

function nearDoor(seen, door, radius = 40) {
  const [dx, dy] = door;
  for (const k of seen) {
    const [x, y] = k.split(":").map(Number);
    if ((x - dx) ** 2 + (y - dy) ** 2 <= radius * radius) return true;
  }
  return false;
}

/** BFS reachability from spawn to each door; both bridge sides on main loop. */
export function assertDoorReachability(distRoot) {
  const errors = [];
  for (const orient of ["portrait", "landscape"]) {
    const mask = loadWalkMask(distRoot, orient);
    mask.orient = orient;
    const [sx, sy] = SPAWNS[orient];
    if (!canStand(mask, sx, sy)) {
      errors.push(`${orient}: spawn not standable (${sx},${sy})`);
    }
    const seen = bfsReach(mask, sx, sy);
    for (const portal of PORTALS) {
      const door = DOOR_COORDS[orient][portal];
      if (!canStand(mask, door[0], door[1])) {
        errors.push(`${orient}: door ${portal} not standable (${door})`);
        continue;
      }
      if (!nearDoor(seen, door)) {
        errors.push(`${orient}: door ${portal} unreachable by BFS from spawn`);
      }
    }
    const bridge = orient === "portrait" ? [527, 1267] : [1378, 994];
    for (const [label, pt] of [
      ["west", [bridge[0] - 88, bridge[1]]],
      ["east", [bridge[0] + 88, bridge[1]]],
    ]) {
      if (!canStand(mask, pt[0], pt[1])) {
        errors.push(`${orient}: bridge ${label} not walkable`);
      } else if (!nearDoor(seen, pt)) {
        errors.push(`${orient}: bridge ${label} not on loop from spawn`);
      }
    }
  }
  return errors;
}

function compressKeyRuns(seq) {
  const out = [];
  for (const k of seq) {
    if (!out.length || out[out.length - 1][0] !== k) {
      out.push([k]);
    }
  }
  return out;
}

/** Shortest masked path from (sx,sy) toward door; returns hold chains for arrow keys. */
export function bfsPathChains(mask, sx, sy, tx, ty, arrive = 48) {
  const dirs = [
    ["ArrowRight", STEP, 0],
    ["ArrowLeft", -STEP, 0],
    ["ArrowUp", 0, -STEP],
    ["ArrowDown", 0, STEP],
  ];
  const key = (x, y) => `${Math.round(x)}:${Math.round(y)}`;
  const q = [[sx, sy, []]];
  const seen = new Set([key(sx, sy)]);
  let head = 0;
  while (head < q.length) {
    const [x, y, path] = q[head++];
    if (Math.hypot(x - tx, y - ty) <= arrive) {
      return compressKeyRuns(path);
    }
    for (const [lab, dx, dy] of dirs) {
      const nx = x + dx;
      const ny = y + dy;
      const k = key(nx, ny);
      if (seen.has(k) || !canStand(mask, nx, ny)) continue;
      seen.add(k);
      q.push([nx, ny, path.concat(lab)]);
    }
  }
  return null;
}

export { DOOR_COORDS };
