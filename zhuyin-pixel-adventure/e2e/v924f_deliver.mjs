#!/usr/bin/env node
import { execSync, spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, cpSync, readdirSync } from "node:fs";
import path from "node:path";

const TAG = process.env.E2E_TAG || "v9.24f";
const ROOT = path.resolve("..");
const DIST = path.join(ROOT, "dist");
const E2E = path.resolve(".");
const ART = "/opt/cursor/artifacts";
const ALIGN_OUT = path.join(ART, `${TAG}-door-align`);

function wasmHash() {
  const html = readFileSync(path.join(DIST, "index.html"), "utf8");
  const m = html.match(/zhuyin-pixel-adventure-([a-f0-9]+)_bg\.wasm/);
  return m ? m[1] : null;
}

function main() {
  mkdirSync(ART, { recursive: true });
  mkdirSync(ALIGN_OUT, { recursive: true });
  execSync("env -u NO_COLOR trunk build --release", { stdio: "inherit", cwd: ROOT, shell: "/bin/bash" });
  const server = spawn("python3", ["-m", "http.server", "8788", "--bind", "127.0.0.1"], {
    cwd: DIST,
    stdio: "ignore",
  });
  const doorsJson = path.join(ROOT, "src", "map_config.json");
  let alignOk = false;
  try {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        execSync(`OUT_DIR=${ALIGN_OUT} ALIGN_DOORS=${doorsJson} node align-check.mjs http://127.0.0.1:8788`, {
          stdio: "inherit",
          cwd: E2E,
          env: { ...process.env, OUT_DIR: ALIGN_OUT, ALIGN_DOORS: doorsJson },
        });
        alignOk = true;
        break;
      } catch (e) {
        if (attempt === 3) throw e;
        console.warn(`align-check attempt ${attempt} failed, retrying…`);
      }
    }
  } finally {
    server.kill("SIGTERM");
  }
  if (!alignOk) process.exit(1);
  const zip = path.join(ROOT, `${TAG}-deploy-flat.zip`);
  execSync(`rm -f "${zip}" && cd "${DIST}" && zip -rq "${zip}" .`);
  const sha = execSync(`sha256sum "${zip}"`, { encoding: "utf8" }).trim().split(/\s+/)[0];
  execSync(`cp "${zip}" "${ART}/"`);
  const stops = readdirSync(ALIGN_OUT).filter((f) => f.endsWith("_stop.png"));
  cpSync(path.join(ALIGN_OUT, "align-check.json"), path.join(ART, `${TAG}-align-check.json`));
  const manifest = {
    tag: TAG,
    sha256: sha,
    wasmBundleHash: wasmHash(),
    zip,
    alignCheck: path.join(ART, `${TAG}-align-check.json`),
    stopScreenshots: stops.map((f) => path.join(ALIGN_OUT, f)),
    builtAt: new Date().toISOString(),
  };
  writeFileSync(`${ART}/${TAG}-deliver-manifest.json`, JSON.stringify(manifest, null, 2));
  writeFileSync(`${ART}/${TAG}-deploy-sha256.txt`, `${sha}  ${path.basename(zip)}\n`);
  console.log(JSON.stringify(manifest, null, 2));
}

main();
