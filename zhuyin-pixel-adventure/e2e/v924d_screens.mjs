import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";

const ART = "/opt/cursor/artifacts";
const TAG = process.env.E2E_TAG || "v9.24d";
const PORT = process.env.E2E_PORT || "8788";
const BASE = `http://127.0.0.1:${PORT}`;
const API = process.env.WORKER_BASE || "http://127.0.0.1:8787";
const ADMIN = process.env.ADMIN_TOKEN || "test-admin-token";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function seedData() {
  const announcements = [
    { title: "親師座談通知", body: "本週六上午十點，社區活動中心見。" },
    { title: "英語週開跑", body: "天天一題，累積小星星。" },
    { title: "冒險大賽", body: "登入後總分可上排行榜。" },
  ];
  for (const a of announcements) {
    await fetch(`${API}/api/admin/announcement`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Admin-Token": ADMIN },
      body: JSON.stringify(a),
    }).catch(() => {});
  }
  const players = [
    ["小星星", 50],
    ["跳跳蛙", 48],
    ["果果", 46],
    ["阿芽", 44],
    ["米米", 42],
    ["豆豆", 40],
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
    await sleep(400);
    await fetch(`${API}/api/score`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ subject: "chinese", unit_id: `seed-${nick}`, points: pts }),
    }).catch(() => {});
    await sleep(400);
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
  const coords = vp && vp.width >= 520 ? { x: 960, y: 1228 } : { x: 418, y: 1392 };
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
  await sleep(400);
  const btn = page.locator(
    '[data-testid="door-bubble"][data-portal="bulletin"] button[data-testid="door-enter-btn"]'
  );
  if (await btn.count()) await btn.first().click();
  else await page.keyboard.press("Enter");
  await sleep(600);
  await page.locator(".bulletin-panel").waitFor({ timeout: 15000 });
}

async function assertAnnouncements(page, label) {
  const anns = await page.locator(".bulletin-pane-announcements .announcement-title-plain").count();
  if (anns < 3) throw new Error(`${label}: expected 3+ announcements, got ${anns}`);
}

async function main() {
  mkdirSync(ART, { recursive: true });
  const workerDir = path.resolve("..", "worker");
  const { execSync } = await import("node:child_process");
  try {
    execSync("npx wrangler d1 migrations apply zhuyin-island-db --local", {
      cwd: workerDir,
      stdio: "ignore",
      env: { ...process.env, CI: "1" },
    });
  } catch {
    /* wrangler may already be applied */
  }
  const dist = path.resolve("..", "dist");
  const server = spawn("python3", ["-m", "http.server", PORT, "--bind", "127.0.0.1"], {
    cwd: dist,
    stdio: "ignore",
  });
  await sleep(500);
  await seedData();
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
      const tabs = page.locator(".bulletin-tab-btn");
      if (w < 720 && (await tabs.count())) {
        await tabs.first().click();
      }
      await sleep(400);
      await page.waitForSelector(".announcement-title-plain", { timeout: 10000 }).catch(() => {});
      await assertAnnouncements(page, `announce-${name}`);
      await page.screenshot({ path: `${ART}/${TAG}-bulletin-announce-${name}.png` });
      if (w < 720) {
        await tabs.nth(1).click();
      } else {
        await page.locator(".bulletin-pane-leaderboard").scrollIntoViewIfNeeded();
      }
      await sleep(500);
      await page.waitForSelector(".leaderboard-row", { timeout: 10000 });
      const rows = await page.locator(".leaderboard-row").count();
      if (rows < 5) throw new Error(`leaderboard-${name}: only ${rows} rows`);
      await page.screenshot({ path: `${ART}/${TAG}-bulletin-leaderboard-${name}.png` });
      await page.locator(".bulletin-actions .bulletin-inline-btn").first().click();
      await sleep(400);
      await page.locator(".account-shell").waitFor({ timeout: 10000 });
      await page.screenshot({ path: `${ART}/${TAG}-account-${name}.png` });
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
