import { ArrowDown, ArrowRight, ClipboardCheck, GraduationCap, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { Kicker, Rise, Stagger, StaggerItem, Wipe } from "./motion";

const services = [
  {
    icon: ClipboardCheck,
    title: "Audit und Zertifizierung",
    text: "ISO 9001, 14001 und 45001: Ist-Analyse, Systemaufbau und Begleitung bis zum Zertifizierungsaudit.",
    href: "#audits",
  },
  {
    icon: GraduationCap,
    title: "SCC-Schulung",
    text: "Schulung und Prüfungsvorbereitung nach SCC Dok. 017 und 018, bei Ihnen vor Ort.",
    href: "#schulungen",
  },
  {
    icon: ShieldCheck,
    title: "Arbeitssicherheit und Beratung",
    text: "Gefährdungsbeurteilung, Unterweisungen und Managementsysteme, die im Alltag tragen.",
    href: "#ablauf",
  },
];

/** Three ways in. The cards turn light on hover. */
export function Services() {
  return (
    <section id="leistungen" className="sv" aria-labelledby="sv-title">
      <div className="sv-inner">
        <header className="sv-head">
          <div>
            <Kicker>Leistungen</Kicker>
            <Wipe>
              <h2 id="sv-title">Drei Wege zu einem prüfsicheren Betrieb.</h2>
            </Wipe>
          </div>
          <Rise delay={0.08}>
            <p>
              Audit, Schulung oder Beratung: Sie wählen den Einstieg, wir sorgen für das dokumentierte Ergebnis.
            </p>
          </Rise>
        </header>
        <Stagger className="sv-grid">
          {services.map(({ icon: Icon, title, text, href }) => (
            <StaggerItem className="sv-slot" key={title}>
              <a className="sv-card" href={href}>
                <Icon size={58} strokeWidth={1.1} aria-hidden="true" />
                <h3>{title}</h3>
                <p>{text}</p>
                <ArrowRight size={24} aria-hidden="true" />
              </a>
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </section>
  );
}

/** One line of positioning on a light band. */
export function Statement() {
  return (
    <section className="st" aria-labelledby="st-title">
      <Wipe>
        <h2 id="st-title">Unternehmer. Auditor. Ausbilder.</h2>
      </Wipe>
      <Rise delay={0.1}>
        <p>
          Wer Vertrauen auslösen will, braucht Struktur, Nachweise und Verantwortung. Darum
          begleiten wir Betriebe, bis das System trägt und das Zertifikat auf dem Tisch liegt.
        </p>
      </Rise>
      <a className="st-arrow" href="#audits" aria-label="Zum Angebot">
        <ArrowDown size={28} aria-hidden="true" />
      </a>
    </section>
  );
}

const facts = [
  { value: "3", label: "Normen", detail: "ISO 9001, 14001 und 45001" },
  { value: "SCC", label: "Dok. 017 und 018", detail: "Schulung bei Ihnen vor Ort" },
  { value: "0 €", label: "Erstgespräch", detail: "Kostenfrei und unverbindlich" },
];

/** Portrait and the three things a visitor should remember. */
export function Specialty() {
  const [photo, setPhoto] = useState(false);
  useEffect(() => {
    const image = new Image();
    image.onload = () => setPhoto(true);
    image.src = "/photos/portrait.jpg";
  }, []);

  return (
    <section id="profil" className="sp" aria-labelledby="sp-title">
      <div className="sp-inner">
        <Rise className="sp-portrait" scale distance={18}>
          {photo ? (
            <img src="/photos/portrait.jpg" alt="Tayyip Ünal" />
          ) : (
            <div className="sp-mono" aria-hidden="true">
              TÜ
            </div>
          )}
        </Rise>
        <div className="sp-copy">
          <Kicker>Spezialisierung</Kicker>
          <Wipe>
            <h2 id="sp-title">Mehr Sicherheit. Mehr Substanz.</h2>
          </Wipe>
          <Rise delay={0.08}>
            <p>
              Tayyip Ünal begleitet Unternehmen in Audits, Arbeitssicherheit und Qualitätsmanagement.
              Als Unternehmer kennt er beide Seiten: Er weiß, was ein Betrieb leisten kann und was ein
              Auditor sehen will.
            </p>
          </Rise>
          <Stagger className="sp-facts">
            {facts.map((fact) => (
              <StaggerItem className="sp-fact" key={fact.label}>
                <strong>{fact.value}</strong>
                <span>{fact.label}</span>
                <small>{fact.detail}</small>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </div>
    </section>
  );
}
