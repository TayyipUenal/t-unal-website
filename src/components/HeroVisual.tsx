import { motion, useMotionValue, useSpring, useTransform, type MotionValue } from "framer-motion";
import { BadgeCheck, Check } from "lucide-react";
import { useEffect } from "react";

/**
 * Right side of the hero. The 3D certificate itself is drawn by HeroScene on
 * the hero backdrop; this column keeps its room and carries three floating
 * HTML cards on top. While scrolling away, each card drifts at its own speed,
 * and with a fine pointer the cards lean towards it. All decorative and
 * hidden from assistive tech. Without `depth` (narrow screens, reduced
 * motion) the cards stay flat.
 */
export function HeroVisual({ scrollY, depth }: { scrollY: MotionValue<number>; depth: boolean }) {
  const mid = useTransform(scrollY, [0, 700], [0, -38]);
  const seal = useTransform(scrollY, [0, 700], [0, -104]);
  const back = useTransform(scrollY, [0, 700], [0, -16]);

  const pointerX = useMotionValue(0);
  const pointerY = useMotionValue(0);
  const spring = { stiffness: 90, damping: 18, mass: 0.6 };
  const yaw = useSpring(useTransform(pointerX, [-1, 1], [-6, 6]), spring);
  const pitch = useSpring(useTransform(pointerY, [-1, 1], [4, -4]), spring);

  useEffect(() => {
    if (!depth || !window.matchMedia("(pointer: fine)").matches) return;
    const move = (event: PointerEvent) => {
      pointerX.set((event.clientX / window.innerWidth) * 2 - 1);
      pointerY.set((event.clientY / window.innerHeight) * 2 - 1);
    };
    window.addEventListener("pointermove", move, { passive: true });
    return () => window.removeEventListener("pointermove", move);
  }, [depth, pointerX, pointerY]);

  const drift = (value: MotionValue<number>, z: number) => (depth ? { y: value, z } : undefined);
  const stage = depth
    ? { transformPerspective: 1300, rotateX: pitch, rotateY: yaw, transformStyle: "preserve-3d" as const }
    : undefined;

  return (
    <motion.div className="hero-visual" style={stage} aria-hidden="true">
      <motion.div className="hv-layer hv-notif" data-paper="5" style={drift(seal, 90)}>
        <span className="hv-notif-icon">
          <BadgeCheck size={20} />
        </span>
        <span>
          <b>Audit bestanden</b>
          <small>ISO 9001 · Zertifikat freigegeben</small>
        </span>
      </motion.div>

      <motion.div className="hv-layer hv-metric" data-paper="6" style={drift(mid, 70)}>
        <small>Auditreife</small>
        <b>92%</b>
        <svg viewBox="0 0 120 30" preserveAspectRatio="none">
          <path d="M2 26 C 20 24, 28 14, 46 16 S 74 8, 90 9 S 108 4, 118 3" />
        </svg>
      </motion.div>

      <motion.div className="hv-layer hv-todo" data-paper="7" style={drift(back, 50)}>
        <strong>Maßnahmenplan</strong>
        <ul>
          <li className="is-done">
            <span>
              <Check size={9} strokeWidth={3.4} />
            </span>
            Prozesse
          </li>
          <li className="is-done">
            <span>
              <Check size={9} strokeWidth={3.4} />
            </span>
            Nachweise
          </li>
          <li>
            <span />
            Audit
          </li>
        </ul>
      </motion.div>
    </motion.div>
  );
}
