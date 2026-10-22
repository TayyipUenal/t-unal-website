export type User = {
  id: number;
  role: "admin" | "partner";
  name: string;
  company: string;
  email: string;
  slug: string | null;
  bio: string;
  ratePercent: number;
};

export type LeadStatus = "new" | "contacted" | "offer" | "won" | "lost";

export const STATUS_LABEL: Record<LeadStatus, string> = {
  new: "Eingegangen",
  contacted: "In Kontakt",
  offer: "Angebot",
  won: "Auftrag erhalten",
  lost: "Nicht zustande gekommen",
};
export const STATUS_ORDER: LeadStatus[] = ["new", "contacted", "offer", "won", "lost"];

export type PartnerLead = {
  id: number;
  contact_name: string;
  company: string;
  email: string;
  phone: string;
  topic: string;
  message: string;
  status: LeadStatus;
  deal_cents: number | null;
  source: string;
  created_at: string;
  updated_at: string;
  commission_cents: number | null;
  commission_rate: number | null;
  commission_status: "open" | "paid" | null;
};

export type Summary = {
  ratePercent: number;
  slug: string | null;
  leadsByStatus: Partial<Record<LeadStatus, number>>;
  openCents: number;
  paidCents: number;
};

export type AdminPartner = {
  id: number;
  status: "pending" | "approved" | "active" | "blocked";
  email: string;
  name: string;
  company: string;
  phone: string;
  pitch: string;
  slug: string | null;
  rate_percent: number;
  created_at: string;
  leads: number;
  won: number;
  open_cents: number;
  paid_cents: number;
};

export type AdminLead = PartnerLead & {
  partner_id: number | null;
  partner_name: string | null;
  commission_id: number | null;
};

type Result<T> = { ok: true } & T;

/** JSON request against the worker. Throws an Error with the server's German message. */
export async function api<T = Record<string, never>>(path: string, body?: unknown): Promise<Result<T>> {
  const response = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: "same-origin",
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.ok) {
    const error = new Error(data?.error || data?.message || "Die Anfrage ist fehlgeschlagen. Bitte versuchen Sie es erneut.") as Error & {
      status?: number;
    };
    error.status = response.status;
    throw error;
  }
  return data as Result<T>;
}

export const euro = (cents: number | null | undefined) =>
  cents === null || cents === undefined
    ? "–"
    : (cents / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" });

export const dateDe = (iso: string) =>
  new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });

/** Sets title and robots for pages that must not be indexed (portal, partner pages). */
export function setPageMeta(title: string, noindex = true) {
  document.title = title;
  let robots = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
  if (!robots) {
    robots = document.createElement("meta");
    robots.name = "robots";
    document.head.append(robots);
  }
  robots.content = noindex ? "noindex, nofollow" : "index, follow";
}
