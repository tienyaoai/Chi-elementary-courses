#!/usr/bin/env node
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import path from "node:path";

const ART = "/opt/cursor/artifacts";
const TAG = process.env.E2E_TAG || "v9.21h";
const summary = { tag: TAG, buildings: {} };
for (const f of readdirSync(ART).filter((n) => n.startsWith(`${TAG}-door-bubble-`) && n.endsWith(".json"))) {
  const j = JSON.parse(readFileSync(path.join(ART, f), "utf8"));
  const vp = f.includes("1280") ? "1280x800" : f.includes("390") ? "390x844" : "unknown";
  const key = j.building;
  summary.buildings[key] ??= {};
  summary.buildings[key][vp] = {
    door: j.door,
    appearDistancePx: j.appearDistancePx,
    maxVisibleDistancePx: j.maxVisibleDistancePx,
    bubbleAtDoor: j.bubbleAtDoor,
    triggerHalf: [j.triggerHalfW, j.triggerHalfH],
  };
}
writeFileSync(`${ART}/${TAG}-door-trigger-summary.json`, JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
