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
          Anfrageformulare, per E-Mail oder telefonisch erreichen. Für
          Vertriebspartner betreiben wir zusätzlich ein geschütztes
          Partnerportal.
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
    title: "Hosting, Datenbank & Server-Protokolle",
    content: (
      <>
        <p>
          Diese Website und das Partnerportal werden bei Cloudflare betrieben
          (Cloudflare, Inc., 101 Townsend St., San Francisco, CA 94107, USA).
          Cloudflare stellt die Seiten über sein weltweites Netz bereit und
          speichert die Daten aus Formularen und dem Partnerportal in einer
          Datenbank (Cloudflare D1).
        </p>
        <p>
          Beim Abruf der Website verarbeitet Cloudflare technische
          Informationen, die Ihr Browser übermittelt, insbesondere IP-Adresse,
          Browsertyp, Betriebssystem, aufgerufene Adresse, Referrer-URL sowie
          Zeitpunkt der Anfrage. Diese Daten dienen der Bereitstellung,
          Stabilität, Sicherheit und Abwehr von Angriffen. Rechtsgrundlage ist
          unser berechtigtes Interesse an einem sicheren und zuverlässigen
          Online-Angebot gemäß Art. 6 Abs. 1 lit. f DSGVO.
        </p>
        <p>
          Mit Cloudflare besteht ein Vertrag zur Auftragsverarbeitung nach Art.
          28 DSGVO. Soweit Daten in die USA übermittelt werden, erfolgt dies auf
          Grundlage des EU-US Data Privacy Framework, unter dem Cloudflare
          zertifiziert ist, sowie ergänzend der EU-Standardvertragsklauseln.
        </p>
        <a
          href="https://www.cloudflare.com/de-de/privacypolicy/"
          target="_blank"
          rel="noreferrer"
        >
          Datenschutzinformationen von Cloudflare{" "}
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
          verschlüsselt übertragen und in unserer Datenbank gespeichert. Beim
          Angebots-Konfigurator gehören dazu zusätzlich Ihre Auswahl zu Norm,
          Ausgangslage, Unternehmensgröße und Zeitrahmen sowie eine optionale
          Anmerkung. Über eine neue Anfrage werden wir zusätzlich per E-Mail
          benachrichtigt.
        </p>
        <p>
          Zum Schutz vor Missbrauch und Doppelversand speichern wir eine aus
          Ihrer IP-Adresse gebildete Kennung zusammen mit einem Zähler für
          höchstens wenige Stunden. Ein unsichtbares Feld im Formular hilft,
          automatisierte Einsendungen zu erkennen. Es erfolgt keine Nutzung für
          Werbung. Eine Newsletter-Anmeldung wird nicht angeboten.
        </p>
      </>
    ),
  },
  {
    id: "partner",
    title: "Partnerprogramm",
    content: (
      <>
        <h3>Bewerbung und Partnerportal</h3>
        <p>
          Wenn Sie sich als Partner bewerben, verarbeiten wir Name,
          E-Mail-Adresse, Unternehmen, Telefonnummer und Ihre Nachricht, um die
          Bewerbung zu prüfen. Nach der Freigabe erhalten Sie einen Zugang zum
          Partnerportal. Dafür speichern wir zusätzlich Ihr Passwort
          ausschließlich als verschlüsselten Hash, Ihren Prozentsatz, den Text
          die Ihnen zugeordneten Kunden, Provisionen
          und Auszahlungen. Rechtsgrundlage ist die Anbahnung und Durchführung
          der Partnerschaft gemäß Art. 6 Abs. 1 lit. b DSGVO.
        </p>
        <h3>Vermittlung durch einen Partner</h3>
        <p>
          Wenn ein Partner Sie an uns vermittelt, etwa indem er gemeinsam mit
          Ihnen einen Antrag ausfüllt, wird Ihre Anfrage dem jeweiligen Partner
          zugeordnet, damit seine Vermittlung nachvollzogen und eine Provision
          abgerechnet werden kann. Der Partner sieht in seinem Portal
          Ihren Namen bzw. Ihr Unternehmen, das angefragte Thema, den Stand der
          Bearbeitung und gegebenenfalls den Auftragswert. Ihre Kontaktdaten sieht
          er nur, soweit wir ihm dies freigegeben haben. Rechtsgrundlage ist
          unser berechtigtes Interesse an einer fairen Abrechnung mit unseren
          Partnern gemäß Art. 6 Abs. 1 lit. f DSGVO.
        </p>
        <p>
          Hat ein Partner Sie an uns vermittelt, ordnen wir auch spätere
          Angebote und Aufträge für Sie diesem Partner zu, damit dieser seine
          Provision erhält. Für die Grundbetreuung in der Arbeitssicherheit wird
          keine Provision gezahlt.
        </p>
        <h3>Speicherdauer</h3>
        <p>
          Partnerdaten speichern wir für die Dauer der Partnerschaft.
          Unterlagen zu Provisionen und Auszahlungen bewahren wir anschließend
          entsprechend den steuer- und handelsrechtlichen Fristen auf (in der
          Regel bis zu zehn Jahre).
        </p>
      </>
    ),
  },
  {
    id: "email",
    title: "E-Mail-Versand",
    content: (
      <>
        <p>
          Einladungen zum Partnerportal und unsere Benachrichtigungen über neue
          Anfragen versenden wir über den Dienst Resend (Resend, Inc., 2261
          Market Street #5039, San Francisco, CA 94114, USA). Dabei werden
          Empfängeradresse, Betreff und Inhalt der jeweiligen E-Mail sowie
          technische Zustelldaten verarbeitet. Rechtsgrundlage ist Art. 6 Abs. 1
          lit. b DSGVO, für Benachrichtigungen an uns Art. 6 Abs. 1 lit. f DSGVO.
          Die Übermittlung in die USA erfolgt auf Grundlage der
          EU-Standardvertragsklauseln.
        </p>
        <p>
          Unsere Postfächer werden bei Microsoft 365 (Microsoft Ireland
          Operations Limited, One Microsoft Place, South County Business Park,
          Leopardstown, Dublin 18, Irland) betrieben.
        </p>
      </>
    ),
  },
  {
    id: "cookies",
    title: "Cookies, Browserspeicher & externe Dienste",
    content: (
      <>
        <p>
          Die Website setzt keine Analyse- oder Marketing-Cookies ein und
          verwendet keine Tracking-Pixel.
        </p>
        <p>
          Wenn Sie sich im Partnerportal anmelden, setzen wir ein technisch
          notwendiges Sitzungs-Cookie („tu_session“), damit Sie angemeldet
          bleiben. Es enthält nur eine zufällige Kennung, ist für Skripte nicht
          lesbar und läuft spätestens nach 14 Tagen oder beim Abmelden ab.
          Rechtsgrundlage ist § 25 Abs. 2 Nr. 2 TDDDG.
        </p>
        <p>
          Ihre Wahl zwischen heller und dunkler Darstellung speichern wir
          ausschließlich in Ihrem Browser (Local Storage, Eintrag „tu-theme“).
          Diese Angabe wird nicht an uns übertragen.
        </p>
        <p>
          Schriften, Bilder und Videos werden von unserem eigenen Angebot
          geladen. Es erfolgt kein Abruf von Google Fonts beim Seitenbesuch.
        </p>
        <p>
          WhatsApp, LinkedIn, ProvenExpert und Google Maps sind nur als externe
          Links eingebunden. Erst wenn Sie einen solchen Link öffnen, verbinden
          Sie sich mit dem jeweiligen Anbieter; dort gelten dessen
          Datenschutzinformationen.
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
          Pflicht besteht oder Sie eingewilligt haben. Empfänger sind die oben
          genannten technischen Dienstleister (Cloudflare, Resend, Microsoft)
          sowie, bei Vermittlung durch einen Partner, der jeweilige Partner im
          beschriebenen Umfang. Bei der Durchführung von Audits, Zertifizierungen
          und Schulungen arbeiten wir mit den jeweils beauftragten
          Gesellschaften zusammen.
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
        Datenübertragung zwischen Ihrem Browser und unseren Servern zu
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
            "Stand: Oktober 2026 · Informationen gemäß DSGVO und BDSG"
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
