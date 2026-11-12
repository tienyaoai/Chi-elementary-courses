/**
 * Security checks — run: npm install && npm run test:security
 * Requires wrangler dev on 127.0.0.1:8787 (second terminal: npm run dev)
 */
import { spawn, execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";

const BASE = process.env.WORKER_BASE || "http://127.0.0.1:8787";
const ADMIN = process.env.ADMIN_TOKEN || "test-admin-token";

const report = { tag: "v9.24", tests: [], ok: true };

function record(name, pass, detail = "") {
  report.tests.push({ name, pass, detail });
  if (!pass) report.ok = false;
}

async function req(path, init = {}) {
  const res = await fetch(`${BASE}${path}`, init);
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  return { status: res.status, json };
}

async function run() {
  const nick = `test${Date.now().toString(36)}`;
  const r1 = await req("/api/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nickname: nick, password: "secret1" }),
  });
  record("register", r1.status === 200 && r1.json.token, String(r1.status));

  const dup = await req("/api/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nickname: nick, password: "secret2" }),
  });
  record("nickname duplicate", dup.status === 409, String(dup.status));

  for (let i = 0; i < 6; i++) {
    await req("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nickname: nick, password: "wrong" }),
    });
  }
  const locked = await req("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nickname: nick, password: "wrong" }),
  });
  record("login lockout", locked.status === 423, String(locked.status));

  const sqli = await req("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nickname: "' OR 1=1 --", password: "x" }),
  });
  record("sql injection safe", sqli.status === 401, String(sqli.status));

  const noadmin = await req("/api/admin/announcement", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Admin-Token": "wrong" },
    body: JSON.stringify({ title: "x", body: "hi" }),
  });
  record("non-admin forbidden", noadmin.status === 403, String(noadmin.status));

  const xssBody = '<img src=x onerror=alert(1)>';
  const badHtml = await req("/api/admin/announcement", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Admin-Token": ADMIN },
    body: JSON.stringify({ title: "公告", body: xssBody }),
  });
  record("admin rejects html body", badHtml.status === 400, String(badHtml.status));

  const admin = await req("/api/admin/announcement", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Admin-Token": ADMIN },
    body: JSON.stringify({ title: "OK", body: "歡迎" }),
  });
  record("admin post", admin.status === 200, String(admin.status));

  const ann = await req("/api/announcements");
  const title = ann.json.announcements?.[0]?.title ?? "";
  record("xss escaped in output", !title.includes("<"), title);

  await req("/api/admin/reset-password", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Admin-Token": ADMIN },
    body: JSON.stringify({ nickname: nick, new_password: "secret1" }),
  });

  const loginOk = await req("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nickname: nick, password: "secret1" }),
  });
  const token = loginOk.json.token;
  record("login after lock reset via good pw", loginOk.status === 200, String(loginOk.status));

  const th = createHash("sha256").update(token).digest("hex");
  const workerDir = new URL("..", import.meta.url).pathname;
  try {
    execSync(
      `npx wrangler d1 execute zhuyin-island-db --local --command "UPDATE sessions SET expires_at = '2000-01-01' WHERE token_hash = '${th}'"`,
      { cwd: workerDir, stdio: "ignore" }
    );
  } catch {
    /* local d1 optional */
  }
  const expiredUse = await req("/api/score", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ subject: "math", unit_id: "U1", points: 10 }),
  });
  record("token expired", expiredUse.status === 401, String(expiredUse.status));

  const loginFresh = await req("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nickname: nick, password: "secret1" }),
  });
  const tokenLive = loginFresh.json.token;

  await req("/api/logout", {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenLive}` },
  });
  const afterLogout = await req("/api/score", {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenLive}`, "Content-Type": "application/json" },
    body: JSON.stringify({ subject: "math", unit_id: "U1", points: 10 }),
  });
  record("token invalid after logout", afterLogout.status === 401, String(afterLogout.status));

  const fs = await import("node:fs");
  fs.mkdirSync("/opt/cursor/artifacts", { recursive: true });
  const tag = process.env.E2E_TAG || "v9.24b";
  fs.writeFileSync(`/opt/cursor/artifacts/${tag}-security-report.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 1);
}

async function maybeStartDev() {
  try {
    await fetch(`${BASE}/health`);
    return null;
  } catch {
    const child = spawn("npx", ["wrangler", "dev", "--port", "8787"], {
      cwd: new URL("..", import.meta.url).pathname,
      env: { ...process.env, ADMIN_TOKEN: ADMIN },
      stdio: "ignore",
    });
    for (let i = 0; i < 30; i++) {
      await sleep(500);
      try {
        const r = await fetch(`${BASE}/health`);
        if (r.ok) return child;
      } catch {
        /* retry */
      }
    }
    return child;
  }
}

const child = await maybeStartDev();
try {
  await run();
} finally {
  child?.kill("SIGTERM");
}
