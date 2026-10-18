import { useReducedMotion } from "framer-motion";
import { ArrowUpRight, ChevronDown, ScanSearch } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CityScene, ProjectedHotspot } from "../city-scene";
import { contact } from "../content";
import { currentTheme } from "../theme";
import { WhatsAppIcon } from "./WhatsAppIcon";

type Hotspot = {
  id: string;
  station: number;
  position: [number, number, number];
  finding: string;
  solution: string;
};

type Stop = {
  tag: string;
  title: string;
  text: string;
  points: string[];
};

const stops: Stop[] = [
  {
    tag: "Audit-Panorama",
    title: "Ihr Betrieb. Geprüft, bevor es der Auditor tut.",
    text: "Scrollen Sie durch die vier Bereiche eines Managementsystems. Wir zeigen, wo typische Abweichungen entstehen und wie sie sich lösen lassen.",
    points: [],
  },
  {
    tag: "ISO 9001 · Qualität",
    title: "Qualität, die belegbar ist.",
    text: "Prozesse, die jeder versteht, und Nachweise, die jeder Auditor findet.",
    points: ["Prozesse erfassen und verschlanken", "Kennzahlen und Verantwortlichkeiten", "Internes Audit als Generalprobe"],
  },
  {
    tag: "ISO 14001 · Umwelt",
    title: "Umwelt mit System.",
    text: "Vom ersten Umweltaspekt bis zum nachvollziehbaren Ziel.",
    points: ["Umweltaspekte bewerten", "Rechtsvorgaben im Blick", "Ziele und Maßnahmen festlegen"],
  },
  {
    tag: "ISO 45001 · Arbeitsschutz",
    title: "Sicherheit, die gelebt wird.",
    text: "Ein Arbeitsschutzsystem, das im Alltag trägt und nicht nur im Ordner.",
    points: ["Gefährdungsbeurteilung aktuell halten", "Unterweisungen nachweisbar", "Notfälle durchdacht"],
  },
  {
    tag: "SCC · Schulung",
    title: "Wissen, das nachweisbar ist.",
    text: "Schulungen vor Ort und die Nachweise, die der Kunde sehen will.",
    points: ["SCC Dok. 017 und 018", "Schulung bei Ihnen vor Ort", "Teilnahme sauber dokumentiert"],
  },
  {
    tag: "Ihr Betrieb",
    title: "Ihr Betrieb als Nächstes?",
    text: "Ein kostenfreies Erstgespräch. Eine ehrliche Einschätzung. Konkrete nächste Schritte.",
    points: [],
  },
];

const hotspots: Hotspot[] = [
  { id: "q1", station: 1, position: [-3.6, 1.7, -2.3], finding: "Prüfmittel sind nicht kalibriert.", solution: "Kalibrierplan mit Verantwortlichem und Fristen." },
  { id: "q2", station: 1, position: [-5.0, 1.5, -2.2], finding: "Dokumente liegen in drei Versionen vor.", solution: "Eine Lenkung dokumentierter Information, ein Ablageort." },
  { id: "u1", station: 2, position: [4.0, 2.9, -3.6], finding: "Umweltaspekte wurden nie bewertet.", solution: "Bewertungsmatrix und Maßnahmenplan in einem Workshop." },
  { id: "u2", station: 2, position: [3.9, 1.0, -4.4], finding: "Rechtsvorgaben sind unklar.", solution: "Rechtskataster, das jemand im Haus pflegt." },
  { id: "a1", station: 3, position: [-4.3, 1.6, 3.2], finding: "Gefährdungsbeurteilung ist veraltet.", solution: "Aktualisierung mit Terminen und klaren Zuständigkeiten." },
  { id: "a2", station: 3, position: [-2.6, 1.0, 4.4], finding: "Unterweisung ist nicht nachgewiesen.", solution: "Unterweisungsplan mit Unterschrift und Fristenkontrolle." },
  { id: "s1", station: 4, position: [4.2, 2.0, 3.4], finding: "Qualifikation ist nicht belegt.", solution: "Schulungsmatrix mit Zertifikaten pro Person." },
  { id: "s2", station: 4, position: [5.9, 3.6, 4.0], finding: "SCC-Nachweise fehlen im Audit.", solution: "SCC Dok. 017/018 vor Ort schulen und dokumentieren." },
];

/**
 * "Audit-Flug": a scroll-driven flight through a 3D town. One pinned stage;
 * the camera moves from station to station while the copy changes. Hot spots
 * show typical findings and their solutions. With reduced motion the
 * stations are shown as a plain list instead.
 */
export function AuditCity({ onConsultation }: { onConsultation: () => void }) {
  const reduced = useReducedMotion();
  const section = useRef<HTMLElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const scene = useRef<CityScene | null>(null);
  const activeRef = useRef(0);
  const pins = useRef<Record<string, HTMLDivElement | null>>({});
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState<string | null>(null);

  const setStation = useCallback((index: number) => {
    activeRef.current = index;
    setActive(index);
    setOpen(null);
    scene.current?.setStation(index);
  }, []);

  useEffect(() => {
    if (reduced) return;
    let cancelled = false;
    let running: CityScene | null = null;
    const onTheme = (event: Event) => running?.setTheme((event as CustomEvent<string>).detail === "dark");

    const onProject = (list: ProjectedHotspot[]) => {
      for (const item of list) {
        const element = pins.current[item.id];
        if (!element) continue;
        const spot = hotspots.find((h) => h.id === item.id);
        const show = item.visible && spot?.station === activeRef.current;
        element.style.transform = `translate(${item.x}px, ${item.y}px)`;
        element.dataset.show = show ? "true" : "false";
      }
    };

    const fonts = Promise.all([
      document.fonts.load('500 52px "Inter Tight"'),
      document.fonts.load('400 34px "Inter"'),
    ]).catch(() => {});
    Promise.all([import("../city-scene"), fonts])
      .then(([{ startCityScene }]) => {
        if (cancelled || !canvas.current) return;
        try {
          running = startCityScene(canvas.current, {
            still: false,
            dark: currentTheme() === "dark",
            small: window.innerWidth < 781,
            hotspots: hotspots.map((h) => ({ id: h.id, position: h.position })),
            onProject,
          });
          scene.current = running;
          canvas.current.classList.add("is-live");
          update();
        } catch {
          /* no WebGL: the page works without the 3D stage */
        }
      })
      .catch(() => {});

    let frame = 0;
    function update() {
      frame = 0;
      const el = section.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const total = Math.max(1, rect.height - window.innerHeight);
      const p = Math.min(1, Math.max(0, -rect.top / total));
      scene.current?.setProgress(p);
      const index = Math.round(p * (stops.length - 1));
      if (index !== activeRef.current) setStation(index);
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    window.addEventListener("themechange", onTheme);
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      window.removeEventListener("themechange", onTheme);
      running?.stop();
      scene.current = null;
    };
  }, [reduced, setStation]);

  if (reduced) {
    return (
      <section id="audit-flug" className="ac-static" aria-labelledby="ac-title">
        <div className="ac-static-inner">
          <p className="section-kicker">Audit-Panorama</p>
          <h2 id="ac-title">{stops[0].title}</h2>
          <div className="ac-static-grid">
            {stops.slice(1, 5).map((stop) => (
              <article key={stop.tag} className="ac-static-card">
                <small>{stop.tag}</small>
                <h3>{stop.title}</h3>
                <p>{stop.text}</p>
                <ul>
                  {stop.points.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </div>
      </section>
    );
  }

  const stop = stops[active];
  const last = active === stops.length - 1;

  return (
    <section ref={section} id="audit-flug" className="ac" aria-labelledby="ac-title">
      <div className="ac-stage">
        <canvas ref={canvas} className="ac-canvas" aria-hidden="true" />
        <div className="ac-vignette" aria-hidden="true" />

        <div className="ac-panel" key={active}>
          <p className="ac-tag">
            <span className="ac-tag-dot" aria-hidden="true" />
            {stop.tag}
            {!last && active > 0 && <em>{active} / 4</em>}
          </p>
          <h2 id="ac-title">{stop.title}</h2>
          <p className="ac-text">{stop.text}</p>
          {stop.points.length > 0 && (
            <ul className="ac-points">
              {stop.points.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          )}
          {active > 0 && !last && (
            <p className="ac-hint">
              <ScanSearch size={15} aria-hidden="true" /> Befunde antippen: Abweichung und Lösung.
            </p>
          )}
          {last && (
            <div className="ac-cta">
              <button type="button" className="button button-primary" onClick={onConsultation}>
                Erstgespräch vereinbaren <ArrowUpRight size={17} aria-hidden="true" />
              </button>
              <a className="button button-light" href={contact.whatsappHref} target="_blank" rel="noreferrer">
                <WhatsAppIcon size={17} /> WhatsApp
              </a>
            </div>
          )}
        </div>

        <ol className="ac-rail" aria-label="Stationen">
          {stops.map((item, index) => (
            <li key={item.tag + index} className={index === active ? "is-on" : index < active ? "is-done" : undefined}>
              <span className="ac-rail-label">{item.tag}</span>
              <i aria-hidden="true" />
            </li>
          ))}
        </ol>

        {active === 0 && (
          <p className="ac-scroll" aria-hidden="true">
            Weiter scrollen <ChevronDown size={16} />
          </p>
        )}

        {hotspots.map((spot) => (
          <div
            key={spot.id}
            className="ac-pin"
            data-show="false"
            data-open={open === spot.id ? "true" : "false"}
            ref={(element) => {
              pins.current[spot.id] = element;
            }}
          >
            <button
              type="button"
              className="ac-pin-dot"
              aria-expanded={open === spot.id}
              aria-label={`Befund: ${spot.finding}`}
              onClick={() => setOpen(open === spot.id ? null : spot.id)}
            >
              <span aria-hidden="true">{hotspots.filter((h) => h.station === spot.station).indexOf(spot) + 1}</span>
            </button>
            <div className="ac-card" role="note">
              <small>Befund</small>
              <strong>{spot.finding}</strong>
              <small className="ac-solution">So lösen wir es</small>
              <p>{spot.solution}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
