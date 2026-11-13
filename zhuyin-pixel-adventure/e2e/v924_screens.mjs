import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";

const ART = "/opt/cursor/artifacts";
const TAG = process.env.E2E_TAG || "v9.24c";
const PORT = process.env.E2E_PORT || "8788";
const BASE = `http://127.0.0.1:${PORT}`;
const API = process.env.WORKER_BASE || "http://127.0.0.1:8787";
const ADMIN = process.env.ADMIN_TOKEN || "test-admin-token";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function seedLeaderboard() {
  const players = [
    ["小星星", 120],
    ["跳跳蛙", 98],
    ["果果", 87],
    ["阿芽", 76],
    ["米米", 65],
    ["豆豆", 54],
  ];
  for (const [nick, pts] of players) {
    await fetch(`${API}/api/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nickname: nick, password: "testpass6" }),
    }).catch(() => {});
    const login = await fetch(`${API}/api/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nickname: nick, password: "testpass6" }),
    }).catch(() => null);
    if (!login?.ok) continue;
    const { token } = await login.json();
    await sleep(350);
    await fetch(`${API}/api/score`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ subject: "chinese", unit_id: `seed-${nick}`, points: pts }),
    }).catch(() => {});
    await sleep(350);
  }
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
  const vp = page.viewportSize();
  const coords =
    vp && vp.width >= 520 ? { x: 960, y: 1228 } : { x: 418, y: 1392 };
  await page.evaluate(
    ({ x, y }) => {
      const p = JSON.parse(localStorage.getItem("zhuzhu-pixel-adventure-v1") || "{}");
      p.player_x = x;
      p.player_y = y;
      localStorage.setItem("zhuzhu-pixel-adventure-v1", JSON.stringify(p));
    },
    coords
  );
  await page.reload({ waitUntil: "networkidle" });
  await sleep(300);
  const btn = page.locator(
    '[data-testid="door-bubble"][data-portal="bulletin"] button[data-testid="door-enter-btn"]'
  );
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
  await fetch(`${API}/api/admin/announcement`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Admin-Token": ADMIN },
    body: JSON.stringify({ title: "測試公告", body: "歡迎來到冒險島，記得看排行榜喔！" }),
  }).catch(() => {});
  await seedLeaderboard();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  await context.addInitScript((api) => {
    window.__ISLAND_API__ = api;
  }, API);
  const page = await context.newPage();
  try {
    await pickCharacter(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: `${ART}/${TAG}-map-bulletin-390.png` });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.screenshot({ path: `${ART}/${TAG}-map-bulletin-1280.png` });
    const adminPage = await context.newPage();
    await adminPage.goto(`${API}/admin-demo`, { waitUntil: "networkidle", timeout: 60000 });
    await adminPage.locator("#tok").fill(ADMIN);
    await adminPage.setViewportSize({ width: 390, height: 844 });
    await adminPage.screenshot({ path: `${ART}/${TAG}-admin-demo-390.png` });
    await adminPage.setViewportSize({ width: 1280, height: 800 });
    await adminPage.screenshot({ path: `${ART}/${TAG}-admin-demo-1280.png` });
    await adminPage.close();
    for (const [name, w, h] of [
      ["390", 390, 844],
      ["1280", 1280, 800],
    ]) {
      await page.setViewportSize({ width: w, height: h });
      await page.goto(BASE, { waitUntil: "networkidle" });
      await sleep(300);
      await openBulletin(page);
      await page.screenshot({ path: `${ART}/${TAG}-bulletin-${name}.png` });
      const lbTab = page.locator(".bulletin-tabs button").nth(1);
      if (await lbTab.count()) await lbTab.click();
      await sleep(350);
      await page.screenshot({ path: `${ART}/${TAG}-leaderboard-${name}.png` });
      await page.locator(".bulletin-actions button").first().click();
      await sleep(300);
      await page.screenshot({ path: `${ART}/${TAG}-account-${name}.png` });
      await page.goto(BASE, { waitUntil: "networkidle" });
    }
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
