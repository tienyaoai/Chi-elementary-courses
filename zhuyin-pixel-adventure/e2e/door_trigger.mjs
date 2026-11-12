import { readFileSync } from "node:fs";
import path from "node:path";

const MAP_CFG = JSON.parse(
  readFileSync(path.resolve("..", "src", "map_config.json"), "utf8")
);

/** Match `map_config.rs` door-step constants. */
export const DOOR_TRIGGER_HALF_W = 16;
export const DOOR_TRIGGER_HALF_H_UP = 8;
export const DOOR_TRIGGER_HALF_H_DOWN = 20;

/** @deprecated use DOOR_TRIGGER_HALF_W */
export const TRIGGER_HW = DOOR_TRIGGER_HALF_W;
/** @deprecated */
export const TRIGGER_HH = DOOR_TRIGGER_HALF_H_DOWN;

export function doorPoint(building, orient) {
  const doors =
    orient === "landscape" ? MAP_CFG.door_points_landscape : MAP_CFG.door_points_portrait;
  return doors[building];
}

/** Match Rust `map_config::door_trigger_contains`. */
export function inDoorTrigger(building, x, y, orient) {
  const [dx, dy] = doorPoint(building, orient);
  if (Math.abs(x - dx) > DOOR_TRIGGER_HALF_W) return false;
  const oy = y - dy;
  return oy >= -DOOR_TRIGGER_HALF_H_UP && oy <= DOOR_TRIGGER_HALF_H_DOWN;
}

export function distToDoorFoot(x, y, building, orient) {
  const [dx, dy] = doorPoint(building, orient);
  return Math.hypot(x - dx, y - dy);
}
