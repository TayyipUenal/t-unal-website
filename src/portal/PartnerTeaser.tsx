import { ArrowUpRight } from "lucide-react";
import { Kicker, Rise, Wipe } from "../components/motion";

/** Home page invitation to the partner programme. */
export function PartnerTeaser() {
  return (
    <section id="partner" className="pj" aria-labelledby="pj-title">
      <div className="pj-inner">
        <div>
          <Kicker light>Partnerprogramm</Kicker>
          <Wipe>
            <h2 id="pj-title">
              Werden Sie <em>Partner.</em>
            </h2>
          </Wipe>
          <Rise delay={0.08}>
            <p>
              Sie kennen Betriebe, die Audit, Zertifizierung oder Schulung brauchen? Empfehlen Sie Tayyip Ünal, sehen Sie
              in Ihrem eigenen Portal, wo jeder Kunde steht, und verdienen Sie mit.
            </p>
          </Rise>
          <div className="pj-actions">
            <a className="button button-primary" href="/partner-werden" target="_blank" rel="noopener">
              Jetzt Partner werden <ArrowUpRight size={17} aria-hidden="true" />
            </a>
            <a className="text-link" href="/portal" target="_blank" rel="noopener">
              Zum Partner-Login
            </a>
          </div>
        </div>
        <ul className="pj-facts">
          <li>
            <b>Eigenes Portal</b>
            <span>Alle Kunden mit aktuellem Stand</span>
          </li>
          <li>
            <b>Ihr Anteil sichtbar</b>
            <span>Prozentsatz und Provision je Auftrag</span>
          </li>
          <li>
            <b>Eigene Partnerseite</b>
            <span>Mit Ihrem Namen und Empfehlungslink</span>
          </li>
        </ul>
      </div>
    </section>
  );
}
