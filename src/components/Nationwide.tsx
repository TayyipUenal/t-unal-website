import { useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { currentTheme } from "../theme";
import { Kicker, Rise, Stagger, StaggerItem, Wipe } from "./motion";

const areas = [
  {
    no: "01",
    title: "Arbeitsschutz und Gesundheit",
    lead: "Für sichere, gesunde und rechtskonforme Betriebe.",
    items: [
      "Arbeitssicherheit, Sicherheitstechnische Betreuung, Brandschutz",
      "Arbeitsmittelprüfung, Prüfung und Dokumentation von Arbeitsmitteln",
      "Arbeitsmedizin: Betriebsärztliche Betreuung, Vorsorge, Erste Hilfe",
      "Baustellen und Projekte: SiGeKo nach BaustellV, HSE Officer",
      "Managementsysteme: Aufbau und Pflege ISO 9001, 14001, 45001, 27001, SCC",
    ],
  },
  {
    no: "02",
    title: "Schulung und Prüfung",
    lead: "Qualifizierte Mitarbeitende, nachweisbar geprüft.",
    items: [
      "Akademie: Firmen- und Einzelschulungen, Ausbildungen, präsent oder online",
      "Digitale Unterweisungen: Dokumente und Nachweise auf einer Plattform",
      "SCC Personenprüfungen: Dok. 017 Führungskräfte, Dok. 018 Mitarbeitende",
      "Personenzertifizierung inklusive Auditoren-Qualifizierung",
      "Zertifikats-Validierung: Echtheitsprüfung per QR-Code",
    ],
  },
  {
    no: "03",
    title: "Audit und Zertifizierung",
    lead: "Unabhängige Audits für anspruchsvolle Unternehmen.",
    items: [
      "ISO 9001, 14001, 45001: Qualität, Umwelt, Arbeitsschutz",
      "ISO 27001, 50001: Informationssicherheit, Energie",
      "ISO 3834, 13485, 22000, 20000: Schweißen, Medizin, Lebensmittel, IT",
      "SCC*, SCC**, SCCP, SCP: Sicherheits-Zertifizierung für Kontraktoren",
      "Kompletter Auditzyklus vom Pre-Audit bis zur Rezertifizierung, weltweit auch auf Englisch",
    ],
  },
];

const stats = [
  { value: "15+", label: "Jahre Erfahrung", detail: "in Audit und Zertifizierung" },
  { value: "20+", label: "ISO-Standards", detail: "und Regelwerke" },
  { value: "48 h", label: "bis zum Festpreisangebot", detail: "nach dem Erstgespräch" },
  { value: "6", label: "Fachbereiche", detail: "für sichere, gesunde Betriebe" },
];

const steps = [
  { no: "01", title: "Beraten und Aufbauen", text: "Kostenfreies Erstgespräch, Bedarfsanalyse, Aufbau Ihres Managementsystems." },
  { no: "02", title: "Schulen und Qualifizieren", text: "Unterweisungen, Seminare und Ausbildungen, präsent oder online." },
  { no: "03", title: "Prüfen und Auditieren", text: "SCC Personenprüfungen, Pre-Audit und Stufen-Audits." },
  { no: "04", title: "Zertifizieren und Begleiten", text: "Zertifikat sowie Überwachungs- und Rezertifizierungsaudits." },
];

/** Germany-wide map in 3D, the three fields of work, key figures and the four-step path. */
export function Nationwide() {
  const reduced = useReducedMotion();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [active, setActive] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let running: { stop: () => void; setTheme: (dark: boolean) => void } | null = null;
    const onTheme = (event: Event) => running?.setTheme((event as CustomEvent<string>).detail === "dark");
    import("../germany-scene")
      .then(({ startGermanyScene }) => {
        if (cancelled || !canvas.current) return;
        try {
          running = startGermanyScene(canvas.current, { still: Boolean(reduced), dark: currentTheme() === "dark" });
          canvas.current.classList.add("is-live");
        } catch {
          /* no WebGL: the section works without the map */
        }
      })
      .catch(() => {});
    window.addEventListener("themechange", onTheme);
    return () => {
      cancelled = true;
      window.removeEventListener("themechange", onTheme);
      running?.stop();
    };
  }, [reduced]);

  const area = areas[active];
  return (
    <section id="bundesweit" className="nw" aria-labelledby="nw-title">
      <div className="nw-inner">
        <header className="nw-head">
          <div>
            <Kicker>Bundesweit aktiv</Kicker>
            <Wipe>
              <h2 id="nw-title">Alles aus einer Hand. Überall in Deutschland.</h2>
            </Wipe>
          </div>
          <Rise delay={0.08}>
            <p>
              Statt vieler Dienstleister ein Ansprechpartner für alles: Wir bauen Ihre Systeme auf, qualifizieren Ihre
              Mitarbeitenden, prüfen und auditieren unabhängig und begleiten Sie über den gesamten Zertifizierungszyklus.
            </p>
          </Rise>
        </header>

        <div className="nw-stage">
          <div className="nw-map">
            <canvas ref={canvas} className="nw-canvas" aria-hidden="true" />
            <p className="nw-caption">
              <span aria-hidden="true" /> Dortmund, bundesweit im Einsatz
            </p>
          </div>

          <div className="nw-areas">
            <div className="nw-tabs" role="tablist" aria-label="Fachbereiche">
              {areas.map((item, index) => (
                <button
                  key={item.no}
                  type="button"
                  role="tab"
                  aria-selected={active === index}
                  className={active === index ? "is-on" : undefined}
                  onClick={() => setActive(index)}
                >
                  <span>{item.no}</span>
                  {item.title}
                </button>
              ))}
            </div>
            <div className="nw-panel" key={active} role="tabpanel">
              <p className="nw-lead">{area.lead}</p>
              <ul>
                {area.items.map((entry) => (
                  <li key={entry}>{entry}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <Stagger className="nw-stats">
          {stats.map((stat) => (
            <StaggerItem className="nw-stat" key={stat.label}>
              <strong>{stat.value}</strong>
              <span>{stat.label}</span>
              <small>{stat.detail}</small>
            </StaggerItem>
          ))}
        </Stagger>

        <div className="nw-path">
          <p className="nw-path-title">Vom ersten Gespräch bis zum Zertifikat</p>
          <ol>
            {steps.map((step) => (
              <li key={step.no}>
                <span>{step.no}</span>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
