// RWA issue register API (Cloudflare Pages Functions).
// Public: GET /api/data. Admin (session cookie): issues, directory, files, password.

const MODES = new Set(["rwa", "auth"]);
const ISSUE_ID = /^[A-Za-z0-9_-]{1,64}$/;
const FILE_ID = /^[a-f0-9]{32}$/;
const COOKIE = "rwa_sess";
const SESSION_SECONDS = 12 * 60 * 60;
const MAX_FILE = 20 * 1024 * 1024;
const FILE_TYPES = {
  "image/jpeg": b => b[0] === 0xff && b[1] === 0xd8,
  "image/png": b => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  "image/webp": b => b[0] === 0x52 && b[1] === 0x49 && b[8] === 0x57 && b[9] === 0x45,
  "application/pdf": b => b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46,
};

const enc = s => new TextEncoder().encode(s);
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
const unhex = h => new Uint8Array(h.match(/../g).map(x => parseInt(x, 16)));
const randomHex = n => hex(crypto.getRandomValues(new Uint8Array(n)));

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers },
  });
}
function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

async function kvGet(env, key) {
  const row = await env.DB.prepare("SELECT value FROM kv WHERE key = ?1").bind(key).first();
  return row ? JSON.parse(row.value) : null;
}
async function kvSet(env, key, value) {
  await env.DB.prepare("INSERT INTO kv (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = ?2")
    .bind(key, JSON.stringify(value)).run();
}

async function pbkdf2(password, saltHex, iterations) {
  const key = await crypto.subtle.importKey("raw", enc(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: unhex(saltHex), iterations }, key, 256);
  return hex(bits);
}
async function hmac(secretHex, msg) {
  const key = await crypto.subtle.importKey("raw", unhex(secretHex), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, enc(msg)));
}

async function makeCookie(env, version) {
  const secret = await kvGet(env, "session_secret");
  const exp = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
  const sig = await hmac(secret, `${exp}.${version}`);
  return `${COOKIE}=${exp}.${version}.${sig}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_SECONDS}`;
}
const clearCookie = () => `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;

async function isAdmin(req, env) {
  const m = (req.headers.get("Cookie") || "").match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  if (!m) return false;
  const [exp, version, sig] = m[1].split(".");
  if (!exp || !version || !sig || Number(exp) < Date.now() / 1000) return false;
  const pw = await kvGet(env, "admin_password");
  if (!pw || String(pw.v) !== version) return false;
  const secret = await kvGet(env, "session_secret");
  return safeEqual(await hmac(secret, `${exp}.${version}`), sig);
}

function publicView(issue) {
  const { raisedBy, ...rest } = issue;
  return { ...rest, steps: (issue.steps || []).filter(s => !s.private) };
}

async function getData(env, admin) {
  const { results } = await env.DB.prepare("SELECT id, mode, data FROM issues").all();
  const out = { admin, dir: (await kvGet(env, "directory")) || {}, rwa: [], auth: [] };
  for (const r of results) {
    if (!MODES.has(r.mode)) continue;
    const issue = { ...JSON.parse(r.data), id: r.id };
    out[r.mode].push(admin ? issue : publicView(issue));
  }
  return json(out);
}

async function login(req, env) {
  const ip = req.headers.get("CF-Connecting-IP") || "unknown";
  const since = Date.now() - 15 * 60 * 1000;
  await env.DB.prepare("DELETE FROM login_attempts WHERE at < ?1").bind(since).run();
  const { n } = await env.DB.prepare("SELECT COUNT(*) AS n FROM login_attempts WHERE ip = ?1 AND at >= ?2").bind(ip, since).first();
  if (n >= 10) return json({ error: "Too many attempts. Try again in 15 minutes." }, 429);
  const { password } = await req.json().catch(() => ({}));
  const pw = await kvGet(env, "admin_password");
  if (typeof password !== "string" || !pw || !safeEqual(await pbkdf2(password, pw.salt, pw.iter), pw.hash)) {
    await env.DB.prepare("INSERT INTO login_attempts (ip, at) VALUES (?1, ?2)").bind(ip, Date.now()).run();
    return json({ error: "That password is incorrect." }, 401);
  }
  await env.DB.prepare("DELETE FROM login_attempts WHERE ip = ?1").bind(ip).run();
  return json({ ok: true }, 200, { "Set-Cookie": await makeCookie(env, pw.v) });
}

async function changePassword(req, env) {
  const { current, next } = await req.json().catch(() => ({}));
  const pw = await kvGet(env, "admin_password");
  if (typeof current !== "string" || !safeEqual(await pbkdf2(current, pw.salt, pw.iter), pw.hash))
    return json({ error: "The current password is incorrect." }, 403);
  if (typeof next !== "string" || next.length < 8) return json({ error: "Use at least 8 characters." }, 400);
  const salt = randomHex(16), iter = 100000;
  const updated = { salt, iter, hash: await pbkdf2(next, salt, iter), v: (pw.v || 0) + 1 };
  await kvSet(env, "admin_password", updated);
  // Other admins' sessions end; this one gets a fresh cookie.
  return json({ ok: true }, 200, { "Set-Cookie": await makeCookie(env, updated.v) });
}

async function uploadFile(req, env) {
  const type = (req.headers.get("Content-Type") || "").split(";")[0].trim();
  if (!FILE_TYPES[type]) return json({ error: "Use PDF, JPG, PNG or WebP files." }, 415);
  const size = Number(req.headers.get("Content-Length") || 0);
  if (size > MAX_FILE) return json({ error: "Files must be 20 MB or smaller." }, 413);
  const buf = await req.arrayBuffer();
  if (buf.byteLength > MAX_FILE) return json({ error: "Files must be 20 MB or smaller." }, 413);
  if (!FILE_TYPES[type](new Uint8Array(buf.slice(0, 12)))) return json({ error: "The file doesn't match its type." }, 415);
  let name = "file";
  try { name = decodeURIComponent(req.headers.get("X-Filename") || "file").slice(0, 200); } catch (_) {}
  const id = randomHex(16);
  await env.FILES.put(id, buf, { metadata: { type, name, size: buf.byteLength } });
  return json({ id, contentType: type, sizeBytes: buf.byteLength });
}

export async function onRequest({ request: req, env, params }) {
  const [a, b, c] = params.path || [];
  const method = req.method;
  try {
    if (method !== "GET") {
      if (req.headers.get("X-Requested-With") !== "fetch") return json({ error: "Bad request" }, 400);
      const origin = req.headers.get("Origin");
      if (origin && new URL(origin).host !== new URL(req.url).host) return json({ error: "Bad origin" }, 403);
    }
    const admin = await isAdmin(req, env);

    if (a === "data" && method === "GET") return await getData(env, admin);
    if (a === "login" && method === "POST") return await login(req, env);
    if (a === "logout" && method === "POST") return json({ ok: true }, 200, { "Set-Cookie": clearCookie() });

    if (!admin) return json({ error: "Admin login required" }, 401);

    if (a === "issues" && MODES.has(b) && ISSUE_ID.test(c || "")) {
      if (method === "PUT") {
        const text = await req.text();
        if (text.length > 500000) return json({ error: "This issue is too large to save." }, 413);
        const data = JSON.parse(text);
        if (!data || typeof data !== "object" || Array.isArray(data)) return json({ error: "Bad issue" }, 400);
        delete data.id;
        await env.DB.prepare(
          "INSERT INTO issues (id, mode, data, updated_at) VALUES (?1, ?2, ?3, ?4) " +
          "ON CONFLICT(id) DO UPDATE SET mode = ?2, data = ?3, updated_at = ?4"
        ).bind(c, b, JSON.stringify(data), new Date().toISOString()).run();
        return json({ ok: true });
      }
      if (method === "DELETE") {
        const row = await env.DB.prepare("SELECT data FROM issues WHERE id = ?1").bind(c).first();
        if (row) {
          for (const s of JSON.parse(row.data).steps || [])
            for (const f of s.files || []) if (FILE_ID.test(f.id)) await env.FILES.delete(f.id);
        }
        await env.DB.prepare("DELETE FROM issues WHERE id = ?1").bind(c).run();
        return json({ ok: true });
      }
    }
    if (a === "directory" && method === "PUT") {
      const dir = await req.json();
      if (!dir || typeof dir !== "object" || Array.isArray(dir)) return json({ error: "Bad lists" }, 400);
      await kvSet(env, "directory", dir);
      return json({ ok: true });
    }
    if (a === "password" && method === "POST") return await changePassword(req, env);
    if (a === "files" && !b && method === "POST") return await uploadFile(req, env);
    if (a === "files" && FILE_ID.test(b || "") && method === "DELETE") {
      await env.FILES.delete(b);
      return json({ ok: true });
    }
    return json({ error: "Not found" }, 404);
  } catch (e) {
    return json({ error: "Something went wrong on the server." }, 500);
  }
}
