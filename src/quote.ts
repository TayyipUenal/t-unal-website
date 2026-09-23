import type { LucideIcon } from "lucide-react";
import {
  Award,
  Building2,
  CalendarClock,
  CalendarPlus,
  CalendarRange,
  Factory,
  HardHat,
  Layers,
  Leaf,
  RefreshCw,
  Rocket,
  User,
  Users,
} from "lucide-react";
import { audits } from "./audits";

/**
 * Options of the four-step quote configurator. The `value` strings are sent
 * to the mail endpoint and must match the allow-lists in
 * public/api/quote-template.php.
 */
export type QuoteChoice = {
  value: string;
  label: string;
  hint: string;
  icon: LucideIcon;
  tone?: string;
  tint?: string;
};

const standardIcons: Record<string, { icon: LucideIcon; tone: string; tint: string }> = {
  "iso-9001": { icon: Award, tone: "#0a5c86", tint: "#e6f3fa" },
  "iso-14001": { icon: Leaf, tone: "#2f8a5b", tint: "#e8f6ee" },
  "iso-45001": { icon: HardHat, tone: "#b7791f", tint: "#fbf3e3" },
};

export const quoteStandards = audits.map((audit) => ({
  value: audit.standard,
  label: audit.standard,
  hint: audit.eyebrow,
  slug: audit.slug,
  path: audit.path,
  ...standardIcons[audit.slug],
}));

export const quoteSituations: QuoteChoice[] = [
  {
    value: "Erstzertifizierung",
    label: "Erstzertifizierung",
    hint: "Ein Managementsystem wird neu aufgebaut.",
    icon: Rocket,
  },
  {
    value: "Rezertifizierung",
    label: "Rezertifizierung",
    hint: "Das bestehende Zertifikat steht zur Erneuerung an.",
    icon: RefreshCw,
  },
  {
    value: "System optimieren",
    label: "System optimieren",
    hint: "Ein vorhandenes System wird verbessert oder erweitert.",
    icon: Layers,
  },
];

export const quoteSizes: QuoteChoice[] = [
  { value: "1–10 Mitarbeitende", label: "1–10", hint: "Mitarbeitende", icon: User },
  { value: "11–50 Mitarbeitende", label: "11–50", hint: "Mitarbeitende", icon: Users },
  { value: "51–250 Mitarbeitende", label: "51–250", hint: "Mitarbeitende", icon: Building2 },
  { value: "Über 250 Mitarbeitende", label: "250+", hint: "Mitarbeitende", icon: Factory },
];

export const quoteTimeframes: QuoteChoice[] = [
  {
    value: "Innerhalb von 4 Wochen",
    label: "In den nächsten 4 Wochen",
    hint: "Zeitnah starten",
    icon: CalendarClock,
  },
  {
    value: "In 1–3 Monaten",
    label: "In 1–3 Monaten",
    hint: "Mit Vorlauf planen",
    icon: CalendarRange,
  },
  {
    value: "In mehr als 3 Monaten",
    label: "In 3+ Monaten",
    hint: "Frühzeitig orientieren",
    icon: CalendarPlus,
  },
];

export const quoteSteps = [
  {
    key: "norm",
    label: "Norm",
    title: "Welche Norm ist für Sie relevant?",
    hint: "Mehrfachauswahl möglich.",
  },
  {
    key: "situation",
    label: "Ausgangslage",
    title: "Wo steht Ihr Unternehmen heute?",
    hint: "",
  },
  {
    key: "size",
    label: "Mitarbeitende",
    title: "Wie viele Mitarbeitende hat Ihr Unternehmen?",
    hint: "",
  },
  {
    key: "timeframe",
    label: "Zeitrahmen",
    title: "Wann möchten Sie starten?",
    hint: "",
  },
  {
    key: "contact",
    label: "Kontakt",
    title: "Wohin dürfen wir Ihre Einschätzung senden?",
    hint: "",
  },
] as const;

export type QuoteSelection = {
  standards: string[];
  situation: string;
  size: string;
  timeframe: string;
};

/** Reads `?norm=iso-9001,iso-14001` so audit pages can pre-select standards. */
export function standardsFromSearch(search: string): string[] {
  const slugs = new URLSearchParams(search).get("norm")?.split(",") ?? [];
  return quoteStandards
    .filter((standard) => slugs.includes(standard.slug))
    .map((standard) => standard.value);
}
