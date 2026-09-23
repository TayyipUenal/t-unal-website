import { motion, useTransform, type MotionValue } from "framer-motion";
import { Check } from "lucide-react";
import { useId } from "react";
import { HeroVideo } from "./HeroVideo";

/**
 * Layered document stack: an audit report and an action plan sit behind the
 * video card, a seal sits in front. While scrolling away, each layer drifts at
 * its own speed. The sheets are decorative and hidden from assistive tech.
 */
export function HeroVisual({ scrollY, depth }: { scrollY: MotionValue<number>; depth: boolean }) {
  const ringId = useId();
  const back = useTransform(scrollY, [0, 700], [0, -16]);
  const mid = useTransform(scrollY, [0, 700], [0, -38]);
  const screen = useTransform(scrollY, [0, 700], [0, -60]);
  const seal = useTransform(scrollY, [0, 700], [0, -104]);
  const drift = (value: MotionValue<number>) => (depth ? { y: value } : undefined);
  return (
    <div className="hero-visual">
      <motion.div className="hv-layer hv-back" style={drift(back)}>
        <div className="sheet hv-sheet hv-report" data-paper="7" aria-hidden="true">
          <div className="hv-sheet-head">
            <span className="hv-mark" />
            <span>
              <strong>Auditbericht</strong>
              <small>ISO 9001 · Kapitel 4–10</small>
            </span>
          </div>
          <div className="sheet-lines">
            <i />
            <i />
            <i />
            <i />
            <i />
          </div>
          <div className="hv-bars">
            <i style={{ height: "42%" }} />
            <i style={{ height: "64%" }} />
            <i style={{ height: "52%" }} />
            <i style={{ height: "88%" }} />
            <i style={{ height: "70%" }} />
          </div>
        </div>
      </motion.div>

      <motion.div className="hv-layer hv-mid" style={drift(mid)}>
        <div className="sheet hv-sheet hv-plan" data-paper="6" aria-hidden="true">
          <div className="hv-plan-head">
            <strong>Maßnahmenplan</strong>
            <small>ISO 9001</small>
          </div>
          <div className="hv-progress">
            <i />
          </div>
          <ul>
            <li className="is-done">
              <span className="hv-dot">
                <Check size={9} strokeWidth={3.4} />
              </span>
              Prozesse
            </li>
            <li className="is-done">
              <span className="hv-dot">
                <Check size={9} strokeWidth={3.4} />
              </span>
              Nachweise
            </li>
            <li>
              <span className="hv-dot" />
              Audit
            </li>
          </ul>
        </div>
      </motion.div>

      <motion.div className="hv-layer hv-screen" style={drift(screen)} data-paper="5">
        <HeroVideo />
      </motion.div>

      <motion.div className="hv-layer hv-seal-wrap" style={drift(seal)}>
        <div className="hv-seal" data-paper="8" aria-hidden="true">
          <svg viewBox="0 0 120 120">
            <defs>
              <path id={ringId} d="M60,60 m-45,0 a45,45 0 1,1 90,0 a45,45 0 1,1 -90,0" />
            </defs>
            <text className="hv-seal-text">
              <textPath href={`#${ringId}`} startOffset="0">
                STRUKTUR · NACHWEISE · AUDIT · ERGEBNIS ·
              </textPath>
            </text>
          </svg>
          <span className="hv-seal-core">
            <Check size={26} strokeWidth={2.6} />
          </span>
        </div>
      </motion.div>
    </div>
  );
}
