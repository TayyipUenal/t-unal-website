export type Perms = {
  seeStatus: boolean;
  seeRate: boolean;
  seeAmounts: boolean;
  seeContact: boolean;
  submitLeads: boolean;
  editProfile: boolean;
  pageActive: boolean;
  managePartners: boolean;
  manageLeads: boolean;
  managePayouts: boolean;
};

/** Labels shown in the permission editor, grouped by who they apply to. */
export const PARTNER_RIGHTS: [keyof Perms, string, string][] = [
  ["seeStatus", "Stand der Kunden sehen", "Eingegangen, in Kontakt, Angebot, Auftrag"],
  ["seeRate", "Eigenen Prozentsatz sehen", "Der Anteil, der dem Partner zusteht"],
  ["seeAmounts", "Beträge sehen", "Auftragswerte und Provisionen in Euro"],
  ["seeContact", "Kontaktdaten der Kunden sehen", "E-Mail und Telefon (sonst nur Name und Firma)"],
  ["submitLeads", "Kunden selbst melden", "Kontakt im Portal eintragen"],
  ["editProfile", "Text der Partnerseite ändern", "Sonst pflegen nur Sie den Text"],
  ["pageActive", "Partnerseite öffentlich", "Seite ist erreichbar und ordnet Anfragen zu"],
];
export const STAFF_RIGHTS: [keyof Perms, string, string][] = [
  ["managePartners", "Partner verwalten", "Bewerbungen, Anlegen, Anteil, Sperren"],
  ["manageLeads", "Kunden und Leads bearbeiten", "Stand und Auftragswert setzen"],
  ["managePayouts", "Provisionen auszahlen", "Provisionen einsehen und als ausgezahlt markieren"],
];

export type User = {
  id: number;
  role: "admin" | "staff" | "partner";
  permissions: Perms;
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
  status: LeadStatus | null;
  deal_cents: number | null;
  category: string;
  customer_paid_at: string | null;
  files?: FileInfo[];
  source: string;
  created_at: string;
  updated_at: string;
  commission_cents: number | null;
  commission_rate: number | null;
  commission_status: "open" | "paid" | null;
};

export type FileInfo = { id: number; title: string; filename: string; size: number; created_at: string };

export type LeadEvent = {
  kind: "status" | "note" | "paid";
  status: LeadStatus | null;
  note: string | null;
  visible?: number;
  created_at: string;
};

export type Summary = {
  ratePercent: number | null;
  total: number;
  won: number;
  slug: string | null;
  leadsByStatus: Partial<Record<LeadStatus, number>>;
  openCents: number | null;
  paidCents: number | null;
};

export type AdminPartner = {
  id: number;
  status: "pending" | "approved" | "active" | "blocked" | "archived";
  email: string;
  name: string;
  company: string;
  phone: string;
  pitch: string;
  slug: string | null;
  rate_percent: number;
  last_seen_at: string | null;
  created_at: string;
  leads: number;
  won: number;
  open_cents: number;
  paid_cents: number;
  perms: Perms;
};

export type StaffMember = {
  id: number;
  status: "approved" | "active" | "blocked";
  email: string;
  name: string;
  created_at: string;
  perms: Perms;
};

export type AdminLead = Omit<PartnerLead, "status"> & {
  status: LeadStatus;
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
