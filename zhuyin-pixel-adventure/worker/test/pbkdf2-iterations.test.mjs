/**
 * CI guard: PBKDF2 must stay within Cloudflare Workers iteration limit.
 * Run: npm run test:pbkdf2
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MAX = 100_000;
const here = path.dirname(fileURLToPath(import.meta.url));
const src = readFileSync(path.join(here, "../src/index.ts"), "utf8");

const itMatch = src.match(/PBKDF2_ITERATIONS\s*=\s*([\d_]+)/);
if (!itMatch) {
  console.error("PBKDF2_ITERATIONS not found in worker/src/index.ts");
  process.exit(1);
}
const iterations = Number(itMatch[1].replace(/_/g, ""));
if (!Number.isFinite(iterations) || iterations > MAX) {
  console.error(`PBKDF2_ITERATIONS=${iterations} exceeds Cloudflare limit ${MAX}`);
  process.exit(1);
}

if (/detail:\s*String\(e\)/.test(src)) {
  console.error("500 responses must not include internal error detail in JSON body");
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, pbkdf2Iterations: iterations, max: MAX }, null, 2));
