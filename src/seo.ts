import { audits } from "./audits";
import { contact } from "./content";

export const SITE_URL = "https://tayyipuenal.de";
export const pageMeta = [
  {
    path: "/",
    title: "Tayyip Ünal | ISO-Audits, Beratung & Schulungen in Dortmund",
    description:
      "Persönliche Beratung für ISO 9001, ISO 14001 und ISO 45001, Angebot online konfigurieren, dazu SCC-Schulungen nach Dok. 017 und Dok. 018.",
  },
  ...audits.map((audit) => ({
    path: audit.path,
    title: audit.meta,
    description: `${audit.standard} ${audit.eyebrow}: persönliche Beratung, strukturierte Dokumentation und Auditvorbereitung mit Tayyip Ünal. Unverbindlich anfragen.`,
  })),
  {
    path: "/partner-werden/",
    title: "Partner werden | Tayyip Ünal",
    description:
      "Werden Sie Partner von Tayyip Ünal: eigenes Portal, eigene Partnerseite, Live-Stand aller Kunden und Provision je Auftrag.",
  },
  {
    path: "/impressum/",
    title: "Impressum | Tayyip Ünal, Dortmund",
    description:
      "Unternehmens- und Kontaktangaben von Tayyip Ünal, Einzelunternehmer in Dortmund. Berufsrechtliche Angaben und redaktionelle Verantwortung.",
  },
  {
    path: "/datenschutz/",
    title: "Datenschutzerklärung | Tayyip Ünal",
    description:
      "Informationen zu Kontaktformularen, Hosting, Datenschutz und Ihren Rechten auf der Website von Tayyip Ünal.",
  },
];

export function structuredData(path: string) {
  const audit = audits.find((audit) => audit.path === path);
  const organization = {
    "@type": "ProfessionalService",
    "@id": `${SITE_URL}/#unternehmen`,
    name: "Tayyip Ünal",
    url: SITE_URL,
    image: `${SITE_URL}/icon-512x512.png`,
    telephone: "+4915563084795",
    email: contact.email,
    address: {
      "@type": "PostalAddress",
      streetAddress: "Antonio-Segni-Str. 4",
      postalCode: "44263",
      addressLocality: "Dortmund",
      addressCountry: "DE",
    },
    sameAs: [contact.linkedIn, contact.provenExpert],
  };
  const graph: object[] = [organization];
  if (audit)
    graph.push(
      {
        "@type": "Service",
        name: `${audit.standard} Beratung und Auditvorbereitung`,
        serviceType: audit.eyebrow,
        description: audit.intro,
        url: `${SITE_URL}${path}`,
        provider: { "@id": `${SITE_URL}/#unternehmen` },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: "Startseite",
            item: `${SITE_URL}/`,
          },
          {
            "@type": "ListItem",
            position: 2,
            name: "Audit & Zertifizierung",
            item: `${SITE_URL}/#audits`,
          },
          {
            "@type": "ListItem",
            position: 3,
            name: audit.standard,
            item: `${SITE_URL}${path}`,
          },
        ],
      },
    );
  if (path === "/")
    graph.push({
      "@type": "VideoObject",
      name: "Von der Paketauswahl zum gemeinsamen Abschluss",
      description:
        "Beispiel Zertifizierung: Paket wählen, Dokumente sammeln, Prüfung und Freigabe abstimmen und den Vorgang mit einem Handschlag abschließen.",
      thumbnailUrl: [`${SITE_URL}/media/workflow-poster.png?v=12932b1cf1`],
      uploadDate: "2026-09-15T08:00:00+02:00",
      duration: "PT28S",
      contentUrl: `${SITE_URL}/media/workflow-de.mp4?v=e5e482f2ee`,
      inLanguage: "de",
    });
  return { "@context": "https://schema.org", "@graph": graph };
}
