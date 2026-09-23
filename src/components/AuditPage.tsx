import { ArrowLeft, ArrowUpRight, Check } from "lucide-react";
import { audits, type Audit } from "../audits";
import { InquiryForm } from "./InquiryForm";

export function AuditPage({ audit }: { audit: Audit }) {
  return (
    <div className="audit-detail">
      <nav className="breadcrumbs" aria-label="Brotkrumennavigation">
        <a href="/">Startseite</a>
        <span>/</span>
        <a href="/#audits">Audit & Zertifizierung</a>
        <span>/</span>
        <span aria-current="page">{audit.standard}</span>
      </nav>
      <header className="audit-detail-hero">
        <p className="section-kicker">
          {audit.standard} · {audit.eyebrow}
        </p>
        <h1>{audit.heading}</h1>
        <p>{audit.intro}</p>
        <nav className="audit-section-links" aria-label="Seitenabschnitte">
          <a href="#leistungen">Leistungsumfang</a>
          <a href="#ablauf">Ablauf</a>
          <a href="#anfrage">
            Angebot anfragen <ArrowUpRight size={14} aria-hidden="true" />
          </a>
          <a href={`/?norm=${audit.slug}#angebot`}>
            Angebot online konfigurieren
          </a>
        </nav>
      </header>
      <div className="audit-detail-grid">
        <article>
          <section id="leistungen">
            <span className="detail-index">01 · Ihr Vorhaben</span>
            <h2>Passend zu Ihrem Betrieb.</h2>
            <p>{audit.audience}</p>
            <ul className="audit-checks">
              {audit.scope.map((item) => (
                <li key={item}>
                  <Check size={17} aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
          </section>
          <section id="ablauf">
            <span className="detail-index">02 · Unser Ablauf</span>
            <h2>Ein klarer Weg zum Audit.</h2>
            <ol className="audit-steps">
              <li>
                <strong>Verstehen</strong>
                <p>
                  Im Erstgespräch klären wir Ausgangslage, Ziele und gewünschte
                  Termine.
                </p>
              </li>
              <li>
                <strong>Vorbereiten</strong>
                <p>
                  Wir sichten Ihre Unterlagen, priorisieren Maßnahmen und
                  begleiten die Umsetzung.
                </p>
              </li>
              <li>
                <strong>Begleiten</strong>
                <p>
                  Wir bereiten Ihr Team auf das Audit vor und stimmen die
                  nächsten Schritte mit Ihnen ab.
                </p>
              </li>
            </ol>
            <p className="audit-scope-note">
              Die Zertifizierungsentscheidung trifft eine unabhängige
              Zertifizierungsstelle. Unser Schwerpunkt ist Ihre Beratung und
              Vorbereitung.
            </p>
          </section>
          <section>
            <span className="detail-index">03 · Gut vorbereitet</span>
            <h2>Diese Unterlagen helfen.</h2>
            <ul className="document-list">
              {audit.documents.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <p>
              Unvollständige Unterlagen sind kein Hindernis für ein
              Erstgespräch. Wir klären gemeinsam, was noch benötigt wird.
            </p>
          </section>
          <section>
            <span className="detail-index">04 · Ihr Ergebnis</span>
            <h2>Orientierung für den nächsten Schritt.</h2>
            <p>{audit.result}</p>
          </section>
          <section className="audit-faq">
            <h2>Häufige Fragen</h2>
            <details>
              <summary>{audit.faq}</summary>
              <p>{audit.answer}</p>
            </details>
            <details>
              <summary>Wie werden Aufwand und Kosten festgelegt?</summary>
              <p>
                Nach der Bestandsaufnahme erhalten Sie ein individuelles
                Angebot. Maßgeblich sind unter anderem Größe, Standorte und der
                bisherige Dokumentationsstand Ihres Unternehmens.
              </p>
            </details>
          </section>
        </article>
        <aside id="anfrage" className="audit-inquiry">
          <p className="section-kicker">Ihr nächster Schritt</p>
          <h2>{audit.standard} anfragen.</h2>
          <InquiryForm topic={audit.standard} />
        </aside>
      </div>
      <nav className="related-audits" aria-label="Weitere Audit-Leistungen">
        <a className="back-audits" href="/#audits">
          <ArrowLeft size={16} aria-hidden="true" /> Alle Audit-Leistungen
        </a>
        <h2>Weitere Managementsysteme</h2>
        <div>
          {audits
            .filter((item) => item.slug !== audit.slug)
            .map((item) => (
              <a key={item.slug} href={item.path}>
                <span>{item.standard}</span>
                {item.eyebrow}
                <ArrowUpRight size={17} aria-hidden="true" />
              </a>
            ))}
        </div>
        <a className="related-training" href="/#schulungen">
          SCC-Schulungen nach Dok. 017 und Dok. 018 für Ihr Team →
        </a>
      </nav>
    </div>
  );
}
