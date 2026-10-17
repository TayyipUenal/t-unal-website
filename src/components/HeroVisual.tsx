import { motion, useMotionValue, useSpring, useTransform, type MotionValue } from "framer-motion";
import { BadgeCheck, Check } from "lucide-react";
import { useEffect, useId } from "react";
import { HeroVideo } from "./HeroVideo";

/** Maximum pointer tilt of the whole stack, in degrees. */
const TILT = 7;

/**
 * Layered document stack in real 3D: the stack tilts towards the pointer and
 * leans back while scrolling away, and each layer sits at its own depth, so
 * the sheets shift against each other. The sheets are decorative and hidden
 * from assistive tech. Without `depth` (narrow screens, reduced motion) the
 * stack stays flat.
 */
export function HeroVisual({ scrollY, depth }: { scrollY: MotionValue<number>; depth: boolean }) {
  const ringId = useId();
  const back = useTransform(scrollY, [0, 700], [0, -16]);
  const mid = useTransform(scrollY, [0, 700], [0, -38]);
  const screen = useTransform(scrollY, [0, 700], [0, -60]);
  const seal = useTransform(scrollY, [0, 700], [0, -104]);
  const lean = useTransform(scrollY, [0, 700], [0, 9]);

  const pointerX = useMotionValue(0);
  const pointerY = useMotionValue(0);
  const spring = { stiffness: 90, damping: 18, mass: 0.6 };
  const yaw = useSpring(useTransform(pointerX, [-1, 1], [-TILT, TILT]), spring);
  const pitch = useSpring(useTransform(pointerY, [-1, 1], [TILT * 0.6, -TILT * 0.6]), spring);
  const rotateX = useTransform([pitch, lean], ([p, l]: number[]) => p + l);

  useEffect(() => {
    if (!depth || !window.matchMedia("(pointer: fine)").matches) return;
    const move = (event: PointerEvent) => {
      pointerX.set((event.clientX / window.innerWidth) * 2 - 1);
      pointerY.set((event.clientY / window.innerHeight) * 2 - 1);
    };
    const leave = () => {
      pointerX.set(0);
      pointerY.set(0);
    };
    window.addEventListener("pointermove", move, { passive: true });
    document.documentElement.addEventListener("pointerleave", leave);
    return () => {
      window.removeEventListener("pointermove", move);
      document.documentElement.removeEventListener("pointerleave", leave);
    };
  }, [depth, pointerX, pointerY]);

  const drift = (value: MotionValue<number>, z: number) => (depth ? { y: value, z } : undefined);
  const stage = depth
    ? { transformPerspective: 1300, rotateX, rotateY: yaw, transformStyle: "preserve-3d" as const }
    : undefined;
  return (
    <motion.div className="hero-visual" style={stage}>
      <motion.div className="hv-layer hv-back" style={drift(back, -70)}>
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

      <motion.div className="hv-layer hv-mid" style={drift(mid, -25)}>
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

      <motion.div className="hv-layer hv-screen" style={drift(screen, 10)} data-paper="5">
        <HeroVideo />
      </motion.div>

      <motion.div className="hv-layer hv-seal-wrap" style={drift(seal, 90)}>
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

      <motion.div className="hv-layer hv-notif" style={drift(seal, 70)} aria-hidden="true">
        <span className="hv-notif-icon">
          <BadgeCheck size={20} />
        </span>
        <span>
          <b>Audit bestanden</b>
          <small>ISO 9001 · Zertifikat freigegeben</small>
        </span>
      </motion.div>

      <motion.div className="hv-layer hv-metric" style={drift(mid, 55)} aria-hidden="true">
        <small>Auditreife</small>
        <b>92%</b>
        <svg viewBox="0 0 120 30" preserveAspectRatio="none">
          <path d="M2 26 C 20 24, 28 14, 46 16 S 74 8, 90 9 S 108 4, 118 3" />
        </svg>
      </motion.div>
    </motion.div>
  );
}
