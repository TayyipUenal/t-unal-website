import { motion, useScroll } from "framer-motion";
import { ArrowDown, ArrowUpRight, CalendarDays, Info, Phone } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { appointmentPreset, sccQuotePreset, type ConsultationPreset } from "../consultation";
import { contact } from "../content";
import { useScrollCopy } from "../hooks";
import { watchVisibility } from "../reveal";
import { DrawIcon, type DrawIconName } from "./DrawIcon";
import { Kicker, Rise, Wipe } from "./motion";

/**
 * "02 · SCC-Schulung & Zertifizierung": a scroll timeline of four stage cards
 * (choose, learn, exam, certificate) that ends in the two actions.
 *
 * Exam facts as published by accredited SCC certification bodies and the
 * programme owner VAZ e.V. (checked 2026-09-23): Dok. 017 for operative
 * managers, 70 questions in 105 minutes; Dok. 018 for operative employees,
 * 40 questions in 60 minutes; four answers per question, one correct; pass
 * mark 70 %; certificates valid five years; SCC 2011 certificates are no
 * longer accepted from 01.11.2026.
 */
const courses = [
  {
    doc: "Dok. 017",
    role: "Operative Führungskräfte",
    text: "Für alle, die Arbeiten vor Ort leiten oder beaufsichtigen.",
    exam: "70 Fragen · 105 Minuten",
  },
  {
    doc: "Dok. 018",
    role: "Operativ tätige Mitarbeitende",
    text: "Für Beschäftigte von Dienstleistern, die in Anlagen von Auftraggebern arbeiten.",
    exam: "40 Fragen · 60 Minuten",
  },
] as const;

const topics = ["Gefährdungen erkennen", "Unfälle vermeiden", "Gefahrstoffe", "Schutzausrüstung", "Umweltschutz"];

type Stage = { icon: DrawIconName; tag: string; title: string; text: string };
const stages: Stage[] = [
  {
    icon: "hardHat",
    tag: "Passende Schulung wählen",
    title: "Dok.\u00a0017 oder Dok.\u00a0018",
    text: "Welche Prüfung passt, hängt von der Rolle im Einsatz ab.",
  },
  {
    icon: "bookOpen",
    tag: "Lernen & vorbereiten",
    title: "Praxisnahe Schulung",
    text: "Wir bereiten Sie verständlich auf die Prüfung vor: mit den Grundlagen zu Sicherheit, Gesundheit und Umweltschutz und mit Beispielen aus dem Arbeitsalltag.",
  },
  {
    icon: "clipboardCheck",
    tag: "Prüfung ablegen",
    title: "Multiple-Choice-Prüfung",
    text: "Die Prüfung nimmt eine akkreditierte Zertifizierungsstelle ab. Zu jeder Frage gibt es vier Antworten, eine davon ist richtig. Bestanden ist die Prüfung ab 70 Prozent.",
  },
  {
    icon: "award",
    tag: "Zertifikat erhalten",
    title: "Ihr SCC-Zertifikat",
    text: "Nach bestandener Prüfung erhalten Sie Ihr persönliches Zertifikat. Es ist fünf Jahre gültig.",
  },
];
const TOTAL = stages.length;

export function SccJourney({ onRequest }: { onRequest: (preset: ConsultationPreset) => void }) {
  const timeline = useRef<HTMLOListElement>(null);
  const items = useRef<(HTMLLIElement | null)[]>([]);
  const [active, setActive] = useState(0);
  const { scrollYProgress } = useScroll({ target: timeline, offset: ["start center", "end center"] });
  const progress = useScrollCopy(scrollYProgress);

  // The card crossing the middle of the viewport is the current one.
  useEffect(() => {
    const inView = new Map<number, boolean>();
    const stops = items.current.map((element, index) =>
      element
        ? watchVisibility(element, "center", (visible) => {
            inView.set(index, visible);
            const current = [...inView].filter(([, on]) => on).map(([at]) => at);
            if (current.length) setActive(Math.max(...current));
          })
        : () => {},
    );
    return () => stops.forEach((stop) => stop());
  }, []);

  const extras: ReactNode[] = [
    <div className="scc-courses" key="courses">
      {courses.map((course) => (
        <div className="scc-course" key={course.doc}>
          <span className="scc-course-doc">{course.doc}</span>
          <strong>{course.role}</strong>
          <p>{course.text}</p>
          <button type="button" onClick={() => onRequest(sccQuotePreset(course.doc))}>
            Angebot anfordern <ArrowUpRight size={15} aria-hidden="true" />
          </button>
        </div>
      ))}
    </div>,
    <ul className="scc-chips" key="topics" aria-label="Schwerpunkte">
      {topics.map((topic) => (
        <li key={topic}>{topic}</li>
      ))}
    </ul>,
    <div className="scc-facts" key="facts">
      {courses.map((course) => (
        <div className="scc-fact" key={course.doc}>
          <span>{course.doc}</span>
          <strong>{course.exam}</strong>
          <small>ab 70 %</small>
        </div>
      ))}
    </div>,
    <p className="scc-note" key="note">
      <Info size={17} aria-hidden="true" />
      <span>
        Zertifikate nach dem alten Regelwerk SCC 2011 werden ab dem 01.11.2026
        nicht mehr anerkannt.
      </span>
    </p>,
  ];

  const stageClass = (index: number) =>
    `scc-stage${active === index ? " is-current" : ""}${active > index ? " is-done" : ""}`;

  return (
    <section id="schulungen" className="scc" aria-labelledby="scc-title">
      <div className="scc-layout">
        <div className="scc-intro">
          <Kicker>02 · SCC-Schulung &amp; Zertifizierung</Kicker>
          <Wipe>
            <h2 id="scc-title">
              Sicher arbeiten.
              <br />
              Nachweisbar qualifiziert.
            </h2>
          </Wipe>
          <Rise delay={0.1}>
            <p className="scc-lead">
              Schulung und Prüfungsvorbereitung nach SCC Dok.&nbsp;017 und
              Dok.&nbsp;018: verständlich, praxisnah und mit einem klaren Weg bis
              zum Zertifikat.
            </p>
          </Rise>
          <div className="scc-position" aria-hidden="true">
            <span>0{Math.min(active, TOTAL - 1) + 1}</span>
            <span>/ 0{TOTAL}</span>
          </div>
          <span className="scc-hint">
            <ArrowDown size={16} aria-hidden="true" /> Weiter scrollen und den Weg entdecken
          </span>
        </div>

        <div className="scc-track">
          <motion.div className="scc-progress" style={{ scaleY: progress }} aria-hidden="true" />
          <ol className="scc-timeline" ref={timeline} aria-label="Ihr Weg zum SCC-Zertifikat">
            {stages.map((stage, index) => (
              <li
                key={stage.title}
                ref={(element) => {
                  items.current[index] = element;
                }}
                className={stageClass(index)}
                aria-current={active === index ? "step" : undefined}
              >
                <span className="scc-marker" aria-hidden="true">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <Rise className="scc-card-wrap" distance={26}>
                  <span className="scc-sheet" aria-hidden="true" />
                  <div className={`scc-card${index === TOTAL - 1 ? " scc-card--cert" : ""}`}>
                    <span className="scc-icon" aria-hidden="true">
                      <DrawIcon name={stage.icon} />
                    </span>
                    <p className="scc-tag">{stage.tag}</p>
                    <h3>{stage.title}</h3>
                    <p className="scc-text">{stage.text}</p>
                    {extras[index]}
                    {index === TOTAL - 1 && (
                      <div className="scc-cert-art" aria-hidden="true">
                        <span className="sheet scc-cert-back" />
                        <div className="sheet scc-cert-front">
                          <span className="scc-cert-title">SCC</span>
                          <span className="scc-cert-sub">Zertifikat</span>
                          <div className="sheet-lines">
                            <i />
                            <i />
                            <i />
                          </div>
                          <svg className="scc-cert-seal" viewBox="0 0 48 48">
                            <circle cx="24" cy="24" r="21" />
                            <path d="M15 25 L21.5 31 L33 18" />
                          </svg>
                        </div>
                      </div>
                    )}
                  </div>
                </Rise>
              </li>
            ))}

            <li
              ref={(element) => {
                items.current[TOTAL] = element;
              }}
              className={`scc-stage scc-stage--cta${active === TOTAL ? " is-current" : ""}`}
            >
              <span className="scc-marker scc-marker--cta" aria-hidden="true">
                <DrawIcon name="calendarCheck" delay={0.25} />
              </span>
              <Rise className="scc-cta" distance={26}>
                <p className="scc-cta-kicker">Jetzt starten</p>
                <h3>Angebot einholen und Termin vereinbaren.</h3>
                <p className="scc-cta-text">
                  Nennen Sie uns die Schulung und die Anzahl der Teilnehmenden. Wir
                  melden uns mit einem Angebot und einem passenden Termin.
                </p>
                <div className="scc-cta-actions">
                  <button type="button" className="button button-light" onClick={() => onRequest(sccQuotePreset())}>
                    Angebot anfordern <ArrowUpRight size={17} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="button button-outline-light"
                    onClick={() => onRequest(appointmentPreset("SCC-Schulung"))}
                  >
                    <CalendarDays size={17} aria-hidden="true" /> Termin vereinbaren
                  </button>
                </div>
                <a className="scc-cta-phone" href={contact.phoneHref}>
                  <Phone size={15} aria-hidden="true" /> Oder direkt anrufen:{" "}
                  <span className="scc-cta-number">{contact.phoneLabel}</span>
                </a>
              </Rise>
            </li>
          </ol>
        </div>
      </div>
    </section>
  );
}
