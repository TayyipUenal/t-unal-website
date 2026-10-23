/**
 * The areas partners refer customers to. One list for the partner view, the admin and the application form;
 * the worker keeps the same keys in CATEGORIES (worker/index.ts). Areas with noCommission never earn a commission.
 */
export type AreaKey =
  | "zertifizierung"
  | "personenzertifizierung"
  | "arbeitsschutz"
  | "arbeitssicherheit"
  | "it-sicherheit"
  | "factoring"
  | "webseiten";

export type Area = { key: AreaKey; label: string; short: string; hint: string; noCommission?: boolean };

export const AREAS: Area[] = [
  {
    key: "zertifizierung",
    label: "Zertifizierung",
    short: "ISO, SCC und weitere Normen",
    hint: "Was wir Ihren Kunden an Zertifizierung angeboten haben und wie weit es ist.",
  },
  {
    key: "personenzertifizierung",
    label: "Personenzertifizierung und Schulungen",
    short: "Stapler, Kran, Erste Hilfe, SCC Dok. 016/017/018 …",
    hint: "Schulungen, Prüfungen und Zertifikate für Mitarbeitende Ihrer Kunden.",
  },
  {
    key: "arbeitsschutz",
    label: "Arbeitsschutz und Gesundheit",
    short: "Prüfungen, Arbeitsmedizin, SiGeKo, Brandschutz",
    hint: "Leistungen rund um Arbeitsschutz, Prüfungen und Arbeitsmedizin.",
  },
  {
    key: "arbeitssicherheit",
    label: "Arbeitssicherheit (Grundbetreuung)",
    short: "Sicherheitstechnische Grundbetreuung, ohne Provision",
    hint: "Für die Grundbetreuung in der Arbeitssicherheit gibt es keine Provision. Ihre vermittelten Kunden sehen Sie hier trotzdem.",
    noCommission: true,
  },
  {
    key: "it-sicherheit",
    label: "IT-Sicherheit",
    short: "ISO 27001, NIS2, Datenschutz, ohne Provision",
    hint: "Für IT-Sicherheit gibt es keine Provision. Ihre vermittelten Kunden sehen Sie hier trotzdem.",
    noCommission: true,
  },
  {
    key: "factoring",
    label: "Factoring",
    short: "Liquidität durch Forderungsverkauf, ohne Provision",
    hint: "Für Factoring gibt es keine Provision. Ihre vermittelten Kunden sehen Sie hier trotzdem.",
    noCommission: true,
  },
  {
    key: "webseiten",
    label: "Webseitenerstellung",
    short: "Website, Relaunch, Onlineshop",
    hint: "Neue Webseiten, Relaunches und Onlineshops für Ihre Kunden.",
  },
];

export const areaLabel = (key: string | null | undefined) => AREAS.find((area) => area.key === key)?.label ?? "Weitere Kunden";
export const areaHint = (key: string | null | undefined) => AREAS.find((area) => area.key === key)?.hint ?? "";
export const noCommission = (key: string | null | undefined) => !!AREAS.find((area) => area.key === key)?.noCommission;
