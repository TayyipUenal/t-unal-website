import { auditPackages } from "./content";

const details = [
  {
    slug: "iso-9001",
    heading: "ISO 9001: Qualität mit klaren Prozessen.",
    meta: "ISO 9001 Beratung & Auditvorbereitung in Dortmund | Tayyip Ünal",
    intro:
      "Von der ersten Bestandsaufnahme bis zur Auditvorbereitung: Wir unterstützen Sie beim Aufbau eines Qualitätsmanagementsystems, das zu Ihrem Unternehmen passt.",
    audience:
      "Für Unternehmen, die ihre Abläufe nachvollziehbar gestalten, Kundenanforderungen erfüllen und eine Zertifizierung vorbereiten möchten.",
    scope: [
      "Prozesse und Verantwortlichkeiten aufnehmen",
      "Qualitätsziele und relevante Kennzahlen strukturieren",
      "Dokumentation und Nachweise gezielt vorbereiten",
      "Auditbereitschaft prüfen und offene Punkte klären",
    ],
    documents: [
      "Vorhandene Prozessbeschreibungen",
      "Organigramm und Zuständigkeiten",
      "Kundenanforderungen und Qualitätsziele",
    ],
    result:
      "Sie erhalten einen priorisierten Maßnahmenplan, eine übersichtliche Dokumentationsstruktur und Klarheit über die nächsten Schritte zum Audit.",
    faq: "Muss bereits ein Qualitätsmanagementsystem vorhanden sein?",
    answer:
      "Nein. Wir können bei der Bestandsaufnahme beginnen oder Ihr bestehendes System gemeinsam weiterentwickeln. Umfang und Zeitplan richten sich nach Ihrer Ausgangslage.",
  },
  {
    slug: "iso-14001",
    heading: "ISO 14001: Umweltverantwortung mit System.",
    meta: "ISO 14001 Umweltmanagement & Auditvorbereitung | Tayyip Ünal",
    intro:
      "Wir unterstützen Sie dabei, relevante Umweltaspekte zu verstehen, Maßnahmen festzulegen und Ihr Umweltmanagement nachvollziehbar auf ein Audit vorzubereiten.",
    audience:
      "Für Unternehmen, die Umweltauswirkungen systematisch betrachten, Ressourcen bewusster einsetzen und ihre Umweltziele verbindlich organisieren möchten.",
    scope: [
      "Wesentliche Umweltaspekte gemeinsam erfassen",
      "Umweltziele und Maßnahmen nachvollziehbar festlegen",
      "Betriebliche Zuständigkeiten und Nachweise strukturieren",
      "Dokumentation und Umsetzung für das Audit vorbereiten",
    ],
    documents: [
      "Angaben zu Standorten und Tätigkeiten",
      "Vorhandene Umwelt- und Ressourcendaten",
      "Bestehende Ziele, Maßnahmen und Nachweise",
    ],
    result:
      "Eine klare Übersicht Ihrer Handlungsfelder, konkrete nächste Schritte und eine Dokumentation, mit der Sie Ihre Umweltmaßnahmen verständlich darstellen können.",
    faq: "Lässt sich ISO 14001 mit ISO 9001 verbinden?",
    answer:
      "Ja, gemeinsame Abläufe und Dokumentationsstrukturen können sinnvoll zusammengeführt werden. Im Erstgespräch klären wir, wie sich Ihr bestehendes Managementsystem nutzen lässt.",
  },
  {
    slug: "iso-45001",
    heading: "ISO 45001: Arbeitsschutz im Alltag verankern.",
    meta: "ISO 45001 Arbeitsschutzmanagement & Auditberatung | Tayyip Ünal",
    intro:
      "Wir begleiten Sie dabei, Arbeitsschutz, Verantwortlichkeiten und betriebliche Abläufe in einem verständlichen Managementsystem zusammenzuführen.",
    audience:
      "Für Unternehmen, die Sicherheit und Gesundheit bei der Arbeit strukturiert organisieren und ihr Arbeitsschutzmanagement auf ein Audit vorbereiten möchten.",
    scope: [
      "Bestehende Arbeitsschutzstrukturen analysieren",
      "Risiken, Schutzmaßnahmen und Zuständigkeiten ordnen",
      "Mitarbeiterbeteiligung und Schulungsbedarf berücksichtigen",
      "Wirksamkeit, Dokumentation und Auditvorbereitung begleiten",
    ],
    documents: [
      "Vorhandene Gefährdungsbeurteilungen",
      "Unterweisungs- und Schulungsnachweise",
      "Verantwortlichkeiten und betriebliche Schutzmaßnahmen",
    ],
    result:
      "Ein abgestimmter Maßnahmenplan, klare Verantwortlichkeiten und nachvollziehbare Nachweise für Ihr betriebliches Arbeitsschutzmanagement.",
    faq: "Ersetzt das Managementsystem die Gefährdungsbeurteilung?",
    answer:
      "Nein. Die Gefährdungsbeurteilung bleibt ein eigenständiger Bestandteil des betrieblichen Arbeitsschutzes. Vorhandene Beurteilungen und Maßnahmen werden in die gemeinsame Vorbereitung einbezogen.",
  },
];

export const audits = auditPackages.map((audit, index) => ({
  ...audit,
  ...details[index],
  path: `/audits/${details[index].slug}/`,
}));
export type Audit = (typeof audits)[number];
