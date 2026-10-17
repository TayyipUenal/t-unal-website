import { Kicker, Rise, Stagger, StaggerItem, Wipe } from "./motion";

type Reference = {
  name: string;
  /** Logo file in /public/references; companies without one show their name as a wordmark. */
  logo?: string;
  /** Background of the logo tile, chosen so the logo stays readable in both themes. */
  tile: "light" | "dark" | "black";
};

const references: Reference[] = [
  { name: "H.A.K. GmbH", tile: "light" },
  { name: "Hora Service & Security GmbH", logo: "/references/hora-service-security.png", tile: "light" },
  { name: "L.I.S. GmbH Light Industrial Service", tile: "light" },
  { name: "Herdem GmbH", tile: "light" },
  { name: "Kasaliew Sicherheitsdienst UG", logo: "/references/kasaliew-sicherheitsdienst.png", tile: "dark" },
  { name: "DKM Security UG", logo: "/references/dkm-security.jpg", tile: "black" },
  { name: "MDC-GmbH", tile: "light" },
];

/** Initials for the wordmark tile: "Herdem GmbH" becomes "H". */
function monogram(name: string) {
  return name.replace(/[^A-Za-zÄÖÜ]/g, "").charAt(0).toUpperCase();
}

/** Reference customers. Logos belong to the named companies. */
export function References() {
  return (
    <section id="referenzen" className="ref-section" aria-labelledby="ref-title">
      <div className="ref-inner">
        <header className="ref-head">
          <Kicker>Referenzen</Kicker>
          <Wipe>
            <h2 id="ref-title">Unternehmen, die uns vertrauen.</h2>
          </Wipe>
          <Rise delay={0.08}>
            <p>Betriebe aus Sicherheit und Service, die Audit, Beratung und Zertifizierung mit uns gegangen sind.</p>
          </Rise>
        </header>

        <Stagger className="ref-grid">
          {references.map((reference) => (
            <StaggerItem className={`ref-card tile-${reference.tile}`} key={reference.name}>
              <div className="ref-logo">
                {reference.logo ? (
                  <img src={reference.logo} alt={`Logo ${reference.name}`} loading="lazy" decoding="async" />
                ) : (
                  <span className="ref-mono" aria-hidden="true">
                    {monogram(reference.name)}
                  </span>
                )}
              </div>
              <strong>{reference.name}</strong>
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </section>
  );
}
