#!/usr/bin/env node
/**
 * v9.24c delivery: release build, flat zip + sha256, review screenshots.
 */
import { execSync, spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const ART = "/opt/cursor/artifacts";
const TAG = process.env.E2E_TAG || "v9.24c";
const ROOT = path.resolve("..");
const DIST = path.join(ROOT, "dist");
const WORKER = path.join(ROOT, "worker");
const E2E = path.resolve(".");
const API = process.env.WORKER_BASE || "http://127.0.0.1:8787";

function bundleHash() {
  const html = readFileSync(path.join(DIST, "index.html"), "utf8");
  const m = html.match(/zhuyin-pixel-adventure-([a-f0-9]+)_bg\.wasm/);
  return m ? m[1] : null;
}

function makeFlatZip() {
  mkdirSync(ART, { recursive: true });
  const zipPath = `${ART}/${TAG}-deploy-flat.zip`;
  execSync(`rm -f "${zipPath}"`, { cwd: E2E });
  execSync(`cd "${DIST}" && zip -rq "${zipPath}" .`, { stdio: "inherit" });
  const sha = execSync(`sha256sum "${zipPath}"`, { encoding: "utf8" }).trim().split(/\s+/)[0];
  const wsCopy = `${ART}/${path.basename(zipPath)}`;
  execSync(`cp "${zipPath}" "${wsCopy}"`, { stdio: "inherit" });
  return { zipPath, sha, wsCopy };
}

async function waitWorker(maxMs = 60000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    try {
      const r = await fetch(`${API}/health`);
      if (r.ok) return true;
    } catch {
      /* retry */
    }
    await sleep(500);
  }
  return false;
}

async function main() {
  mkdirSync(ART, { recursive: true });
  execSync("unset NO_COLOR && trunk build --release", { stdio: "inherit", cwd: ROOT, shell: "/bin/bash" });
  const wrangler = spawn("npx", ["wrangler", "dev", "--port", "8787"], {
    cwd: WORKER,
    stdio: "ignore",
    env: {
      ...process.env,
      ADMIN_TOKEN: process.env.ADMIN_TOKEN || "test-admin-token",
      CI: "1",
      WRANGLER_SEND_METRICS: "false",
    },
  });
  const up = await waitWorker();
  if (!up) {
    wrangler.kill("SIGTERM");
    throw new Error("wrangler dev did not become ready on 8787");
  }
  try {
    execSync(`node v924_screens.mjs`, {
      stdio: "inherit",
      cwd: E2E,
      env: { ...process.env, E2E_TAG: TAG, WORKER_BASE: API },
    });
  } finally {
    wrangler.kill("SIGTERM");
  }
  const { zipPath, sha, wsCopy } = makeFlatZip();
  const manifest = {
    tag: TAG,
    zip: zipPath,
    workspaceZip: wsCopy,
    sha256: sha,
    wasmBundleHash: bundleHash(),
    builtAt: new Date().toISOString(),
    screenshots: [
      `${TAG}-map-bulletin-390.png`,
      `${TAG}-map-bulletin-1280.png`,
      `${TAG}-bulletin-390.png`,
      `${TAG}-bulletin-1280.png`,
      `${TAG}-leaderboard-390.png`,
      `${TAG}-leaderboard-1280.png`,
      `${TAG}-account-390.png`,
      `${TAG}-account-1280.png`,
      `${TAG}-admin-demo-390.png`,
      `${TAG}-admin-demo-1280.png`,
    ].map((n) => path.join(ART, n)),
  };
  writeFileSync(`${ART}/${TAG}-deliver-manifest.json`, JSON.stringify(manifest, null, 2));
  writeFileSync(`${ART}/${TAG}-deploy-sha256.txt`, `${sha}  ${path.basename(zipPath)}\n`);
  console.log(JSON.stringify(manifest, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
