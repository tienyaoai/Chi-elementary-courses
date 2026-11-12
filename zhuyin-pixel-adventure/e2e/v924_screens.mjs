import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";

const ART = "/opt/cursor/artifacts";
const TAG = "v9.24";
const PORT = process.env.E2E_PORT || "8788";
const BASE = `http://127.0.0.1:${PORT}`;
const API = process.env.WORKER_BASE || "http://127.0.0.1:8787";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function pickCharacter(page) {
  await page.goto(BASE, { waitUntil: "networkidle", timeout: 120000 });
  if (await page.locator(".char-grid-12 .char-card").count()) {
    await page.locator(".char-grid-12 .char-card").first().click();
    await page.locator("button.pixel-btn.primary.big-touch").click();
  }
  await page.locator(".island-viewport").first().waitFor({ timeout: 60000 });
  await sleep(350);
}

async function openBulletin(page) {
  await page.evaluate(
    ({ x, y }) => {
      const p = JSON.parse(localStorage.getItem("zhuzhu-pixel-adventure-v1") || "{}");
      p.player_x = x;
      p.player_y = y;
      localStorage.setItem("zhuzhu-pixel-adventure-v1", JSON.stringify(p));
    },
    { x: 418, y: 1392 }
  );
  await page.reload({ waitUntil: "networkidle" });
  await sleep(300);
  const btn = page.locator('[data-testid="door-bubble"][data-portal="bulletin"] button[data-testid="door-enter-btn"]');
  if (await btn.count()) await btn.first().click();
  else await page.keyboard.press("Enter");
  await sleep(500);
}

async function main() {
  mkdirSync(ART, { recursive: true });
  const dist = path.resolve("..", "dist");
  const server = spawn("python3", ["-m", "http.server", PORT, "--bind", "127.0.0.1"], {
    cwd: dist,
    stdio: "ignore",
  });
  await sleep(500);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  await context.addInitScript((api) => {
    window.__ISLAND_API__ = api;
  }, API);
  const page = await context.newPage();
  try {
    await pickCharacter(page);
    for (const [name, w, h] of [
      ["390", 390, 844],
      ["1280", 1280, 800],
    ]) {
      await page.setViewportSize({ width: w, height: h });
      await page.goto(BASE, { waitUntil: "networkidle" });
      await sleep(300);
      await openBulletin(page);
      await page.screenshot({ path: `${ART}/${TAG}-bulletin-${name}.png` });
      await page.locator("button").filter({ hasText: /登入|帳號/ }).first().click();
      await sleep(300);
      await page.screenshot({ path: `${ART}/${TAG}-account-${name}.png` });
      await page.goto(BASE, { waitUntil: "networkidle" });
    }
    await fetch(`${API}/api/admin/announcement`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Admin-Token": process.env.ADMIN_TOKEN || "test-admin-token" },
      body: JSON.stringify({ title: "測試公告", body: "歡迎來到冒險島" }),
    }).catch(() => {});
    await page.setViewportSize({ width: 390, height: 844 });
    await openBulletin(page);
    await page.screenshot({ path: `${ART}/${TAG}-leaderboard-390.png` });
    console.log(JSON.stringify({ ok: true, tag: TAG }, null, 2));
  } finally {
    await browser.close();
    server.kill("SIGTERM");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
