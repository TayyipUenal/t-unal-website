import { Check, ShieldCheck } from "lucide-react";
import { Kicker, Rise, Stagger, StaggerItem, Wipe } from "./motion";

/**
 * Dark bento grid: six reasons to work together, each with a small looping
 * illustration. All illustrations are decorative (aria-hidden); the message is
 * in the headings and text.
 */
export function Bento() {
  return (
    <section id="vorteile" className="bento-section" aria-labelledby="bento-title">
      <div className="bento-inner">
        <header className="bento-head">
          <Kicker light>Warum es funktioniert</Kicker>
          <Wipe>
            <h2 id="bento-title">
              Alles aus <span className="bento-mark">einer Hand.</span>
            </h2>
          </Wipe>
          <Rise delay={0.08}>
            <p>
              Von der ersten Analyse bis zum bestandenen Audit: ein Ansprechpartner, ein roter
              Faden, keine Überraschungen.
            </p>
          </Rise>
        </header>

        <Stagger className="bento-grid">
          <StaggerItem className="bx-slot bx-3">
            <div className="bx">
            <h3>Auditreife in Zahlen.</h3>
            <p>Sie sehen jederzeit, wo Sie stehen: Prozesse, Nachweise und offene Punkte.</p>
            <div className="bx-vis bx-ready" aria-hidden="true">
              <div className="bx-ready-row">
                <span>Prozesse</span>
                <i style={{ ["--w" as string]: "94%" }} />
                <b>94%</b>
              </div>
              <div className="bx-ready-row">
                <span>Nachweise</span>
                <i style={{ ["--w" as string]: "78%" }} />
                <b>78%</b>
              </div>
              <div className="bx-ready-row">
                <span>Schulungen</span>
                <i style={{ ["--w" as string]: "61%" }} />
                <b>61%</b>
              </div>
              <div className="bx-ready-row">
                <span>Audit</span>
                <i style={{ ["--w" as string]: "35%" }} />
                <b>35%</b>
              </div>
            </div>
          </div>
          </StaggerItem>

          <StaggerItem className="bx-slot bx-3">
            <div className="bx">
            <h3>Dokumente, die tragen.</h3>
            <p>Klare Struktur statt Ordnerchaos. Alles ist auffindbar und auditfest.</p>
            <div className="bx-vis bx-docs" aria-hidden="true">
              <div className="bx-doc d1">
                <i />
                <i />
                <i />
              </div>
              <div className="bx-doc d2">
                <i />
                <i />
                <i />
              </div>
              <div className="bx-doc d3">
                <i />
                <i />
                <i />
                <span>
                  <Check size={14} strokeWidth={3} />
                </span>
              </div>
            </div>
          </div>
          </StaggerItem>

          <StaggerItem className="bx-slot bx-2">
            <div className="bx">
            <h3>Rechtssicher.</h3>
            <p>Normen und Vorgaben im Blick, bevor es der Auditor ist.</p>
            <div className="bx-vis bx-shield" aria-hidden="true">
              <span className="bx-pulse" />
              <span className="bx-pulse delay" />
              <ShieldCheck size={54} strokeWidth={1.6} />
            </div>
          </div>
          </StaggerItem>

          <StaggerItem className="bx-slot bx-2">
            <div className="bx">
            <h3>Im Kreis zur Besserung.</h3>
            <p>Planen, Umsetzen, Prüfen, Verbessern: Ihr System lernt weiter.</p>
            <div className="bx-vis bx-cycle" aria-hidden="true">
              <svg viewBox="0 0 120 120">
                <circle cx="60" cy="60" r="44" />
                <circle className="spin" cx="60" cy="60" r="44" />
              </svg>
              <b>PDCA</b>
            </div>
          </div>
          </StaggerItem>

          <StaggerItem className="bx-slot bx-2">
            <div className="bx">
            <h3>Persönlich erreichbar.</h3>
            <p>Kurze Wege: Anruf, Rückmeldung, nächster Schritt.</p>
            <div className="bx-vis bx-inbox" aria-hidden="true">
              <div>
                <span />
                Rückruf heute 14:00<em>neu</em>
              </div>
              <div>
                <span />
                Unterlagen erhalten<em>vor 1 h</em>
              </div>
              <div>
                <span />
                Auditplan steht<em>gestern</em>
              </div>
            </div>
          </div>
          </StaggerItem>
        </Stagger>
      </div>
    </section>
  );
}
