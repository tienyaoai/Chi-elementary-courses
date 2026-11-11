import { readFileSync } from "node:fs";
import path from "node:path";

const MAP_CFG = JSON.parse(
  readFileSync(path.resolve("..", "src", "map_config.json"), "utf8")
);

export const TRIGGER_HW = 30;
export const TRIGGER_HH = 26;

export function doorPoint(building, orient) {
  const doors =
    orient === "landscape" ? MAP_CFG.door_points_landscape : MAP_CFG.door_points_portrait;
  return doors[building];
}

/** Match Rust `map_config::door_trigger_contains`. */
export function inDoorTrigger(building, x, y, orient) {
  const zones =
    orient === "landscape"
      ? MAP_CFG.door_trigger_zones_landscape || {}
      : MAP_CFG.door_trigger_zones_portrait || {};
  const custom = zones[building];
  if (custom) {
    const { x: x0, y: y0, w, h } = custom;
    return x >= x0 && x <= x0 + w && y >= y0 && y <= y0 + h;
  }
  const [dx, dy] = doorPoint(building, orient);
  return Math.abs(x - dx) <= TRIGGER_HW && Math.abs(y - dy) <= TRIGGER_HH;
}
