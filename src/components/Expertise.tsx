import { motion } from "framer-motion";
import { Award, ClipboardCheck, GraduationCap, HardHat } from "lucide-react";
import { staggerItem } from "../motion-tokens";
import { Depth, Kicker, Rise, Stagger, Wipe } from "./motion";
import { Tilt } from "./Tilt";

const qualifications = [
  { label: "Zertifizierter Auditor", icon: Award },
  { label: "Fachkraft für Arbeitssicherheit", icon: HardHat },
  // Soft hyphens mark the only acceptable breaks in this long compound.
  { label: "Qualitäts\u00admanagement\u00adbeauftragter", icon: ClipboardCheck },
  { label: "Zertifizierter Ausbilder", icon: GraduationCap },
];

export function Expertise() {
  return (
    <section id="ueber-mich" className="expertise" aria-labelledby="expertise-title">
      <div className="expertise-inner">
        <Rise className="expertise-visual" scale distance={14}>
          <div className="ev-disc-wrap" aria-hidden="true">
            <span className="ev-orbit" />
            <div className="ev-disc">
              <span className="ev-disc-quote">“</span>
            </div>
          </div>
          <Depth className="ev-badge-wrap" depth={10}>
            <p className="ev-badge">
              <strong>5+</strong>
              <span>Jahre Erfahrung</span>
            </p>
          </Depth>
          <Depth className="ev-card-wrap" depth={-14}>
            <Tilt>
              <figure className="ev-card">
                <blockquote>
                  <p>
                    Vertrauen entsteht durch <em>Verständnis</em>, nicht durch Lautstärke.
                  </p>
                </blockquote>
                <figcaption>— Tayyip Ünal</figcaption>
              </figure>
            </Tilt>
          </Depth>
        </Rise>

        <div className="expertise-body">
          <Kicker>04 · Persönliche Begleitung</Kicker>
          <Wipe>
            <h2 id="expertise-title">Erfahrung ohne Umwege.</h2>
          </Wipe>
          <Rise delay={0.08}>
            <p className="expertise-text">
              Seit über zwei Jahrzehnten begleitet Tayyip Ünal mit seinem
              Expertennetzwerk Unternehmen in Audits, Arbeitssicherheit und
              Qualitätsmanagement. Persönlich, transparent und auf Augenhöhe.
            </p>
          </Rise>
          <Stagger className="qualification-grid">
            {qualifications.map(({ label, icon: Icon }) => (
              <motion.div key={label} className="qualification" variants={staggerItem}>
                <span className="qualification-icon">
                  <Icon size={18} aria-hidden="true" />
                </span>
                <span>{label}</span>
              </motion.div>
            ))}
          </Stagger>
        </div>
      </div>
    </section>
  );
}
