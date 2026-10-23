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
  RESEND_API_KEY?: string;
}

const MAIL_FROM = "Tayyip Ünal <info@tayyipuenal.de>";
/** Partner replies go to info@ (forwarded to t.uenal@united-certification.de); notifications go straight to the owner. */
const MAIL_REPLY_TO = "info@tayyipuenal.de";
const MAIL_OWNER = "t.uenal@united-certification.de";

const SITE = "https://www.tayyipuenal.de";
const PORTAL_URL = `${SITE}/portal`;

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] as string);

type MailContent = {
  eyebrow: string;
  title: string;
  intro?: string;
  rows?: [string, string][];
  body?: string;
  cta?: { label: string; url: string };
  note?: string;
  /** Adds the "Alles aus einer Hand" block with the services orbiting the seal. */
  promo?: boolean;
};

const SERVICES = ["Zertifizierung", "Personenzertifizierung", "Schulungen", "Arbeitsschutz", "Arbeitssicherheit", "IT-Sicherheit", "Factoring", "Webseiten"];

/** Advertising block for partner mails: animated planets plus the same services as text for clients without images. */
function promoHtml(gold: string) {
  const chips = SERVICES.map(
    (service) =>
      `<td style="padding:4px"><span style="display:inline-block;padding:6px 12px;border:1px solid #3a3226;border-radius:999px;color:#f5f2ec;font-size:13px;white-space:nowrap">${service}</span></td>`,
  );
  const lines = [chips.slice(0, 4), chips.slice(4)].map((row) => `<tr>${row.join("")}</tr>`).join("");
  return `<tr><td style="padding:28px 0 0">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#121212" style="background:#121212;border:1px solid #2a2a2a;border-radius:12px">
        <tr><td style="padding:28px 32px 8px">
          <div style="color:${gold};font-size:11px;font-weight:700;letter-spacing:.22em;text-transform:uppercase">Unser Leistungsspektrum</div>
          <div style="margin-top:10px;color:#f5f2ec;font-size:22px;line-height:1.3;font-weight:800">Ein Ansprechpartner für alles, bundesweit.</div>
          <div style="margin-top:8px;color:#bdb7ab;font-size:14px;line-height:1.6">Empfehlen Sie uns für jedes dieser Themen. Wir kümmern uns um das Angebot und halten Sie im Portal auf dem Laufenden.</div>
        </td></tr>
        <tr><td style="padding:8px 0 0;line-height:0;font-size:0"><a href="${SITE}"><img src="${SITE}/mail/services.gif?v=4" width="598" height="329" alt="Zertifizierung, Personenzertifizierung, Schulungen, Arbeitsschutz, Arbeitssicherheit, IT-Sicherheit, Factoring, Webseiten" style="display:block;width:100%;max-width:598px;height:auto;border:0;color:#bdb7ab;font-size:14px"></a></td></tr>
        <tr><td align="center" style="padding:8px 24px 28px"><table role="presentation" cellpadding="0" cellspacing="0">${lines}</table></td></tr>
      </table>
    </td></tr>`;
}

/**
 * Branded HTML mail in the black and gold of the portal. Table layout and inline styles only, so Outlook,
 * Gmail and phones render it the same; a plain-text version is sent along.
 */
function mailHtml(content: MailContent) {
  const gold = "#c9a45e";
  const rows = (content.rows ?? [])
    .map(
      ([label, value]) => `<tr class="tu-row">
        <td style="padding:10px 0;border-bottom:1px solid #2a2a2a;color:#8d877b;font-size:12px;letter-spacing:.08em;text-transform:uppercase;vertical-align:top;width:38%">${escapeHtml(label)}</td>
        <td style="padding:10px 0;border-bottom:1px solid #2a2a2a;color:#f5f2ec;font-size:15px;line-height:1.5;vertical-align:top">${
          /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
            ? `<a href="mailto:${escapeHtml(value)}" style="color:#f5f2ec;text-decoration:none">${escapeHtml(value)}</a>`
            : escapeHtml(value).replace(/\n/g, "<br>")
        }</td>
      </tr>`,
    )
    .join("");
  return `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark light"><meta name="format-detection" content="telephone=no,email=no,address=no,date=no"><style>a[x-apple-data-detectors],u + #body a,#MessageViewBody a{color:inherit!important;text-decoration:none!important}@keyframes tu-rise{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}@keyframes tu-glow{0%,100%{box-shadow:0 0 0 rgba(201,164,94,0)}50%{box-shadow:0 0 22px rgba(201,164,94,.55)}}.tu-card{animation:tu-rise .9s ease both}.tu-row{animation:tu-rise .7s ease both}.tu-cta{animation:tu-glow 2.6s ease-in-out 1s infinite}@media (prefers-reduced-motion:reduce){.tu-card,.tu-row,.tu-cta{animation:none!important}}</style><title>${escapeHtml(content.title)}</title></head>
<body id="body" style="margin:0;padding:0;background:#0e0e0e;font-family:Segoe UI,Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#0e0e0e" style="background:#0e0e0e"><tr><td align="center" style="padding:32px 16px">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px">
    <tr><td style="padding:0 0 18px;line-height:0;font-size:0"><img src="${SITE}/mail/header.gif?v=3" width="600" height="100" alt="Tayyip Ünal · Audit · Zertifizierung · Schulung" style="display:block;width:100%;max-width:600px;height:auto;border:0;color:#c9a45e;font-size:16px"></td></tr>
    <tr><td style="line-height:0;font-size:0"><img src="${SITE}/mail/gold-line.gif" width="600" height="8" alt="" style="display:block;width:100%;max-width:600px;height:8px;border:0"></td></tr>
    <tr><td class="tu-card" bgcolor="#181818" style="background:#181818;border:1px solid #2a2a2a;border-top:0;padding:36px 32px">
      <div style="color:${gold};font-size:11px;font-weight:700;letter-spacing:.22em;text-transform:uppercase">${escapeHtml(content.eyebrow)}</div>
      <h1 style="margin:12px 0 0;color:#f5f2ec;font-size:28px;line-height:1.2;font-weight:800;letter-spacing:-.01em">${escapeHtml(content.title)}</h1>
      ${content.intro ? `<p style="margin:16px 0 0;color:#bdb7ab;font-size:15px;line-height:1.6">${escapeHtml(content.intro).replace(/\n/g, "<br>")}</p>` : ""}
      ${rows ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px;border-top:1px solid #2a2a2a">${rows}</table>` : ""}
      ${content.body ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px"><tr><td bgcolor="#121212" style="background:#121212;border-radius:8px;padding:16px 18px;color:#f5f2ec;font-size:15px;line-height:1.6">${escapeHtml(content.body).replace(/\n/g, "<br>")}</td></tr></table>` : ""}
      ${
        content.cta
          ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:28px"><tr><td bgcolor="${gold}" style="background:${gold};border-radius:6px">
          <a class="tu-cta" href="${escapeHtml(content.cta.url)}" style="display:inline-block;border:solid ${gold};border-width:14px 28px;border-radius:6px;background:${gold};color:#17140f;font-size:15px;font-weight:700;line-height:18px;text-decoration:none">${escapeHtml(content.cta.label)} &rarr;</a>
        </td></tr></table>`
          : ""
      }
      ${content.note ? `<p style="margin:20px 0 0;color:#8d877b;font-size:13px;line-height:1.5">${escapeHtml(content.note)}</p>` : ""}
    </td></tr>
    ${content.promo ? promoHtml(gold) : ""}
    <tr><td style="padding:24px 4px 0;color:#6f6a62;font-size:12px;line-height:1.6">
      Tayyip Ünal · Audit, Zertifizierung und Schulung · <a href="https://www.tayyipuenal.de" style="color:${gold};text-decoration:none">tayyipuenal.de</a><br>
      Diese Nachricht wurde automatisch aus dem Partnerportal versendet.
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;
}

/** Plain-text twin of the HTML mail. */
function mailText(content: MailContent) {
  return [
    content.title,
    content.intro,
    ...(content.rows ?? []).map(([label, value]) => `${label}: ${value}`),
    content.body,
    content.cta && `${content.cta.label}: ${content.cta.url}`,
    content.note,
    "Tayyip Ünal · tayyipuenal.de",
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** Sends a branded mail through Resend. Without a key (or on any error) it returns false and the caller falls back to the visible link. */
async function sendMail(env: Env, to: string, subject: string, content: MailContent): Promise<boolean> {
  if (!env.RESEND_API_KEY) {
    console.warn("mail skipped: RESEND_API_KEY missing");
    return false;
  }
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ from: MAIL_FROM, to: [to], reply_to: MAIL_REPLY_TO, subject, html: mailHtml(content), text: mailText(content) }),
    });
    if (!response.ok) console.error("mail failed", response.status, await response.text());
    else console.log("mail sent", response.status);
    return response.ok;
  } catch (error) {
    console.error("mail error", error);
    return false;
  }
}

const inviteMail = (env: Env, to: string, name: string, link: string, what: string) =>
  sendMail(env, to, "Ihr Zugang zum Portal von Tayyip Ünal", {
    eyebrow: what,
    title: `Herzlich willkommen, ${name}`,
    intro: "Ihr persönlicher Zugang ist eingerichtet. Legen Sie über den Button Ihr Passwort fest, danach melden Sie sich jederzeit im Partnerportal an.",
    cta: { label: "Passwort festlegen", url: link },
    note: "Der Link ist 7 Tage gültig. Falls Sie diesen Zugang nicht erwartet haben, können Sie diese Nachricht ignorieren.",
    promo: true,
  });

/**
 * Tells the owner about something new (lead, application). Lines of the form "Label: Wert" become table rows,
 * everything else the message block.
 */
const notifyOwner = (env: Env, subject: string, lines: (string | false | undefined)[]) => {
  const rows: [string, string][] = [];
  const text: string[] = [];
  for (const line of lines) {
    if (!line) continue;
    const match = line.match(/^([^:\n]{1,40}):\s([\s\S]*)$/);
    if (match) rows.push([match[1], match[2]]);
    else text.push(line);
  }
  return sendMail(env, MAIL_OWNER, subject, {
    eyebrow: "Partnerportal",
    title: subject,
    rows,
    body: text.join("\n") || undefined,
    cta: { label: "Im Portal ansehen", url: PORTAL_URL },
  });
};

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
  permissions: string;
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

/**
 * Permissions the superadmin hands out. Partners start with everything switched on and can have
 * single rights taken away; staff (Mitarbeiter) start with nothing and get rights one by one.
 * The superadmin (role "admin") always has every right.
 */
const PARTNER_PERMS = {
  seeStatus: true, // sees the stage of each customer
  seeRate: true, // sees their own percentage
  seeAmounts: true, // sees commission amounts and deal values
  seeContact: true, // sees e-mail and phone of their customers
  submitLeads: true, // may enter customers in the portal
  editProfile: true, // may edit the text of their partner page
  pageActive: true, // partner page is publicly reachable and attributes leads
};
const STAFF_PERMS = { managePartners: false, manageLeads: false, managePayouts: false };
type Perms = typeof PARTNER_PERMS & typeof STAFF_PERMS;

function permsOf(p: { role: string; permissions?: string | null }): Perms {
  if (p.role === "admin") {
    return Object.fromEntries([...Object.keys(PARTNER_PERMS), ...Object.keys(STAFF_PERMS)].map((k) => [k, true])) as Perms;
  }
  let stored: Record<string, unknown> = {};
  try {
    stored = JSON.parse(p.permissions || "{}");
  } catch {
    stored = {};
  }
  const base: Record<string, boolean> = p.role === "staff" ? { ...STAFF_PERMS } : { ...PARTNER_PERMS };
  for (const key of Object.keys(base)) if (typeof stored[key] === "boolean") base[key] = stored[key] as boolean;
  return { ...Object.fromEntries(Object.keys(PARTNER_PERMS).map((k) => [k, false])), ...Object.fromEntries(Object.keys(STAFF_PERMS).map((k) => [k, false])), ...base } as Perms;
}

/** Keeps only the rights that exist for this role. */
function cleanPerms(role: string, input: unknown) {
  const allowed = Object.keys(role === "staff" ? STAFF_PERMS : PARTNER_PERMS);
  const source = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  return JSON.stringify(Object.fromEntries(allowed.filter((k) => typeof source[k] === "boolean").map((k) => [k, source[k]])));
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
  permissions: permsOf(p),
});

const STATUSES = ["new", "contacted", "offer", "won", "lost"];
/** The two areas partners refer customers to. Empty = not assigned yet. */
const CATEGORIES = ["", "zertifizierung", "personenzertifizierung", "arbeitsschutz", "arbeitssicherheit", "it-sicherheit", "factoring", "webseiten"];
/** Personal partner pages (/partner/<name>); off for now, keep in step with src/portal/features.ts. */
const PARTNER_PAGES = false;

const MAX_FILE_BYTES = 1_800_000;
const ALLOWED_MIME = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/svg+xml",
  "application/zip",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];
/** Areas without commission: customers are shown to the partner, but no commission is ever created. */
const NO_COMMISSION = ["arbeitssicherheit", "it-sicherheit", "factoring"];

/** Commission follows the lead: created when it is won, removed when it is not (unless already paid). */
async function syncCommission(env: Env, leadId: number) {
  const lead = await env.DB.prepare("SELECT * FROM leads WHERE id = ?").bind(leadId).first<{
    id: number;
    partner_id: number | null;
    status: string;
    deal_cents: number | null;
    category: string;
  }>();
  if (!lead || !lead.partner_id) return;
  if (NO_COMMISSION.includes(lead.category)) {
    await env.DB.prepare("DELETE FROM commissions WHERE lead_id = ? AND status = 'open'").bind(leadId).run();
    return;
  }
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

/* ---------- what a partner sees (also used for the admin's "view as partner") ---------- */

async function partnerSummary(env: Env, p: Partner) {
  const leads = await env.DB.prepare("SELECT status, COUNT(*) AS n FROM leads WHERE partner_id = ? GROUP BY status")
    .bind(p.id)
    .all<{ status: string; n: number }>();
  const money = await env.DB.prepare(
    `SELECT COALESCE(SUM(CASE WHEN status = 'open' THEN amount_cents END), 0) AS open_cents,
            COALESCE(SUM(CASE WHEN status = 'paid' THEN amount_cents END), 0) AS paid_cents
     FROM commissions WHERE partner_id = ?`,
  )
    .bind(p.id)
    .first<{ open_cents: number; paid_cents: number }>();
  const can = permsOf(p);
  return {
    ratePercent: can.seeRate ? p.rate_percent : null,
    slug: PARTNER_PAGES && can.pageActive ? p.slug : null,
    total: leads.results.reduce((sum, r) => sum + r.n, 0),
    won: leads.results.find((r) => r.status === "won")?.n ?? 0,
    leadsByStatus: can.seeStatus ? Object.fromEntries(leads.results.map((r) => [r.status, r.n])) : {},
    openCents: can.seeAmounts ? (money?.open_cents ?? 0) : null,
    paidCents: can.seeAmounts ? (money?.paid_cents ?? 0) : null,
  };
}

async function partnerLeads(env: Env, p: Partner) {
  const rows = await env.DB.prepare(
    `SELECT l.id, l.contact_name, l.company, l.email, l.phone, l.topic, l.message, l.status, l.deal_cents, l.source,
            l.category, l.customer_paid_at, l.created_at, l.updated_at, c.amount_cents AS commission_cents, c.rate_percent AS commission_rate, c.status AS commission_status
     FROM leads l LEFT JOIN commissions c ON c.lead_id = l.id
     WHERE l.partner_id = ? ORDER BY l.created_at DESC LIMIT 500`,
  )
    .bind(p.id)
    .all<Record<string, unknown> & { id: number }>();
  const can = permsOf(p);
  const offers = await env.DB.prepare(
    `SELECT f.id, f.lead_id, f.title, f.filename, f.size, f.created_at FROM files f JOIN leads l ON l.id = f.lead_id
     WHERE f.kind = 'offer' AND l.partner_id = ? ORDER BY f.created_at`,
  )
    .bind(p.id)
    .all<{ lead_id: number }>();
  return rows.results.map((row) => ({
    ...row,
    files: offers.results.filter((file) => file.lead_id === row.id),
    status: can.seeStatus ? row.status : null,
    email: can.seeContact ? row.email : "",
    phone: can.seeContact ? row.phone : "",
    deal_cents: can.seeAmounts ? row.deal_cents : null,
    customer_paid_at: can.seeAmounts ? row.customer_paid_at : null,
    commission_cents: can.seeAmounts ? row.commission_cents : null,
    commission_rate: can.seeRate ? row.commission_rate : null,
    commission_status: can.seeAmounts ? row.commission_status : null,
  }));
}

/** History of one of the partner's leads: status changes (if allowed) and notes marked visible. Null if the lead is not theirs. */
async function partnerLeadEvents(env: Env, p: Partner, leadId: number) {
  if (!(await env.DB.prepare("SELECT id FROM leads WHERE id = ? AND partner_id = ?").bind(leadId, p.id).first())) return null;
  const can = permsOf(p);
  const rows = await env.DB.prepare(
    "SELECT kind, status, note, created_at FROM lead_events WHERE lead_id = ? AND visible = 1 ORDER BY created_at, id",
  )
    .bind(leadId)
    .all<{ kind: string }>();
  return rows.results.filter((e) => (e.kind === "status" ? can.seeStatus : e.kind === "paid" ? can.seeAmounts : true));
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
    await notifyOwner(env, `Neue Partner-Bewerbung: ${name}`, [
      `Name: ${name}`,
      `Firma: ${clean(data.company, 160) || "–"}`,
      `E-Mail: ${email}`,
      `Telefon: ${clean(data.phone, 60) || "–"}`,
      "",
      clean(data.pitch, 2000),
    ]);
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
    const row = await env.DB.prepare("SELECT name, email FROM partners WHERE invite_hash = ? AND invite_expires > ? AND status IN ('approved', 'active')")
      .bind(await sha256(token), now())
      .first<{ name: string; email: string }>();
    return row ? json({ ok: true, name: row.name, email: row.email }) : fail("Der Einladungslink ist ungültig oder abgelaufen.", 404);
  }

  if (path === "/api/auth/activate" && method === "POST") {
    if (!(await limit(env, request, "activate", 10, 600))) return fail("Zu viele Versuche.", 429);
    const data = await body();
    const password = clean(data.password, 200);
    if (password.length < 12) return fail("Das Passwort braucht mindestens 12 Zeichen.");
    const row = await env.DB.prepare("SELECT * FROM partners WHERE invite_hash = ? AND invite_expires > ? AND status IN ('approved', 'active')")
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
    if (!PARTNER_PAGES) return fail("Partnerseite nicht gefunden.", 404);
    const slug = decodeURIComponent(path.slice("/api/partner-page/".length));
    const row = await env.DB.prepare("SELECT name, company, bio, slug, role, permissions FROM partners WHERE slug = ? AND status = 'active'")
      .bind(slug)
      .first<{ name: string; company: string; bio: string; slug: string; role: string; permissions: string }>();
    if (!row || !permsOf(row).pageActive) return fail("Partnerseite nicht gefunden.", 404);
    return json({ ok: true, partner: { name: row.name, company: row.company, bio: row.bio, slug: row.slug } });
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
    const result = await env.DB.prepare(
      `INSERT OR IGNORE INTO leads (source, contact_name, company, email, phone, topic, message, consent_at, request_id, created_at, updated_at)
       VALUES ('site', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(contactName, clean(data.company, 160), email, clean(data.phone, 60), kind, parts.join("\n").slice(0, 2000), now(), requestId, now(), now())
      .run();
    const row = await env.DB.prepare("SELECT id FROM leads WHERE request_id = ?").bind(requestId).first<{ id: number }>();
    if (result.meta.changes) {
      await notifyOwner(env, `Neue Anfrage: ${kind} von ${contactName}`, [
        `Name: ${contactName}`,
        `Firma: ${clean(data.company, 160) || "–"}`,
        `E-Mail: ${email}`,
        `Telefon: ${clean(data.phone, 60) || "–"}`,
        "",
        parts.join("\n").slice(0, 2000),
      ]);
    }
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
    const slug = PARTNER_PAGES ? clean(data.partnerSlug, 80) : "";
    if (slug) {
      const partner = await env.DB.prepare("SELECT id, role, permissions FROM partners WHERE slug = ? AND status = 'active'")
        .bind(slug)
        .first<{ id: number; role: string; permissions: string }>();
      partnerId = partner && permsOf(partner).pageActive ? partner.id : null;
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
    const via = partnerId ? await env.DB.prepare("SELECT name FROM partners WHERE id = ?").bind(partnerId).first<{ name: string }>() : null;
    await notifyOwner(env, `Neue Anfrage${via ? ` über ${via.name}` : ""}: ${contactName}`, [
      via ? `Empfohlen von: ${via.name}` : false,
      `Name: ${contactName}`,
      `Firma: ${clean(data.company, 160) || "–"}`,
      `E-Mail: ${email}`,
      `Telefon: ${clean(data.phone, 60) || "–"}`,
      `Thema: ${clean(data.topic, 80) || "–"}`,
      "",
      clean(data.message, 2000),
    ]);
    return json({ ok: true });
  }

  /* --- signed in --- */
  const user = await currentUser(request, env);
  if (!user) return fail("Bitte anmelden.", 401);

  if (path === "/api/me" && method === "GET") return json({ ok: true, user: publicPartner(user) });

  /** Download a file. Partners get downloads and the offers of their own customers; staff need a matching right. */
  const fileGet = path.match(/^\/api\/files\/(\d+)$/);
  if (fileGet && method === "GET") {
    const file = await env.DB.prepare(
      "SELECT f.kind, f.filename, f.mime, f.data, l.partner_id FROM files f LEFT JOIN leads l ON l.id = f.lead_id WHERE f.id = ?",
    )
      .bind(Number(fileGet[1]))
      .first<{ kind: string; filename: string; mime: string; data: ArrayBuffer | number[]; partner_id: number | null }>();
    const p = permsOf(user);
    const allowed =
      file &&
      (user.role === "admin" ||
        (user.role === "staff" && (file.kind === "offer" ? p.manageLeads : p.managePartners)) ||
        (user.role === "partner" && (file.kind === "download" || file.partner_id === user.id)));
    if (!file || !allowed) return fail("Datei nicht gefunden.", 404);
    const bytes = file.data instanceof ArrayBuffer ? new Uint8Array(file.data) : new Uint8Array(file.data);
    return new Response(bytes, {
      headers: {
        "content-type": file.mime,
        "content-disposition": `attachment; filename="${file.filename}"`,
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    });
  }

  if (path === "/api/partner/downloads" && method === "GET" && user.role === "partner") {
    const rows = await env.DB.prepare("SELECT id, title, filename, size, created_at FROM files WHERE kind = 'download' ORDER BY created_at DESC").all();
    return json({ ok: true, files: rows.results });
  }

  /** Application filled in by the partner together with the customer: becomes a new lead for an offer. */
  if (path === "/api/partner/requests" && method === "POST" && user.role === "partner") {
    if (!permsOf(user).submitLeads) return fail("Dafür fehlt die Berechtigung.", 403);
    const data = await body();
    const category = clean(data.category, 30);
    if (!category || !CATEGORIES.includes(category)) return fail("Bitte einen Bereich wählen.");
    const company = clean(data.company, 160);
    const contactName = clean(data.contactName, 120);
    if (!company || !contactName) return fail("Bitte Firma und Ansprechpartner angeben.");
    const email = clean(data.email, 200).toLowerCase();
    if (email && !validEmail(email)) return fail("Die E-Mail-Adresse ist ungültig.");
    if (!email && !clean(data.phone, 60)) return fail("Bitte E-Mail oder Telefonnummer angeben.");
    if (data.consent !== true) return fail("Bitte bestätigen Sie, dass der Kunde mit der Weitergabe einverstanden ist.");
    // details arrive as label → text from the form; keep them short and plain
    const source = data.details && typeof data.details === "object" ? (data.details as Record<string, unknown>) : {};
    const filled = Object.entries(source)
      .slice(0, 40)
      .map(([label, value]): [string, string] => [clean(label, 60), clean(value, 600)])
      .filter(([label, value]) => label && value);
    const topic = clean(data.topic, 80) || "Antrag";
    const result = await env.DB.prepare(
      `INSERT INTO leads (partner_id, source, contact_name, company, email, phone, topic, message, status, category, request_json, consent_at, created_at, updated_at)
       VALUES (?, 'antrag', ?, ?, ?, ?, ?, ?, 'new', ?, ?, ?, ?, ?)`,
    )
      .bind(
        user.id,
        contactName,
        company,
        email,
        clean(data.phone, 60),
        topic,
        filled.map(([label, value]) => `${label}: ${value}`).join("\n").slice(0, 2000),
        category,
        JSON.stringify(Object.fromEntries(filled)),
        now(),
        now(),
        now(),
      )
      .run();
    await env.DB.prepare("INSERT INTO lead_events (lead_id, kind, note, visible, created_at) VALUES (?, 'note', ?, 1, ?)")
      .bind(Number(result.meta.last_row_id), "Antrag eingegangen. Wir holen das beste Angebot ein und laden es hier hoch.", now())
      .run();
    await notifyOwner(env, `Neuer Antrag von ${user.name}: ${company}`, [
      `Partner: ${user.name}`,
      `Bereich: ${category}`,
      `Firma: ${company}`,
      `Ansprechpartner: ${contactName}`,
      `E-Mail: ${email || "–"}`,
      `Telefon: ${clean(data.phone, 60) || "–"}`,
      "",
      ...filled.map(([label, value]) => `${label}: ${value}`),
    ]);
    return json({ ok: true });
  }

  /* --- partner --- */
  if (path === "/api/partner/summary" && method === "GET" && user.role === "partner") {
    return json({ ok: true, ...(await partnerSummary(env, user)) });
  }

  if (path === "/api/partner/leads" && method === "GET" && user.role === "partner") {
    return json({ ok: true, leads: await partnerLeads(env, user) });
  }

  const myLeadEvents = path.match(/^\/api\/partner\/leads\/(\d+)\/events$/);
  if (myLeadEvents && method === "GET" && user.role === "partner") {
    const events = await partnerLeadEvents(env, user, Number(myLeadEvents[1]));
    return events ? json({ ok: true, events }) : fail("Nicht gefunden.", 404);
  }

  if (path === "/api/partner/leads" && method === "POST" && user.role === "partner") {
    if (!permsOf(user).submitLeads) return fail("Dafür fehlt die Berechtigung.", 403);
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
    await notifyOwner(env, `Neuer Kontakt von Partner ${user.name}: ${contactName}`, [
      `Gemeldet von: ${user.name}`,
      `Name: ${contactName}`,
      `Firma: ${clean(data.company, 160) || "–"}`,
      `E-Mail: ${email || "–"}`,
      `Telefon: ${clean(data.phone, 60) || "–"}`,
      `Thema: ${clean(data.topic, 80) || "–"}`,
      "",
      clean(data.message, 2000),
    ]);
    return json({ ok: true });
  }

  if (path === "/api/partner/profile" && method === "POST" && user.role === "partner") {
    if (!permsOf(user).editProfile) return fail("Dafür fehlt die Berechtigung.", 403);
    const data = await body();
    await env.DB.prepare("UPDATE partners SET bio = ?, company = ?, phone = ?, updated_at = ? WHERE id = ?")
      .bind(clean(data.bio, 1200), clean(data.company, 160), clean(data.phone, 60), now(), user.id)
      .run();
    return json({ ok: true });
  }

  /* --- admin --- */
  if (user.role !== "admin" && user.role !== "staff") return fail("Nicht gefunden.", 404);
  const can = permsOf(user);
  const isSuper = user.role === "admin";
  const denied = () => fail("Dafür fehlt die Berechtigung.", 403);
  const newInvite = async (id: number) => {
    const token = randomToken(24);
    await env.DB.prepare(
      "UPDATE partners SET status = CASE WHEN status = 'active' THEN 'active' ELSE 'approved' END, invite_hash = ?, invite_expires = ?, updated_at = ? WHERE id = ?",
    )
      .bind(await sha256(token), new Date(Date.now() + 7 * 86400000).toISOString(), now(), id)
      .run();
    return `${url.origin}/portal/aktivieren?token=${token}`;
  };

  /* --- superadmin only: staff and permissions --- */
  if (path === "/api/admin/staff/create" && method === "POST") {
    if (!isSuper) return denied();
    const data = await body();
    const name = clean(data.name, 120);
    const email = clean(data.email, 200).toLowerCase();
    if (!name || !validEmail(email)) return fail("Bitte Namen und eine gültige E-Mail-Adresse angeben.");
    if (await env.DB.prepare("SELECT id FROM partners WHERE email = ?").bind(email).first()) return fail("Zu dieser E-Mail-Adresse gibt es schon einen Zugang.", 409);
    const result = await env.DB.prepare(
      `INSERT INTO partners (role, status, email, name, permissions, created_at, updated_at) VALUES ('staff', 'approved', ?, ?, ?, ?, ?)`,
    )
      .bind(email, name, cleanPerms("staff", data.permissions), now(), now())
      .run();
    const link = await newInvite(Number(result.meta.last_row_id));
    return json({ ok: true, inviteUrl: link, mailed: await inviteMail(env, email, name, link, "Mitarbeiter-Zugang") });
  }

  /** Sends one sample of every mail a partner can receive to the superadmin, to check the look. */
  if (path === "/api/admin/mail-preview" && method === "POST") {
    if (!isSuper) return denied();
    const results = await Promise.all([
      inviteMail(env, user.email, "Max Mustermann", `${PORTAL_URL}/aktivieren?token=beispiel`, "Partnerportal"),
      sendMail(env, user.email, "Angebot für Muster GmbH liegt bereit", {
        eyebrow: "Neues Angebot",
        title: "Ihr Angebot liegt bereit",
        intro: "Guten Tag Max Mustermann, für Ihren Kunden liegt jetzt das Angebot im Partnerportal. Sie können es dort ansehen und an den Kunden weitergeben.",
        rows: [
          ["Kunde", "Muster GmbH"],
          ["Angebot", "Angebot ISO 9001 Erstzertifizierung"],
        ],
        cta: { label: "Angebot im Portal öffnen", url: PORTAL_URL },
        promo: true,
      }),
    ]);
    return results.every(Boolean) ? json({ ok: true }) : fail("Die Beispiel-Mails konnten nicht versendet werden.", 502);
  }

  const userAction = path.match(/^\/api\/admin\/users\/(\d+)\/(permissions|invite|block)$/);
  if (userAction && method === "POST") {
    if (!isSuper) return denied();
    const id = Number(userAction[1]);
    const target = await env.DB.prepare("SELECT * FROM partners WHERE id = ? AND role IN ('partner', 'staff')").bind(id).first<Partner>();
    if (!target) return fail("Zugang nicht gefunden.", 404);
    const data = await body();
    if (userAction[2] === "permissions") {
      await env.DB.prepare("UPDATE partners SET permissions = ?, updated_at = ? WHERE id = ?")
        .bind(cleanPerms(target.role, data.permissions), now(), id)
        .run();
      return json({ ok: true });
    }
    if (userAction[2] === "invite") {
      const link = await newInvite(id);
      return json({ ok: true, inviteUrl: link, mailed: await inviteMail(env, target.email, target.name, link, target.role === "staff" ? "Mitarbeiter-Zugang" : "Partnerportal") });
    }
    await env.DB.prepare("UPDATE partners SET status = 'blocked', updated_at = ? WHERE id = ?").bind(now(), id).run();
    await env.DB.prepare("DELETE FROM sessions WHERE partner_id = ?").bind(id).run();
    return json({ ok: true });
  }

  if (path === "/api/admin/overview" && method === "GET") {
    const staff = isSuper
      ? await env.DB.prepare("SELECT id, status, email, name, permissions, created_at FROM partners WHERE role = 'staff' ORDER BY created_at DESC").all<Partner>()
      : null;
    const wantsPartners = can.managePartners || can.managePayouts;
    const wantsLeads = can.manageLeads || can.managePayouts;
    const partners = !wantsPartners ? { results: [] } : await env.DB.prepare(
      `SELECT p.id, p.status, p.email, p.name, p.company, p.phone, p.pitch, p.slug, p.rate_percent, p.permissions, p.created_at,
              (SELECT COUNT(*) FROM leads l WHERE l.partner_id = p.id) AS leads,
              (SELECT COUNT(*) FROM leads l WHERE l.partner_id = p.id AND l.status = 'won') AS won,
              COALESCE((SELECT SUM(amount_cents) FROM commissions c WHERE c.partner_id = p.id AND c.status = 'open'), 0) AS open_cents,
              COALESCE((SELECT SUM(amount_cents) FROM commissions c WHERE c.partner_id = p.id AND c.status = 'paid'), 0) AS paid_cents
       FROM partners p WHERE p.role = 'partner' ORDER BY p.created_at DESC`,
    ).all<Partner & Record<string, unknown>>();
    const leads = !wantsLeads ? { results: [] } : await env.DB.prepare(
      `SELECT l.*, p.name AS partner_name, c.id AS commission_id, c.amount_cents AS commission_cents, c.status AS commission_status
       FROM leads l LEFT JOIN partners p ON p.id = l.partner_id LEFT JOIN commissions c ON c.lead_id = l.id
       ORDER BY l.created_at DESC LIMIT 500`,
    ).all<{ id: number }>();
    const fileRows = (
      await env.DB.prepare("SELECT id, kind, lead_id, title, filename, size, created_at FROM files ORDER BY created_at DESC").all<{
        kind: string;
        lead_id: number | null;
      }>()
    ).results;
    const leadsWithFiles = leads.results.map((lead) => ({ ...lead, files: fileRows.filter((f) => f.kind === "offer" && f.lead_id === lead.id) }));
    const withPerms = <T extends { permissions?: string }>(rows: T[], role: string) =>
      rows.map(({ permissions, ...rest }) => ({ ...rest, perms: permsOf({ role, permissions }) }));
    const partnerOptions = wantsLeads
      ? (await env.DB.prepare("SELECT id, name FROM partners WHERE role = 'partner' AND status IN ('approved', 'active') ORDER BY name").all()).results
      : [];
    return json({
      ok: true,
      isSuper,
      permissions: can,
      partnerOptions,
      partners: withPerms(partners.results as (Partner & { permissions: string })[], "partner"),
      staff: staff ? withPerms(staff.results as (Partner & { permissions: string })[], "staff") : [],
      leads: leadsWithFiles,
      downloads: fileRows.filter((f) => f.kind === "download"),
    });
  }

  /** Upload a file: an offer for one customer, or a download for all partners. Sent as JSON with base64 data. */
  if (path === "/api/admin/files" && method === "POST") {
    const data = await body();
    const kind = clean(data.kind, 20);
    if (kind !== "offer" && kind !== "download") return fail("Ungültige Dateiart.");
    if (kind === "offer" ? !can.manageLeads : !(isSuper || can.managePartners)) return denied();
    const filename = clean(data.filename, 160).replace(/[\\/"\r\n]/g, "_");
    const mime = clean(data.mime, 100) || "application/octet-stream";
    if (!filename || !ALLOWED_MIME.includes(mime)) return fail("Bitte PDF, Bild, Word, PowerPoint, Excel oder ZIP hochladen.");
    let bytes: Uint8Array;
    try {
      bytes = Uint8Array.from(atob(clean(data.data, 3_000_000)), (char) => char.charCodeAt(0));
    } catch {
      return fail("Die Datei konnte nicht gelesen werden.");
    }
    if (!bytes.length || bytes.length > MAX_FILE_BYTES) return fail("Die Datei darf höchstens 1,8 MB groß sein.");
    let leadId: number | null = null;
    let lead: { id: number; company: string; contact_name: string; status: string; partner_id: number | null } | null = null;
    if (kind === "offer") {
      leadId = Number(data.leadId);
      lead = await env.DB.prepare("SELECT id, company, contact_name, status, partner_id FROM leads WHERE id = ?").bind(leadId).first();
      if (!lead) return fail("Kunde nicht gefunden.", 404);
    }
    const title = clean(data.title, 120) || filename;
    await env.DB.prepare("INSERT INTO files (kind, lead_id, title, filename, mime, size, data, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(kind, leadId, title, filename, mime, bytes.length, bytes, now())
      .run();
    if (lead) {
      await env.DB.prepare("INSERT INTO lead_events (lead_id, kind, note, visible, created_at) VALUES (?, 'note', ?, 1, ?)")
        .bind(lead.id, `Angebot hochgeladen: ${title}`, now())
        .run();
      if (lead.status === "new" || lead.status === "contacted") {
        await env.DB.prepare("UPDATE leads SET status = 'offer', updated_at = ? WHERE id = ?").bind(now(), lead.id).run();
        await env.DB.prepare("INSERT INTO lead_events (lead_id, kind, status, visible, created_at) VALUES (?, 'status', 'offer', 1, ?)").bind(lead.id, now()).run();
      }
      const partner = lead.partner_id
        ? await env.DB.prepare("SELECT name, email FROM partners WHERE id = ? AND status = 'active'").bind(lead.partner_id).first<{ name: string; email: string }>()
        : null;
      if (partner) {
        await sendMail(env, partner.email, `Angebot für ${lead.company || lead.contact_name} liegt bereit`, {
          eyebrow: "Neues Angebot",
          title: "Ihr Angebot liegt bereit",
          intro: `Guten Tag ${partner.name}, für Ihren Kunden liegt jetzt das Angebot im Partnerportal. Sie können es dort ansehen und an den Kunden weitergeben.`,
          rows: [
            ["Kunde", lead.company || lead.contact_name],
            ["Angebot", title],
          ],
          cta: { label: "Angebot im Portal öffnen", url: PORTAL_URL },
        promo: true,
        });
      }
    }
    return json({ ok: true });
  }

  const fileDelete = path.match(/^\/api\/admin\/files\/(\d+)\/delete$/);
  if (fileDelete && method === "POST") {
    const file = await env.DB.prepare("SELECT kind FROM files WHERE id = ?").bind(Number(fileDelete[1])).first<{ kind: string }>();
    if (!file) return fail("Datei nicht gefunden.", 404);
    if (file.kind === "offer" ? !can.manageLeads : !(isSuper || can.managePartners)) return denied();
    await env.DB.prepare("DELETE FROM files WHERE id = ?").bind(Number(fileDelete[1])).run();
    return json({ ok: true });
  }

  /** Admin creates a partner directly, including the text of the partner page. */
  if (path === "/api/admin/partners/create" && method === "POST") {
    if (!can.managePartners) return denied();
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
    const link = `${url.origin}/portal/aktivieren?token=${token}`;
    return json({ ok: true, inviteUrl: link, mailed: await inviteMail(env, email, name, link, "Partnerportal"), slug, pageUrl: `${url.origin}/partner/${slug}` });
  }

  /** Read-only copy of exactly what this partner sees in their portal. */
  const preview = path.match(/^\/api\/admin\/partners\/(\d+)\/preview$/);
  if (preview && method === "GET") {
    if (!can.managePartners) return denied();
    const target = await env.DB.prepare("SELECT * FROM partners WHERE id = ? AND role = 'partner'").bind(Number(preview[1])).first<Partner>();
    if (!target) return fail("Partner nicht gefunden.", 404);
    const leads = await partnerLeads(env, target);
    const events: Record<number, unknown> = {};
    for (const lead of leads) events[lead.id] = (await partnerLeadEvents(env, target, lead.id)) ?? [];
    return json({ ok: true, user: publicPartner(target), summary: await partnerSummary(env, target), leads, events });
  }

  const partnerAction = path.match(/^\/api\/admin\/partners\/(\d+)\/(approve|invite|block|rate|profile)$/);
  if (partnerAction && method === "POST") {
    if (!can.managePartners) return denied();
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
      const link = `${url.origin}/portal/aktivieren?token=${token}`;
      return json({ ok: true, inviteUrl: link, mailed: await inviteMail(env, target.email, target.name, link, "Partnerportal"), slug });
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
    if (action === "rate") {
      const rate = Number(data.ratePercent);
      if (!Number.isFinite(rate) || rate < 0 || rate > 50) return fail("Der Prozentsatz muss zwischen 0 und 50 liegen.");
      await env.DB.prepare("UPDATE partners SET rate_percent = ?, updated_at = ? WHERE id = ?").bind(rate, now(), id).run();
      return json({ ok: true });
    }
  }

  const leadUpdate = path.match(/^\/api\/admin\/leads\/(\d+)$/);
  if (leadUpdate && method === "POST") {
    if (!can.manageLeads) return denied();
    const id = Number(leadUpdate[1]);
    const data = await body();
    const status = clean(data.status, 20);
    if (!STATUSES.includes(status)) return fail("Ungültiger Status.");
    const euro = data.dealEuro === null || data.dealEuro === undefined || data.dealEuro === "" ? null : Number(data.dealEuro);
    if (euro !== null && (!Number.isFinite(euro) || euro < 0 || euro > 10000000)) return fail("Ungültiger Auftragswert.");
    if (status === "won" && (!euro || euro <= 0)) return fail("Für einen gewonnenen Auftrag bitte den Auftragswert angeben.");
    const paid = await env.DB.prepare("SELECT id FROM commissions WHERE lead_id = ? AND status = 'paid'").bind(id).first();
    if (paid) return fail("Die Provision ist bereits ausgezahlt. Der Lead lässt sich nicht mehr ändern.", 409);
    const before = await env.DB.prepare("SELECT status, partner_id, category, customer_paid_at FROM leads WHERE id = ?")
      .bind(id)
      .first<{ status: string; partner_id: number | null; category: string; customer_paid_at: string | null }>();
    if (!before) return fail("Lead nicht gefunden.", 404);
    // optional fields: keep the current value when the field is not sent
    const category = data.category === undefined ? before.category : clean(data.category, 30);
    if (!CATEGORIES.includes(category)) return fail("Ungültiger Bereich.");
    let partnerId = before.partner_id;
    if (data.partnerId !== undefined) {
      partnerId = data.partnerId === null || data.partnerId === "" ? null : Number(data.partnerId);
      if (partnerId !== null && !(await env.DB.prepare("SELECT id FROM partners WHERE id = ? AND role = 'partner'").bind(partnerId).first())) {
        return fail("Partner nicht gefunden.");
      }
    }
    const nowPaid = data.customerPaid === undefined ? !!before.customer_paid_at : data.customerPaid === true;
    const paidAt = nowPaid ? before.customer_paid_at ?? now() : null;
    await env.DB.prepare("UPDATE leads SET status = ?, deal_cents = ?, category = ?, partner_id = ?, customer_paid_at = ?, updated_at = ? WHERE id = ?")
      .bind(status, euro === null ? null : Math.round(euro * 100), category, partnerId, paidAt, now(), id)
      .run();
    if (before.status !== status) {
      await env.DB.prepare("INSERT INTO lead_events (lead_id, kind, status, visible, created_at) VALUES (?, 'status', ?, 1, ?)")
        .bind(id, status, now())
        .run();
    }
    if (nowPaid !== !!before.customer_paid_at) {
      await env.DB.prepare("INSERT INTO lead_events (lead_id, kind, note, visible, created_at) VALUES (?, 'paid', ?, 1, ?)")
        .bind(id, nowPaid ? "Kunde hat bezahlt" : "Zahlung zurückgenommen", now())
        .run();
    }
    await syncCommission(env, id);
    return json({ ok: true });
  }

  /** The admin enters a customer by hand and assigns it to a partner and an area. */
  if (path === "/api/admin/leads/create" && method === "POST") {
    if (!can.manageLeads) return denied();
    const data = await body();
    const contactName = clean(data.name, 120);
    const company = clean(data.company, 160);
    if (!contactName && !company) return fail("Bitte Firma oder Ansprechpartner angeben.");
    const category = clean(data.category, 30);
    if (!CATEGORIES.includes(category)) return fail("Ungültiger Bereich.");
    const status = clean(data.status, 20) || "new";
    if (!STATUSES.includes(status)) return fail("Ungültiger Status.");
    const euro = data.dealEuro === null || data.dealEuro === undefined || data.dealEuro === "" ? null : Number(data.dealEuro);
    if (euro !== null && (!Number.isFinite(euro) || euro < 0 || euro > 10000000)) return fail("Ungültiger Auftragswert.");
    if (status === "won" && (!euro || euro <= 0)) return fail("Für einen erhaltenen Auftrag bitte den Auftragswert angeben.");
    let partnerId: number | null = null;
    if (data.partnerId !== null && data.partnerId !== undefined && data.partnerId !== "") {
      partnerId = Number(data.partnerId);
      if (!(await env.DB.prepare("SELECT id FROM partners WHERE id = ? AND role = 'partner'").bind(partnerId).first())) return fail("Partner nicht gefunden.");
    }
    const result = await env.DB.prepare(
      `INSERT INTO leads (partner_id, source, contact_name, company, email, phone, topic, message, status, deal_cents, category, created_at, updated_at)
       VALUES (?, 'admin', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        partnerId,
        contactName || company,
        company,
        clean(data.email, 200).toLowerCase(),
        clean(data.phone, 60),
        clean(data.topic, 80),
        clean(data.message, 2000),
        status,
        euro === null ? null : Math.round(euro * 100),
        category,
        now(),
        now(),
      )
      .run();
    const id = Number(result.meta.last_row_id);
    if (status !== "new") {
      await env.DB.prepare("INSERT INTO lead_events (lead_id, kind, status, visible, created_at) VALUES (?, 'status', ?, 1, ?)").bind(id, status, now()).run();
    }
    await syncCommission(env, id);
    return json({ ok: true, id });
  }

  /** Timeline of one lead, including internal notes. */
  const leadEvents = path.match(/^\/api\/admin\/leads\/(\d+)\/events$/);
  if (leadEvents && method === "GET") {
    if (!can.manageLeads) return denied();
    const rows = await env.DB.prepare("SELECT id, kind, status, note, visible, created_at FROM lead_events WHERE lead_id = ? ORDER BY created_at, id")
      .bind(Number(leadEvents[1]))
      .all();
    return json({ ok: true, events: rows.results });
  }

  /** A note on a lead; "visible" decides whether the partner sees it. */
  const leadNote = path.match(/^\/api\/admin\/leads\/(\d+)\/notes$/);
  if (leadNote && method === "POST") {
    if (!can.manageLeads) return denied();
    const data = await body();
    const note = clean(data.note, 1000);
    if (!note) return fail("Bitte eine Notiz eingeben.");
    const id = Number(leadNote[1]);
    if (!(await env.DB.prepare("SELECT id FROM leads WHERE id = ?").bind(id).first())) return fail("Lead nicht gefunden.", 404);
    await env.DB.prepare("INSERT INTO lead_events (lead_id, kind, note, visible, created_at) VALUES (?, 'note', ?, ?, ?)")
      .bind(id, note, data.visible === true ? 1 : 0, now())
      .run();
    return json({ ok: true });
  }

  const payout = path.match(/^\/api\/admin\/commissions\/(\d+)\/pay$/);
  if (payout && method === "POST") {
    if (!can.managePayouts) return denied();
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
