#!/usr/bin/env node
import { execSync, spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const ART = "/opt/cursor/artifacts";
const TAG = process.env.E2E_TAG || "v9.24d";
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
  const wsZip = path.join(ROOT, `${TAG}-deploy-flat.zip`);
  execSync(`rm -f "${zipPath}" "${wsZip}"`);
  execSync(`cd "${DIST}" && zip -rq "${wsZip}" .`);
  execSync(`cp "${wsZip}" "${zipPath}"`);
  const sha = execSync(`sha256sum "${wsZip}"`, { encoding: "utf8" }).trim().split(/\s+/)[0];
  return { zipPath, wsZip, sha };
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
  try {
    execSync("npx wrangler d1 migrations apply zhuyin-island-db --local", {
      cwd: WORKER,
      stdio: "ignore",
      env: { ...process.env, CI: "1" },
    });
  } catch {
    /* ok */
  }
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
  if (!(await waitWorker())) {
    wrangler.kill("SIGTERM");
    throw new Error("wrangler not ready");
  }
  try {
    execSync("node v924d_screens.mjs", {
      stdio: "inherit",
      cwd: E2E,
      env: { ...process.env, E2E_TAG: TAG, WORKER_BASE: API },
    });
  } finally {
    wrangler.kill("SIGTERM");
  }
  const { zipPath, wsZip, sha } = makeFlatZip();
  const manifest = {
    tag: TAG,
    zip: wsZip,
    artifactZip: zipPath,
    sha256: sha,
    wasmBundleHash: bundleHash(),
    builtAt: new Date().toISOString(),
  };
  writeFileSync(`${ART}/${TAG}-deliver-manifest.json`, JSON.stringify(manifest, null, 2));
  writeFileSync(`${ART}/${TAG}-deploy-sha256.txt`, `${sha}  ${path.basename(wsZip)}\n`);
  console.log(JSON.stringify(manifest, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
