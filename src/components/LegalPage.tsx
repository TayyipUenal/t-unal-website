import { type ReactNode } from "react";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { contact } from "../content";

type LegalSection = { id: string; title: string; content: ReactNode };

function BusinessAddress() {
  return (
    <address className="legal-address">
      <strong>Tayyip Ünal</strong>
      <span>Einzelunternehmer</span>
      <span>
        Antonio-Segni-Str. 4<br />
        44263 Dortmund · Deutschland
      </span>
      <a href={contact.phoneHref}>+49 15563 084795</a>
      <a href={`mailto:${contact.email}`}>{contact.email}</a>
    </address>
  );
}

const imprintSections: LegalSection[] = [
  {
    id: "unternehmen",
    title: "Unternehmen & Kontakt",
    content: (
      <>
        <BusinessAddress />
        <p>
          Fachkraft für Arbeitssicherheit, Auditor für ISO 9001, ISO 14001 und
          ISO 45001, Qualitätsmanagementbeauftragter sowie Ausbilder für
          Gabelstapler, Flurförderzeuge und Krane.
        </p>
      </>
    ),
  },
  {
    id: "steuer",
    title: "Steuerliche Angaben",
    content: (
      <dl className="legal-facts">
        <div>
          <dt>Zuständiges Finanzamt</dt>
          <dd>Finanzamt Dortmund-Ost</dd>
        </div>
        <div>
          <dt>Steuernummer</dt>
          <dd>316/5312/5360</dd>
        </div>
      </dl>
    ),
  },
  {
    id: "beruf",
    title: "Berufsrechtliche Angaben",
    content: (
      <>
        <p>
          Die Berufsbezeichnung „Fachkraft für Arbeitssicherheit“ wurde in der
          Bundesrepublik Deutschland verliehen. Die berufsrechtlichen Regelungen
          sind im Arbeitssicherheitsgesetz (ASiG) geregelt.
        </p>
        <a
          href="https://www.gesetze-im-internet.de/asig/"
          target="_blank"
          rel="noreferrer"
        >
          Arbeitssicherheitsgesetz ansehen{" "}
          <ArrowUpRight size={14} aria-hidden="true" />
        </a>
      </>
    ),
  },
  {
    id: "redaktion",
    title: "Redaktionelle Verantwortung",
    content: (
      <p>
        Tayyip Ünal
        <br />
        Antonio-Segni-Str. 4, 44263 Dortmund
      </p>
    ),
  },
  {
    id: "haftung",
    title: "Inhalte & externe Links",
    content: (
      <>
        <h3>Verantwortung für Inhalte</h3>
        <p>
          Als Diensteanbieter bin ich für eigene Inhalte auf diesen Seiten nach
          den allgemeinen Gesetzen verantwortlich. Die Inhalte werden mit
          Sorgfalt erstellt. Sollten Sie auf einen Fehler oder eine mögliche
          Rechtsverletzung aufmerksam werden, kontaktieren Sie mich bitte.
        </p>
        <h3>Verlinkte Websites</h3>
        <p>
          Mein Angebot enthält Links zu externen Websites Dritter, auf deren
          Inhalte ich keinen Einfluss habe. Für die Inhalte der verlinkten
          Seiten ist stets der jeweilige Anbieter oder Betreiber verantwortlich.
        </p>
      </>
    ),
  },
  {
    id: "urheberrecht",
    title: "Urheberrecht",
    content: (
      <p>
        Die durch den Seitenbetreiber erstellten Inhalte und Werke auf diesen
        Seiten unterliegen dem deutschen Urheberrecht. Die Vervielfältigung,
        Bearbeitung, Verbreitung und jede Art der Verwertung außerhalb der
        Grenzen des Urheberrechts bedürfen der schriftlichen Zustimmung des
        jeweiligen Autors bzw. Erstellers.
      </p>
    ),
  },
];

const privacySections: LegalSection[] = [
  {
    id: "ueberblick",
    title: "Datenschutz auf einen Blick",
    content: (
      <>
        <p>
          Diese Hinweise erläutern, wie personenbezogene Daten beim Besuch
          dieser Website und bei einer Kontaktaufnahme verarbeitet werden.
          Personenbezogene Daten sind Informationen, mit denen Sie persönlich
          identifiziert werden können.
        </p>
        <p>
          Die Website informiert über unsere Leistungen. Sie können uns über die
          Anfrageformulare, per E-Mail oder telefonisch erreichen.
        </p>
      </>
    ),
  },
  {
    id: "verantwortlich",
    title: "Verantwortliche Stelle",
    content: (
      <>
        <p>Verantwortlich für die Datenverarbeitung auf dieser Website ist:</p>
        <BusinessAddress />
        <p>
          Bei Fragen zum Datenschutz und zur Ausübung Ihrer Rechte erreichen Sie
          uns über die oben genannten Kontaktdaten.
        </p>
      </>
    ),
  },
  {
    id: "hosting",
    title: "Hosting & Server-Protokolle",
    content: (
      <>
        <p>
          Diese Website wird bei ALL-INKL.COM – Neue Medien Münnich, Inhaber
          René Münnich, Hauptstraße 68, 02742 Friedersdorf, gehostet.
        </p>
        <p>
          Beim Abruf der Website verarbeitet der Hosting-Anbieter technische
          Informationen, die Ihr Browser übermittelt. Dazu gehören IP-Adresse,
          Browsertyp und -version, Betriebssystem, aufgerufene Adresse,
          Referrer-URL sowie Zeitpunkt der Anfrage. Diese Daten dienen der
          Bereitstellung, Stabilität, Sicherheit und Fehleranalyse der Website.
        </p>
        <p>
          Die Verarbeitung erfolgt aufgrund unseres berechtigten Interesses an
          einer sicheren und zuverlässigen Bereitstellung des Online-Angebots
          gemäß Art. 6 Abs. 1 lit. f DSGVO.
        </p>
        <a
          href="https://all-inkl.com/datenschutzinformationen"
          target="_blank"
          rel="noreferrer"
        >
          Datenschutzinformationen des Hosting-Anbieters{" "}
          <ArrowUpRight size={14} aria-hidden="true" />
        </a>
      </>
    ),
  },
  {
    id: "anfragen",
    title: "Kontakt-, Angebots- & Schulungsanfragen",
    content: (
      <>
        <p>
          Wenn Sie uns über ein Anfrageformular, per E-Mail oder Telefon
          kontaktieren, verarbeiten wir Ihre Kontaktdaten und den Inhalt Ihrer
          Anfrage zur Bearbeitung und für mögliche Rückfragen. Bei
          vertragsbezogenen Anfragen beruht dies auf Art. 6 Abs. 1 lit. b DSGVO;
          bei anderen Anliegen auf unserem berechtigten Interesse an der
          Beantwortung gemäß Art. 6 Abs. 1 lit. f DSGVO.
        </p>
        <p>
          Nach dem Absenden eines Formulars werden Name, E-Mail-Adresse, Thema,
          Nachricht und freiwillige Angaben wie Unternehmen oder Telefonnummer
          verschlüsselt an unseren Webserver übertragen und per E-Mail an
          info@tayyipuenal.de weitergeleitet. Beim Angebots-Konfigurator gehören
          dazu zusätzlich Ihre Auswahl zu Norm, Ausgangslage, Unternehmensgröße
          und Zeitrahmen sowie eine optionale Anmerkung. Formularinhalte werden vom
          Versand-Endpunkt nicht zusätzlich in einer Datenbank gespeichert.
        </p>
        <p>
          Zum Schutz vor Missbrauch und Doppelversand werden pseudonymisierte
          IP-Kennungen, Anfragekennungen und Versandstatus bis zu einer Stunde
          technisch berücksichtigt. Es erfolgt keine Nutzung für Werbung. Eine
          Newsletter-Anmeldung wird nicht angeboten.
        </p>
      </>
    ),
  },
  {
    id: "cookies",
    title: "Cookies, Schriften & externe Dienste",
    content: (
      <>
        <p>
          Die Website selbst setzt keine Analyse- oder Marketing-Cookies ein und
          verwendet keine Tracking-Pixel. Die Schrittanzeige des Schulungswegs
          speichert keine Angaben in Cookies oder im dauerhaften
          Browserspeicher.
        </p>
        <p>
          Schriften, Bilder und das Prozessvideo werden vom eigenen Webserver
          geladen. Es erfolgt kein Abruf von Google Fonts beim Seitenbesuch.
        </p>
        <p>
          LinkedIn, ProvenExpert und Google Maps sind als externe Links
          eingebunden. Erst wenn Sie einen solchen Link öffnen, verbinden
          Sie sich mit dem jeweiligen Anbieter; dort gelten dessen
          Datenschutzinformationen. Social-Media-Feeds und Karten sind auf
          dieser Website nicht eingebettet.
        </p>
      </>
    ),
  },
  {
    id: "speicherung",
    title: "Speicherung & Weitergabe",
    content: (
      <>
        <p>
          Personenbezogene Daten werden nur so lange verarbeitet, wie dies für
          den jeweiligen Zweck erforderlich ist oder gesetzliche
          Aufbewahrungspflichten bestehen. Entfällt der Zweck und bestehen keine
          Aufbewahrungspflichten, werden die Daten gelöscht.
        </p>
        <p>
          Eine Weitergabe erfolgt nur, soweit sie zur Bearbeitung Ihrer Anfrage
          oder zur Leistungserbringung erforderlich ist, eine gesetzliche
          Pflicht besteht oder Sie eingewilligt haben. Technische Dienstleister
          können Daten im Rahmen der Bereitstellung von Hosting und
          Kommunikation verarbeiten.
        </p>
      </>
    ),
  },
  {
    id: "rechte",
    title: "Ihre Rechte",
    content: (
      <>
        <p>
          Unter den gesetzlichen Voraussetzungen stehen Ihnen insbesondere
          folgende Rechte zu:
        </p>
        <ul>
          <li>Auskunft über Ihre gespeicherten personenbezogenen Daten.</li>
          <li>Berichtigung unrichtiger oder unvollständiger Daten.</li>
          <li>Löschung oder Einschränkung der Verarbeitung.</li>
          <li>
            Erhalt Ihrer Daten in einem übertragbaren, maschinenlesbaren Format.
          </li>
          <li>
            Widerspruch gegen eine Verarbeitung auf Grundlage berechtigter
            Interessen aus Gründen Ihrer besonderen Situation.
          </li>
          <li>Widerruf einer erteilten Einwilligung für die Zukunft.</li>
        </ul>
        <p>
          Sie können sich außerdem bei einer Datenschutzaufsichtsbehörde
          beschweren, insbesondere am Ort Ihres gewöhnlichen Aufenthalts, Ihres
          Arbeitsplatzes oder des vermuteten Verstoßes. In Nordrhein-Westfalen
          ist dies die{" "}
          <a href="https://www.ldi.nrw.de/" target="_blank" rel="noreferrer">
            Landesbeauftragte für Datenschutz und Informationsfreiheit
            Nordrhein-Westfalen
          </a>
          .
        </p>
      </>
    ),
  },
  {
    id: "verschluesselung",
    title: "Sichere Übertragung",
    content: (
      <p>
        Diese Website verwendet HTTPS mit SSL-/TLS-Verschlüsselung, um die
        Datenübertragung zwischen Ihrem Browser und unserem Webserver zu
        schützen. Sie erkennen die verschlüsselte Verbindung an „https://“ in
        der Adresszeile Ihres Browsers.
      </p>
    ),
  },
];

export function LegalPage({ kind }: { kind: "privacy" | "imprint" }) {
  const privacy = kind === "privacy";
  const title = privacy ? "Datenschutzerklärung" : "Impressum";
  const sections = privacy ? privacySections : imprintSections;


  return (
    <div className="legal-page">
      <div className="legal-heading">
        <a className="legal-back" href="/">
          <ArrowLeft size={16} aria-hidden="true" /> Zurück zur Startseite
        </a>
        <p className="legal-kicker">Tayyip Ünal · Rechtliche Informationen</p>
        <h1>{title}</h1>
        <p className="legal-intro">
          {privacy
            ? "Wie wir mit Ihren Daten umgehen — verständlich und transparent."
            : "Die Angaben zu Ihrem Ansprechpartner — direkt und übersichtlich."}
        </p>
        <span className="legal-version">
          {privacy ? (
            "Stand: September 2026 · Informationen gemäß DSGVO und BDSG"
          ) : (
            <>
              Angaben gemäß{" "}
              <a
                href="https://www.gesetze-im-internet.de/ddg/__5.html"
                target="_blank"
                rel="noreferrer"
              >
                § 5 DDG
              </a>
            </>
          )}
        </span>
      </div>
      <div className="legal-layout">
        <aside className="legal-sidebar">
          <nav aria-label="Inhaltsverzeichnis">
            <p>Auf dieser Seite</p>
            <ol>
              {sections.map((section) => (
                <li key={section.id}>
                  <a href={`#${section.id}`}>{section.title}</a>
                </li>
              ))}
            </ol>
          </nav>
          <a
            className="legal-other"
            href={privacy ? "/impressum/" : "/datenschutz/"}
          >
            {privacy ? "Zum Impressum" : "Zum Datenschutz"}{" "}
            <ArrowUpRight size={15} aria-hidden="true" />
          </a>
        </aside>
        <article className="legal-article" aria-label={title}>
          {sections.map((section, index) => (
            <section
              id={section.id}
              key={section.id}
              className="legal-section"
              aria-labelledby={`${section.id}-title`}
            >
              <span className="legal-number" aria-hidden="true">
                {String(index + 1).padStart(2, "0")}
              </span>
              <h2 id={`${section.id}-title`}>{section.title}</h2>
              <div className="legal-copy">{section.content}</div>
            </section>
          ))}
          <div className="legal-question">
            <h2>Noch eine Frage?</h2>
            <p>Schreiben Sie uns. Wir helfen Ihnen gerne weiter.</p>
            <a href={`mailto:${contact.email}`}>
              {contact.email} <ArrowUpRight size={16} aria-hidden="true" />
            </a>
          </div>
        </article>
      </div>
    </div>
  );
}
