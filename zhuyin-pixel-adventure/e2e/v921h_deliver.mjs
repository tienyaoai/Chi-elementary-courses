#!/usr/bin/env node
/**
 * v9.21h review bundle: build, full regression (v91), verify suite, flat zip + hashes.
 */
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const ART = "/opt/cursor/artifacts";
const TAG = process.env.E2E_TAG || "v9.21k";
const ROOT = path.resolve("..");
const DIST = path.join(ROOT, "dist");
const PORT = process.env.E2E_PORT || "8788";
const BASE = process.env.E2E_BASE || `http://127.0.0.1:${PORT}`;
const E2E = path.resolve(".");

function run(cmd, env = {}) {
  console.log("$", cmd);
  execSync(cmd, { stdio: "inherit", cwd: E2E, env: { ...process.env, E2E_TAG: TAG, E2E_BASE: BASE, ...env } });
}

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
  return { zipPath, sha };
}

function main() {
  mkdirSync(ART, { recursive: true });
  execSync("unset NO_COLOR && trunk build --release", { stdio: "inherit", cwd: ROOT, shell: "/bin/bash" });
  const bh = bundleHash();
  run("node v921h_verify.mjs");
  run("node v91.mjs");
  const { zipPath, sha } = makeFlatZip();
  const manifest = {
    tag: TAG,
    zip: zipPath,
    sha256: sha,
    wasmBundleHash: bh,
    indexHtml: path.join(DIST, "index.html"),
    builtAt: new Date().toISOString(),
  };
  writeFileSync(`${ART}/${TAG}-deliver-manifest.json`, JSON.stringify(manifest, null, 2));
  writeFileSync(`${ART}/${TAG}-deploy-sha256.txt`, `${sha}  ${path.basename(zipPath)}\n`);
  console.log(JSON.stringify(manifest, null, 2));
}

main();
