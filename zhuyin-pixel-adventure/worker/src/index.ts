export interface Env {
  DB: D1Database;
  ADMIN_TOKEN?: string;
  PUBLIC_ORIGIN?: string;
}

const PBKDF2_ITERATIONS = 310_000;
const SESSION_DAYS = 14;
const MAX_LOGIN_FAILS = 5;
const LOCK_MINUTES = 15;
const MAX_SCORE_PER_UNIT = 50;
const SCORE_COOLDOWN_SEC = 30;

const BAD_NICK = new Set(
  "幹,操,婊,死,糞,屎,靠,媽的,爸媽,fuck,shit,damn".split(/[,，]/)
);

const corsHeaders = (origin: string | null) => ({
  "Access-Control-Allow-Origin": origin && origin.startsWith("http") ? origin : "*",
  "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Admin-Token",
  "Access-Control-Max-Age": "86400",
});

function json(data: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...extra },
  });
}

function escapeText(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function nickOk(nickname: string): string | null {
  const n = nickname.trim();
  if (n.length < 2 || n.length > 16) return "暱稱需 2–16 字";
  if (!/^[\u4e00-\u9fffA-Za-z0-9_]+$/.test(n)) return "暱稱只能含中文、英文、數字、底線";
  const low = n.toLowerCase();
  for (const bad of BAD_NICK) {
    if (bad && low.includes(bad.toLowerCase())) return "暱稱含有不適當字詞";
  }
  return null;
}

async function pbkdf2(password: string, salt: Uint8Array): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    key,
    256
  );
  return btoa(String.fromCharCode(...new Uint8Array(bits)));
}

function randomSalt(): Uint8Array {
  const s = new Uint8Array(16);
  crypto.getRandomValues(s);
  return s;
}

function saltB64(s: Uint8Array): string {
  return btoa(String.fromCharCode(...s));
}

function saltFromB64(s: string): Uint8Array {
  const bin = atob(s);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function hashPassword(password: string, salt: Uint8Array): Promise<string> {
  return pbkdf2(password, salt);
}

function randomToken(): string {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return btoa(String.fromCharCode(...b))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function sha256Hex(text: string): Promise<string> {
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(text));
  return [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

function sessionExpiry(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + SESSION_DAYS);
  return d.toISOString();
}

async function playerFromAuth(req: Request, env: Env) {
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const raw = auth.slice(7).trim();
  const th = await sha256Hex(raw);
  const row = await env.DB.prepare(
    `SELECT p.id, p.nickname FROM sessions s
     JOIN players p ON p.id = s.player_id
     WHERE s.token_hash = ?1 AND s.expires_at > datetime('now')`
  )
    .bind(th)
    .first<{ id: number; nickname: string }>();
  return row;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const origin = req.headers.get("Origin");
    const cors = corsHeaders(origin);

    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    const host = url.hostname;
    const localOk =
      host === "localhost" || host === "127.0.0.1" || host.endsWith(".workers.dev");
    if (url.protocol !== "https:" && !localOk) {
      return json({ error: "HTTPS required" }, 400, cors);
    }

    const path = url.pathname;

    try {
      if (path === "/api/register" && req.method === "POST") {
        const body = (await req.json()) as { nickname?: string; password?: string };
        const err = nickOk(body.nickname ?? "");
        if (err) return json({ error: err }, 400, cors);
        const pw = body.password ?? "";
        if (pw.length < 6 || pw.length > 64) return json({ error: "密碼需 6–64 字" }, 400, cors);
        const salt = randomSalt();
        const hash = await hashPassword(pw, salt);
        try {
          const ins = await env.DB.prepare(
            "INSERT INTO players (nickname, password_hash, salt) VALUES (?1, ?2, ?3)"
          )
            .bind(body.nickname!.trim(), hash, saltB64(salt))
            .run();
          const token = randomToken();
          const th = await sha256Hex(token);
          await env.DB.prepare(
            "INSERT INTO sessions (player_id, token_hash, expires_at) VALUES (?1, ?2, ?3)"
          )
            .bind(ins.meta.last_row_id, th, sessionExpiry())
            .run();
          return json({ ok: true, token, nickname: body.nickname!.trim() }, 200, cors);
        } catch (e: unknown) {
          return json({ error: "暱稱已被使用" }, 409, cors);
        }
      }

      if (path === "/api/login" && req.method === "POST") {
        const body = (await req.json()) as { nickname?: string; password?: string };
        const nick = (body.nickname ?? "").trim();
        const row = await env.DB.prepare(
          "SELECT id, nickname, password_hash, salt, login_failures, locked_until FROM players WHERE nickname = ?1"
        )
          .bind(nick)
          .first<{
            id: number;
            nickname: string;
            password_hash: string;
            salt: string;
            login_failures: number;
            locked_until: string | null;
          }>();
        if (!row) return json({ error: "帳號或密碼錯誤" }, 401, cors);
        if (row.locked_until && new Date(row.locked_until) > new Date()) {
          return json({ error: "登入暫時鎖定，請稍後再試" }, 423, cors);
        }
        const hash = await hashPassword(body.password ?? "", saltFromB64(row.salt));
        if (hash !== row.password_hash) {
          const fails = row.login_failures + 1;
          let locked: string | null = null;
          if (fails >= MAX_LOGIN_FAILS) {
            const d = new Date();
            d.setUTCMinutes(d.getUTCMinutes() + LOCK_MINUTES);
            locked = d.toISOString();
          }
          await env.DB.prepare(
            "UPDATE players SET login_failures = ?1, locked_until = ?2 WHERE id = ?3"
          )
            .bind(fails, locked, row.id)
            .run();
          return json({ error: "帳號或密碼錯誤" }, 401, cors);
        }
        await env.DB.prepare(
          "UPDATE players SET login_failures = 0, locked_until = NULL WHERE id = ?1"
        )
          .bind(row.id)
          .run();
        const token = randomToken();
        const th = await sha256Hex(token);
        await env.DB.prepare(
          "INSERT INTO sessions (player_id, token_hash, expires_at) VALUES (?1, ?2, ?3)"
        )
          .bind(row.id, th, sessionExpiry())
          .run();
        return json({ ok: true, token, nickname: row.nickname }, 200, cors);
      }

      if (path === "/api/logout" && req.method === "POST") {
        const auth = req.headers.get("Authorization");
        if (auth?.startsWith("Bearer ")) {
          const th = await sha256Hex(auth.slice(7).trim());
          await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?1").bind(th).run();
        }
        return json({ ok: true }, 200, cors);
      }

      if (path === "/api/leaderboard" && req.method === "GET") {
        const scope = url.searchParams.get("scope") ?? "total";
        let q: string;
        if (scope === "total") {
          q = `SELECT p.nickname, SUM(s.points) AS points
               FROM scores s JOIN players p ON p.id = s.player_id
               GROUP BY p.id ORDER BY points DESC LIMIT 20`;
        } else {
          q = `SELECT p.nickname, SUM(s.points) AS points
               FROM scores s JOIN players p ON p.id = s.player_id
               WHERE s.subject = ?1
               GROUP BY p.id ORDER BY points DESC LIMIT 20`;
        }
        const stmt = env.DB.prepare(q);
        const rows =
          scope === "total"
            ? await stmt.all<{ nickname: string; points: number }>()
            : await (
                await stmt.bind(scope)
              ).all<{ nickname: string; points: number }>();
        const list = (rows.results ?? []).map((r) => ({
          nickname: escapeText(r.nickname),
          points: r.points,
        }));
        return json({ scope, rows: list }, 200, cors);
      }

      if (path === "/api/announcements" && req.method === "GET") {
        const rows = await env.DB.prepare(
          "SELECT id, title, body, created_at FROM announcements ORDER BY id DESC LIMIT 30"
        ).all<{ id: number; title: string; body: string; created_at: string }>();
        const list = (rows.results ?? []).map((r) => ({
          id: r.id,
          title: escapeText(r.title),
          body: escapeText(r.body),
          created_at: r.created_at,
        }));
        return json({ announcements: list }, 200, cors);
      }

      if (path === "/api/score" && req.method === "POST") {
        const player = await playerFromAuth(req, env);
        if (!player) return json({ error: "請先登入" }, 401, cors);
        const body = (await req.json()) as { subject?: string; unit_id?: string; points?: number };
        const subject = (body.subject ?? "").trim();
        if (!["chinese", "math", "english"].includes(subject)) {
          return json({ error: "invalid subject" }, 400, cors);
        }
        const unitId = (body.unit_id ?? "").slice(0, 64);
        let points = Math.floor(Number(body.points ?? 0));
        if (!Number.isFinite(points)) points = 0;
        points = Math.max(0, Math.min(points, MAX_SCORE_PER_UNIT));
        const recent = await env.DB.prepare(
          `SELECT created_at FROM scores WHERE player_id = ?1 ORDER BY id DESC LIMIT 1`
        )
          .bind(player.id)
          .first<{ created_at: string }>();
        if (recent) {
          const elapsed = (Date.now() - Date.parse(recent.created_at + "Z")) / 1000;
          if (elapsed < SCORE_COOLDOWN_SEC) {
            return json({ error: "太快囉，稍後再試" }, 429, cors);
          }
        }
        await env.DB.prepare(
          `INSERT INTO scores (player_id, subject, unit_id, points) VALUES (?1, ?2, ?3, ?4)
           ON CONFLICT(player_id, subject, unit_id) DO UPDATE SET
           points = MAX(scores.points, excluded.points),
           created_at = datetime('now')`
        )
          .bind(player.id, subject, unitId, points)
          .run();
        return json({ ok: true }, 200, cors);
      }

      if (path.startsWith("/api/admin/")) {
        const adminTok = req.headers.get("X-Admin-Token");
        if (!env.ADMIN_TOKEN || adminTok !== env.ADMIN_TOKEN) {
          return json({ error: "forbidden" }, 403, cors);
        }
        if (path === "/api/admin/announcement" && req.method === "POST") {
          const body = (await req.json()) as { title?: string; body?: string };
          const title = (body.title ?? "").trim().slice(0, 120);
          const text = (body.body ?? "").trim().slice(0, 2000);
          if (title.includes("<") || text.includes("<")) {
            return json({ error: "請勿使用 HTML 標籤" }, 400, cors);
          }
          if (!title || !text) return json({ error: "標題與內容必填" }, 400, cors);
          const ins = await env.DB.prepare(
            "INSERT INTO announcements (title, body) VALUES (?1, ?2)"
          )
            .bind(title, text)
            .run();
          return json({ ok: true, id: ins.meta.last_row_id }, 200, cors);
        }
        if (path === "/api/admin/announcement" && req.method === "DELETE") {
          const id = Number(url.searchParams.get("id"));
          if (!id) return json({ error: "id required" }, 400, cors);
          await env.DB.prepare("DELETE FROM announcements WHERE id = ?1").bind(id).run();
          return json({ ok: true }, 200, cors);
        }
        if (path === "/api/admin/reset-password" && req.method === "POST") {
          const body = (await req.json()) as { nickname?: string; new_password?: string };
          const row = await env.DB.prepare("SELECT id FROM players WHERE nickname = ?1")
            .bind((body.nickname ?? "").trim())
            .first<{ id: number }>();
          if (!row) return json({ error: "找不到玩家" }, 404, cors);
          const pw = body.new_password ?? "";
          if (pw.length < 6) return json({ error: "密碼太短" }, 400, cors);
          const salt = randomSalt();
          const hash = await hashPassword(pw, salt);
          await env.DB.prepare(
            "UPDATE players SET password_hash = ?1, salt = ?2, login_failures = 0, locked_until = NULL WHERE id = ?3"
          )
            .bind(hash, saltB64(salt), row.id)
            .run();
          await env.DB.prepare("DELETE FROM sessions WHERE player_id = ?1").bind(row.id).run();
          return json({ ok: true }, 200, cors);
        }
      }

      if (path === "/" || path === "/health") {
        return json({ ok: true, service: "zhuyin-island-api" }, 200, cors);
      }

      return json({ error: "not found" }, 404, cors);
    } catch (e: unknown) {
      return json({ error: "server error", detail: String(e) }, 500, cors);
    }
  },
};
