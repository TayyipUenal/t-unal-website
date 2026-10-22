/**
 * Partner programme backend (Cloudflare Worker + D1).
 *
 * Static pages are served by the assets binding; only /api/* runs here.
 * Roles: partners see only their own leads and commissions, the admin sees all.
 * No third-party services: sessions are random tokens stored as SHA-256 hashes,
 * passwords use PBKDF2. Mutating requests must be JSON from the same origin.
 */

interface D1Result<T = Record<string, unknown>> {
  results: T[];
  meta: { last_row_id?: number; changes?: number };
}
interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run(): Promise<D1Result>;
}
interface D1Database {
  prepare(query: string): D1Statement;
  batch(statements: D1Statement[]): Promise<D1Result[]>;
}
interface Fetcher {
  fetch(request: Request): Promise<Response>;
}
export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  SETUP_TOKEN?: string;
}

type Partner = {
  id: number;
  role: string;
  status: string;
  email: string;
  name: string;
  company: string;
  phone: string;
  pitch: string;
  slug: string | null;
  bio: string;
  rate_percent: number;
  password_hash: string | null;
  password_salt: string | null;
  created_at: string;
};

const SESSION_DAYS = 14;
const encoder = new TextEncoder();

/* ---------- helpers ---------- */

const now = () => new Date().toISOString();

function json(data: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
  });
}
const fail = (error: string, status = 400) => json({ ok: false, error }, status);

function bytesToBase64Url(bytes: Uint8Array) {
  let text = "";
  bytes.forEach((b) => (text += String.fromCharCode(b)));
  return btoa(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function randomToken(size = 32) {
  return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(size)));
}
async function sha256(text: string) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(text));
  return bytesToBase64Url(new Uint8Array(digest));
}
async function hashPassword(password: string, salt: string) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: encoder.encode(salt), iterations: 100000 },
    key,
    256,
  );
  return bytesToBase64Url(new Uint8Array(bits));
}
function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
const clean = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : "");
const validEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value) && value.length <= 200;

function slugify(text: string) {
  const base = text
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30);
  return `${base || "partner"}-${randomToken(3).toLowerCase().replace(/[^a-z0-9]/g, "x")}`;
}

function cookieValue(request: Request, name: string) {
  const header = request.headers.get("cookie") ?? "";
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return "";
}
const sessionCookie = (token: string, maxAge: number) =>
  `tu_session=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`;

async function limit(env: Env, request: Request, name: string, max: number, windowSeconds: number) {
  const ip = request.headers.get("cf-connecting-ip") ?? "local";
  const windowStart = Math.floor(Date.now() / 1000 / windowSeconds);
  const key = `${name}:${ip}`;
  await env.DB.prepare(
    "INSERT INTO rate_limits (key, window_start, count) VALUES (?, ?, 1) ON CONFLICT(key, window_start) DO UPDATE SET count = count + 1",
  )
    .bind(key, windowStart)
    .run();
  const row = await env.DB.prepare("SELECT count FROM rate_limits WHERE key = ? AND window_start = ?")
    .bind(key, windowStart)
    .first<{ count: number }>();
  await env.DB.prepare("DELETE FROM rate_limits WHERE window_start < ?").bind(windowStart - 2).run();
  return (row?.count ?? 0) <= max;
}

async function currentUser(request: Request, env: Env): Promise<Partner | null> {
  const token = cookieValue(request, "tu_session");
  if (!token) return null;
  const hash = await sha256(token);
  const row = await env.DB.prepare(
    `SELECT p.* FROM sessions s JOIN partners p ON p.id = s.partner_id
     WHERE s.token_hash = ? AND s.expires_at > ? AND p.status IN ('active')`,
  )
    .bind(hash, now())
    .first<Partner>();
  return row;
}

async function startSession(env: Env, partnerId: number) {
  const token = randomToken(32);
  const expires = new Date(Date.now() + SESSION_DAYS * 86400000).toISOString();
  await env.DB.prepare("INSERT INTO sessions (token_hash, partner_id, expires_at, created_at) VALUES (?, ?, ?, ?)")
    .bind(await sha256(token), partnerId, expires, now())
    .run();
  return sessionCookie(token, SESSION_DAYS * 86400);
}

const publicPartner = (p: Partner) => ({
  id: p.id,
  role: p.role,
  name: p.name,
  company: p.company,
  email: p.email,
  slug: p.slug,
  bio: p.bio,
  ratePercent: p.rate_percent,
});

const STATUSES = ["new", "contacted", "offer", "won", "lost"];

/** Commission follows the lead: created when it is won, removed when it is not (unless already paid). */
async function syncCommission(env: Env, leadId: number) {
  const lead = await env.DB.prepare("SELECT * FROM leads WHERE id = ?").bind(leadId).first<{
    id: number;
    partner_id: number | null;
    status: string;
    deal_cents: number | null;
  }>();
  if (!lead || !lead.partner_id) return;
  const existing = await env.DB.prepare("SELECT * FROM commissions WHERE lead_id = ?").bind(leadId).first<{
    id: number;
    status: string;
  }>();
  if (lead.status === "won" && lead.deal_cents && lead.deal_cents > 0) {
    const partner = await env.DB.prepare("SELECT rate_percent FROM partners WHERE id = ?")
      .bind(lead.partner_id)
      .first<{ rate_percent: number }>();
    const rate = partner?.rate_percent ?? 10;
    const amount = Math.round((lead.deal_cents * rate) / 100);
    if (!existing) {
      await env.DB.prepare(
        "INSERT INTO commissions (lead_id, partner_id, base_cents, rate_percent, amount_cents, status, created_at) VALUES (?, ?, ?, ?, ?, 'open', ?)",
      )
        .bind(leadId, lead.partner_id, lead.deal_cents, rate, amount, now())
        .run();
    } else if (existing.status === "open") {
      await env.DB.prepare("UPDATE commissions SET base_cents = ?, rate_percent = ?, amount_cents = ? WHERE id = ?")
        .bind(lead.deal_cents, rate, amount, existing.id)
        .run();
    }
  } else if (existing && existing.status === "open") {
    await env.DB.prepare("DELETE FROM commissions WHERE id = ?").bind(existing.id).run();
  }
}

/* ---------- routes ---------- */

async function handle(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "");
  const method = request.method;

  if (method !== "GET" && method !== "HEAD") {
    const origin = request.headers.get("origin");
    if (origin && origin !== url.origin) return fail("Anfrage nicht erlaubt.", 403);
    if (!(request.headers.get("content-type") ?? "").includes("application/json")) return fail("Ungültige Anfrage.", 415);
  }
  const body = async (): Promise<Record<string, unknown>> => {
    try {
      const value = await request.json();
      return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  };

  /* --- public --- */
  if (path === "/api/setup/status" && method === "GET") {
    const admin = await env.DB.prepare("SELECT id FROM partners WHERE role = 'admin' LIMIT 1").first();
    return json({ ok: true, needed: !admin });
  }

  if (path === "/api/setup" && method === "POST") {
    if (!(await limit(env, request, "setup", 10, 600))) return fail("Zu viele Versuche.", 429);
    const admin = await env.DB.prepare("SELECT id FROM partners WHERE role = 'admin' LIMIT 1").first();
    if (admin) return fail("Die Einrichtung ist bereits abgeschlossen.", 409);
    const data = await body();
    if (!env.SETUP_TOKEN || !safeEqual(clean(data.token, 200), env.SETUP_TOKEN)) return fail("Einrichtungscode ungültig.", 403);
    const email = clean(data.email, 200).toLowerCase();
    const password = clean(data.password, 200);
    if (!validEmail(email) || password.length < 12) return fail("E-Mail oder Passwort (mind. 12 Zeichen) ungültig.");
    const salt = randomToken(16);
    const result = await env.DB.prepare(
      `INSERT INTO partners (role, status, email, name, slug, password_hash, password_salt, created_at, updated_at)
       VALUES ('admin', 'active', ?, ?, NULL, ?, ?, ?, ?)`,
    )
      .bind(email, clean(data.name, 120) || "Administrator", await hashPassword(password, salt), salt, now(), now())
      .run();
    const cookie = await startSession(env, Number(result.meta.last_row_id));
    return json({ ok: true }, 200, { "set-cookie": cookie });
  }

  if (path === "/api/partner/apply" && method === "POST") {
    if (!(await limit(env, request, "apply", 5, 3600))) return fail("Zu viele Anfragen. Bitte später erneut versuchen.", 429);
    const data = await body();
    if (clean(data.website, 100)) return json({ ok: true }); // honeypot
    const name = clean(data.name, 120);
    const email = clean(data.email, 200).toLowerCase();
    if (!name || !validEmail(email)) return fail("Bitte Namen und eine gültige E-Mail-Adresse angeben.");
    if (data.consent !== true) return fail("Bitte stimmen Sie der Datenschutzerklärung zu.");
    const exists = await env.DB.prepare("SELECT id FROM partners WHERE email = ?").bind(email).first();
    if (exists) return json({ ok: true }); // do not reveal whether the address is known
    await env.DB.prepare(
      `INSERT INTO partners (status, email, name, company, phone, pitch, consent_at, created_at, updated_at)
       VALUES ('pending', ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(email, name, clean(data.company, 160), clean(data.phone, 60), clean(data.pitch, 2000), now(), now(), now())
      .run();
    return json({ ok: true });
  }

  if (path === "/api/auth/login" && method === "POST") {
    if (!(await limit(env, request, "login", 10, 600))) return fail("Zu viele Versuche. Bitte in 10 Minuten erneut versuchen.", 429);
    const data = await body();
    const email = clean(data.email, 200).toLowerCase();
    const password = clean(data.password, 200);
    const user = await env.DB.prepare("SELECT * FROM partners WHERE email = ?").bind(email).first<Partner>();
    // Same work whether or not the account exists, to avoid timing hints.
    const salt = user?.password_salt ?? "x";
    const hash = await hashPassword(password, salt);
    if (!user || user.status !== "active" || !user.password_hash || !safeEqual(hash, user.password_hash)) {
      return fail("E-Mail oder Passwort stimmt nicht.", 401);
    }
    const cookie = await startSession(env, user.id);
    return json({ ok: true, user: publicPartner(user) }, 200, { "set-cookie": cookie });
  }

  if (path === "/api/auth/logout" && method === "POST") {
    const token = cookieValue(request, "tu_session");
    if (token) await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256(token)).run();
    return json({ ok: true }, 200, { "set-cookie": sessionCookie("", 0) });
  }

  if (path === "/api/auth/invite" && method === "GET") {
    const token = url.searchParams.get("token") ?? "";
    const row = await env.DB.prepare("SELECT name, email FROM partners WHERE invite_hash = ? AND invite_expires > ? AND status = 'approved'")
      .bind(await sha256(token), now())
      .first<{ name: string; email: string }>();
    return row ? json({ ok: true, name: row.name, email: row.email }) : fail("Der Einladungslink ist ungültig oder abgelaufen.", 404);
  }

  if (path === "/api/auth/activate" && method === "POST") {
    if (!(await limit(env, request, "activate", 10, 600))) return fail("Zu viele Versuche.", 429);
    const data = await body();
    const password = clean(data.password, 200);
    if (password.length < 12) return fail("Das Passwort braucht mindestens 12 Zeichen.");
    const row = await env.DB.prepare("SELECT * FROM partners WHERE invite_hash = ? AND invite_expires > ? AND status = 'approved'")
      .bind(await sha256(clean(data.token, 200)), now())
      .first<Partner>();
    if (!row) return fail("Der Einladungslink ist ungültig oder abgelaufen.", 404);
    const salt = randomToken(16);
    await env.DB.prepare(
      "UPDATE partners SET status = 'active', password_hash = ?, password_salt = ?, invite_hash = NULL, invite_expires = NULL, updated_at = ? WHERE id = ?",
    )
      .bind(await hashPassword(password, salt), salt, now(), row.id)
      .run();
    const cookie = await startSession(env, row.id);
    return json({ ok: true }, 200, { "set-cookie": cookie });
  }

  if (path.startsWith("/api/partner-page/") && method === "GET") {
    const slug = decodeURIComponent(path.slice("/api/partner-page/".length));
    const row = await env.DB.prepare("SELECT name, company, bio, slug FROM partners WHERE slug = ? AND status = 'active'")
      .bind(slug)
      .first<{ name: string; company: string; bio: string; slug: string }>();
    return row ? json({ ok: true, partner: row }) : fail("Partnerseite nicht gefunden.", 404);
  }

  /** The site's own consultation and quote forms (same payload as the old PHP endpoint). */
  if (path === "/api/inquiry.php") {
    if (method !== "POST") return fail("Nur POST erlaubt.", 405);
    if (!(await limit(env, request, "inquiry", 10, 3600))) return json({ ok: false, message: "Zu viele Anfragen. Bitte später erneut versuchen." }, 429);
    const data = await body();
    if (clean(data.website, 100)) return json({ ok: true, reference: "TU-00000000" });
    const contactName = clean(data.name, 120);
    const email = clean(data.email, 200).toLowerCase();
    if (!contactName || !validEmail(email)) return json({ ok: false, message: "Bitte Namen und eine gültige E-Mail-Adresse angeben." }, 422);
    if (data.consent !== "yes" && data.consent !== true && data.consent !== "on") {
      return json({ ok: false, message: "Bitte stimmen Sie der Datenschutzerklärung zu." }, 422);
    }
    const standards = Array.isArray(data.standards) ? data.standards.map((x) => clean(x, 40)).filter(Boolean).join(", ") : "";
    const parts = [
      standards && `Normen: ${standards}`,
      clean(data.situation, 120) && `Ausgangslage: ${clean(data.situation, 120)}`,
      clean(data.size, 60) && `Größe: ${clean(data.size, 60)}`,
      clean(data.timeframe, 60) && `Zeitraum: ${clean(data.timeframe, 60)}`,
      clean(data.note, 2000) || clean(data.message, 2000),
    ].filter(Boolean);
    const requestId = clean(data.requestId, 80) || randomToken(12);
    const kind = clean(data.kind, 20) === "quote" ? "Angebot" : clean(data.topic, 80) || "Erstgespräch";
    await env.DB.prepare(
      `INSERT OR IGNORE INTO leads (source, contact_name, company, email, phone, topic, message, consent_at, request_id, created_at, updated_at)
       VALUES ('site', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(contactName, clean(data.company, 160), email, clean(data.phone, 60), kind, parts.join("\n").slice(0, 2000), now(), requestId, now(), now())
      .run();
    const row = await env.DB.prepare("SELECT id FROM leads WHERE request_id = ?").bind(requestId).first<{ id: number }>();
    return json({ ok: true, reference: `TU-${String(row?.id ?? 0).padStart(8, "0")}` });
  }

  if (path === "/api/leads" && method === "POST") {
    if (!(await limit(env, request, "lead", 8, 3600))) return fail("Zu viele Anfragen. Bitte später erneut versuchen.", 429);
    const data = await body();
    if (clean(data.website, 100)) return json({ ok: true });
    const contactName = clean(data.name, 120);
    const email = clean(data.email, 200).toLowerCase();
    if (!contactName || !validEmail(email)) return fail("Bitte Namen und eine gültige E-Mail-Adresse angeben.");
    if (data.consent !== true) return fail("Bitte stimmen Sie der Datenschutzerklärung zu.");
    let partnerId: number | null = null;
    const slug = clean(data.partnerSlug, 80);
    if (slug) {
      const partner = await env.DB.prepare("SELECT id FROM partners WHERE slug = ? AND status = 'active'").bind(slug).first<{ id: number }>();
      partnerId = partner?.id ?? null;
    }
    await env.DB.prepare(
      `INSERT INTO leads (partner_id, source, contact_name, company, email, phone, topic, message, consent_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        partnerId,
        partnerId ? "partner-page" : "site",
        contactName,
        clean(data.company, 160),
        email,
        clean(data.phone, 60),
        clean(data.topic, 80),
        clean(data.message, 2000),
        now(),
        now(),
        now(),
      )
      .run();
    return json({ ok: true });
  }

  /* --- signed in --- */
  const user = await currentUser(request, env);
  if (!user) return fail("Bitte anmelden.", 401);

  if (path === "/api/me" && method === "GET") return json({ ok: true, user: publicPartner(user) });

  /* --- partner --- */
  if (path === "/api/partner/summary" && method === "GET" && user.role === "partner") {
    const leads = await env.DB.prepare("SELECT status, COUNT(*) AS n FROM leads WHERE partner_id = ? GROUP BY status")
      .bind(user.id)
      .all<{ status: string; n: number }>();
    const money = await env.DB.prepare(
      `SELECT COALESCE(SUM(CASE WHEN status = 'open' THEN amount_cents END), 0) AS open_cents,
              COALESCE(SUM(CASE WHEN status = 'paid' THEN amount_cents END), 0) AS paid_cents
       FROM commissions WHERE partner_id = ?`,
    )
      .bind(user.id)
      .first<{ open_cents: number; paid_cents: number }>();
    return json({
      ok: true,
      ratePercent: user.rate_percent,
      slug: user.slug,
      leadsByStatus: Object.fromEntries(leads.results.map((r) => [r.status, r.n])),
      openCents: money?.open_cents ?? 0,
      paidCents: money?.paid_cents ?? 0,
    });
  }

  if (path === "/api/partner/leads" && method === "GET" && user.role === "partner") {
    const rows = await env.DB.prepare(
      `SELECT l.id, l.contact_name, l.company, l.email, l.phone, l.topic, l.message, l.status, l.deal_cents, l.source,
              l.created_at, l.updated_at, c.amount_cents AS commission_cents, c.rate_percent AS commission_rate, c.status AS commission_status
       FROM leads l LEFT JOIN commissions c ON c.lead_id = l.id
       WHERE l.partner_id = ? ORDER BY l.created_at DESC LIMIT 500`,
    )
      .bind(user.id)
      .all();
    return json({ ok: true, leads: rows.results });
  }

  if (path === "/api/partner/leads" && method === "POST" && user.role === "partner") {
    const data = await body();
    const contactName = clean(data.name, 120);
    if (!contactName) return fail("Bitte den Namen des Ansprechpartners angeben.");
    const email = clean(data.email, 200).toLowerCase();
    if (email && !validEmail(email)) return fail("Die E-Mail-Adresse ist ungültig.");
    if (!email && !clean(data.phone, 60)) return fail("Bitte E-Mail oder Telefonnummer angeben.");
    await env.DB.prepare(
      `INSERT INTO leads (partner_id, source, contact_name, company, email, phone, topic, message, created_at, updated_at)
       VALUES (?, 'portal', ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(user.id, contactName, clean(data.company, 160), email, clean(data.phone, 60), clean(data.topic, 80), clean(data.message, 2000), now(), now())
      .run();
    return json({ ok: true });
  }

  if (path === "/api/partner/profile" && method === "POST" && user.role === "partner") {
    const data = await body();
    await env.DB.prepare("UPDATE partners SET bio = ?, company = ?, phone = ?, updated_at = ? WHERE id = ?")
      .bind(clean(data.bio, 1200), clean(data.company, 160), clean(data.phone, 60), now(), user.id)
      .run();
    return json({ ok: true });
  }

  /* --- admin --- */
  if (user.role !== "admin") return fail("Nicht gefunden.", 404);

  if (path === "/api/admin/overview" && method === "GET") {
    const partners = await env.DB.prepare(
      `SELECT p.id, p.status, p.email, p.name, p.company, p.phone, p.pitch, p.slug, p.rate_percent, p.created_at,
              (SELECT COUNT(*) FROM leads l WHERE l.partner_id = p.id) AS leads,
              (SELECT COUNT(*) FROM leads l WHERE l.partner_id = p.id AND l.status = 'won') AS won,
              COALESCE((SELECT SUM(amount_cents) FROM commissions c WHERE c.partner_id = p.id AND c.status = 'open'), 0) AS open_cents,
              COALESCE((SELECT SUM(amount_cents) FROM commissions c WHERE c.partner_id = p.id AND c.status = 'paid'), 0) AS paid_cents
       FROM partners p WHERE p.role = 'partner' ORDER BY p.created_at DESC`,
    ).all();
    const leads = await env.DB.prepare(
      `SELECT l.*, p.name AS partner_name, c.id AS commission_id, c.amount_cents AS commission_cents, c.status AS commission_status
       FROM leads l LEFT JOIN partners p ON p.id = l.partner_id LEFT JOIN commissions c ON c.lead_id = l.id
       ORDER BY l.created_at DESC LIMIT 500`,
    ).all();
    return json({ ok: true, partners: partners.results, leads: leads.results });
  }

  /** Admin creates a partner directly, including the text of the partner page. */
  if (path === "/api/admin/partners/create" && method === "POST") {
    const data = await body();
    const name = clean(data.name, 120);
    const email = clean(data.email, 200).toLowerCase();
    if (!name || !validEmail(email)) return fail("Bitte Namen und eine gültige E-Mail-Adresse angeben.");
    const rate = Number(data.ratePercent ?? 10);
    if (!Number.isFinite(rate) || rate < 0 || rate > 50) return fail("Der Prozentsatz muss zwischen 0 und 50 liegen.");
    const exists = await env.DB.prepare("SELECT id FROM partners WHERE email = ?").bind(email).first();
    if (exists) return fail("Zu dieser E-Mail-Adresse gibt es schon einen Partner.", 409);
    const token = randomToken(24);
    const slug = slugify(name);
    await env.DB.prepare(
      `INSERT INTO partners (status, email, name, company, phone, bio, slug, rate_percent, invite_hash, invite_expires, created_at, updated_at)
       VALUES ('approved', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(email, name, clean(data.company, 160), clean(data.phone, 60), clean(data.bio, 1200), slug, rate, await sha256(token), new Date(Date.now() + 7 * 86400000).toISOString(), now(), now())
      .run();
    return json({ ok: true, inviteUrl: `${url.origin}/portal/aktivieren?token=${token}`, slug, pageUrl: `${url.origin}/partner/${slug}` });
  }

  const partnerAction = path.match(/^\/api\/admin\/partners\/(\d+)\/(approve|invite|block|rate|profile)$/);
  if (partnerAction && method === "POST") {
    const id = Number(partnerAction[1]);
    const action = partnerAction[2];
    const data = await body();
    const target = await env.DB.prepare("SELECT * FROM partners WHERE id = ? AND role = 'partner'").bind(id).first<Partner>();
    if (!target) return fail("Partner nicht gefunden.", 404);
    if (action === "approve" || action === "invite") {
      const rate = Math.min(50, Math.max(0, Number(data.ratePercent ?? target.rate_percent)));
      const token = randomToken(24);
      const slug = target.slug ?? slugify(target.name);
      await env.DB.prepare(
        "UPDATE partners SET status = CASE WHEN status = 'active' THEN 'active' ELSE 'approved' END, rate_percent = ?, slug = ?, invite_hash = ?, invite_expires = ?, updated_at = ? WHERE id = ?",
      )
        .bind(rate, slug, await sha256(token), new Date(Date.now() + 7 * 86400000).toISOString(), now(), id)
        .run();
      return json({ ok: true, inviteUrl: `${url.origin}/portal/aktivieren?token=${token}`, slug });
    }
    if (action === "block") {
      await env.DB.prepare("UPDATE partners SET status = 'blocked', updated_at = ? WHERE id = ?").bind(now(), id).run();
      await env.DB.prepare("DELETE FROM sessions WHERE partner_id = ?").bind(id).run();
      return json({ ok: true });
    }
    if (action === "profile") {
      await env.DB.prepare("UPDATE partners SET bio = ?, company = ?, phone = ?, updated_at = ? WHERE id = ?")
        .bind(clean(data.bio, 1200), clean(data.company, 160), clean(data.phone, 60), now(), id)
        .run();
      return json({ ok: true });
    }
    if (action === "profile") {
      await env.DB.prepare("UPDATE partners SET bio = ?, company = ?, phone = ?, updated_at = ? WHERE id = ?")
        .bind(clean(data.bio, 1200), clean(data.company, 160), clean(data.phone, 60), now(), id)
        .run();
      return json({ ok: true });
    }
    if (action === "rate") {
      const rate = Number(data.ratePercent);
      if (!Number.isFinite(rate) || rate < 0 || rate > 50) return fail("Der Prozentsatz muss zwischen 0 und 50 liegen.");
      await env.DB.prepare("UPDATE partners SET rate_percent = ?, updated_at = ? WHERE id = ?").bind(rate, now(), id).run();
      return json({ ok: true });
    }
  }

  const leadUpdate = path.match(/^\/api\/admin\/leads\/(\d+)$/);
  if (leadUpdate && method === "POST") {
    const id = Number(leadUpdate[1]);
    const data = await body();
    const status = clean(data.status, 20);
    if (!STATUSES.includes(status)) return fail("Ungültiger Status.");
    const euro = data.dealEuro === null || data.dealEuro === undefined || data.dealEuro === "" ? null : Number(data.dealEuro);
    if (euro !== null && (!Number.isFinite(euro) || euro < 0 || euro > 10000000)) return fail("Ungültiger Auftragswert.");
    if (status === "won" && (!euro || euro <= 0)) return fail("Für einen gewonnenen Auftrag bitte den Auftragswert angeben.");
    const paid = await env.DB.prepare("SELECT id FROM commissions WHERE lead_id = ? AND status = 'paid'").bind(id).first();
    if (paid) return fail("Die Provision ist bereits ausgezahlt. Der Lead lässt sich nicht mehr ändern.", 409);
    await env.DB.prepare("UPDATE leads SET status = ?, deal_cents = ?, updated_at = ? WHERE id = ?")
      .bind(status, euro === null ? null : Math.round(euro * 100), now(), id)
      .run();
    await syncCommission(env, id);
    return json({ ok: true });
  }

  const payout = path.match(/^\/api\/admin\/commissions\/(\d+)\/pay$/);
  if (payout && method === "POST") {
    await env.DB.prepare("UPDATE commissions SET status = 'paid', paid_at = ? WHERE id = ? AND status = 'open'")
      .bind(now(), Number(payout[1]))
      .run();
    return json({ ok: true });
  }

  return fail("Nicht gefunden.", 404);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);
    try {
      return await handle(request, env);
    } catch (error) {
      console.error("api error", error);
      return fail("Es ist ein Fehler aufgetreten. Bitte später erneut versuchen.", 500);
    }
  },
};
