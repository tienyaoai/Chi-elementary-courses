#!/usr/bin/env node
import { execSync, spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const TAG = process.env.E2E_TAG || "v9.23c";
const ROOT = path.resolve("..");
const DIST = path.join(ROOT, "dist");
const E2E = path.resolve(".");
const ART = "/opt/cursor/artifacts";

function wasmHash() {
  const html = readFileSync(path.join(DIST, "index.html"), "utf8");
  const m = html.match(/zhuyin-pixel-adventure-([a-f0-9]+)_bg\.wasm/);
  return m ? m[1] : null;
}

function main() {
  mkdirSync(ART, { recursive: true });
  execSync("unset NO_COLOR && trunk build --release", { stdio: "inherit", cwd: ROOT, shell: "/bin/bash" });
  const server = spawn("python3", ["-m", "http.server", "8788", "--bind", "127.0.0.1"], {
    cwd: DIST,
    stdio: "ignore",
  });
  try {
    execSync(
      `E2E_TAG=${TAG} E2E_PORT=8788 DOOR_BUILDINGS=chinese,english,math node door_hold_enter.mjs`,
      { stdio: "inherit", cwd: E2E }
    );
  } finally {
    server.kill("SIGTERM");
  }
  const zip = path.join(ROOT, `${TAG}-deploy-flat.zip`);
  execSync(`rm -f "${zip}" && cd "${DIST}" && zip -rq "${zip}" .`);
  const sha = execSync(`sha256sum "${zip}"`, { encoding: "utf8" }).trim().split(/\s+/)[0];
  execSync(`cp "${zip}" "${ART}/"`);
  const manifest = {
    tag: TAG,
    sha256: sha,
    wasmBundleHash: wasmHash(),
    zip,
    doorTest: path.join(ART, `${TAG}-door-hold-enter.json`),
    doorBuildings: "chinese,english,math",
    builtAt: new Date().toISOString(),
  };
  writeFileSync(`${ART}/${TAG}-deliver-manifest.json`, JSON.stringify(manifest, null, 2));
  writeFileSync(`${ART}/${TAG}-deploy-sha256.txt`, `${sha}  ${path.basename(zip)}\n`);
  console.log(JSON.stringify(manifest, null, 2));
}

main();
