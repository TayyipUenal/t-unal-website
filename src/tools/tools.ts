import { Calculator, CalendarCheck, CalendarRange, ClipboardCheck, Compass, ListChecks, Timer, TrendingUp, type LucideIcon } from "lucide-react";

/** The "Werkzeuge" menu: every self-service tool of the site, opened in one window with tabs. */
export type ToolId = "reife" | "angebote" | "fahrplan" | "norm" | "preis" | "countdown" | "termine" | "checkliste";

export const TOOLS: { id: ToolId; label: string; hint: string; icon: LucideIcon }[] = [
  { id: "reife", label: "Reife-Check", hint: "Wie auditreif sind Sie?", icon: ClipboardCheck },
  { id: "angebote", label: "Umsatz & Angebote", hint: "Mehrere Angebote, ISO 9001 akkreditiert ab 2.450 €", icon: TrendingUp },
  { id: "fahrplan", label: "Fahrplan", hint: "Zertifikat bis zum Wunschtermin", icon: CalendarRange },
  { id: "norm", label: "Welche Norm?", hint: "Die passende Norm in 1 Minute", icon: Compass },
  { id: "preis", label: "Preis berechnen", hint: "Ihr Angebot in 2 Minuten", icon: Calculator },
  { id: "countdown", label: "Countdown", hint: "Wann läuft Ihr Zertifikat ab?", icon: Timer },
  { id: "termine", label: "Freie Termine", hint: "Erstgespräch in den nächsten Wochen", icon: CalendarCheck },
  { id: "checkliste", label: "Checkliste", hint: "27 Punkte gratis zum Ausdrucken", icon: ListChecks },
];

/** Entry price shown on the homepage and in the offers tool. */
export const ACCREDITED_FROM = "2.450 €";
export const ACCREDITED_FROM_EUR = 2450;

/** Old section anchors still linked from other pages open the matching tool. */
const HASH_TOOLS: Record<string, ToolId> = { audits: "preis", "norm-check": "norm", werkzeuge: "reife" };

export function toolFromHash(hash: string): ToolId | null {
  const key = decodeURIComponent(hash.replace(/^#/, ""));
  if (HASH_TOOLS[key]) return HASH_TOOLS[key];
  const id = key.startsWith("werkzeug-") ? key.slice("werkzeug-".length) : "";
  return TOOLS.some((tool) => tool.id === id) ? (id as ToolId) : null;
}

export const openTool = (id: ToolId) => window.dispatchEvent(new CustomEvent<ToolId>("tools:open", { detail: id }));

/** Closes the tools window and scrolls to the appointment calendar in the hero, optionally in a given week. */
export function goToBooking(week?: number) {
  window.dispatchEvent(new Event("tools:close"));
  const target = document.getElementById("termin");
  if (!target) {
    window.location.href = "/#termin";
    return;
  }
  if (week !== undefined) window.dispatchEvent(new CustomEvent<number>("booking:week", { detail: week }));
  target.scrollIntoView({ behavior: "smooth", block: "center" });
}

export type ToolRequest = {
  tool: "reife" | "angebote" | "fahrplan" | "countdown" | "checkliste";
  email: string;
  name?: string;
  company?: string;
  phone?: string;
  details?: Record<string, string>;
  gaps?: string[];
  expires?: string;
  consent: boolean;
  website?: string;
};

export async function sendToolRequest(request: ToolRequest) {
  const response = await fetch("/api/tools/request", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.ok) throw new Error(result?.error || "Das hat nicht geklappt. Bitte versuchen Sie es erneut.");
}

export const euro = (value: number) => `${Math.round(value).toLocaleString("de-DE")} €`;
