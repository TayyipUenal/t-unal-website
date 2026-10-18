import type { MotionValue } from "framer-motion";

/**
 * Right side of the hero. The 3D object itself is drawn by HeroScene on the
 * hero backdrop; this column keeps its room and carries a quiet index of the
 * three standards. Decorative duplication of the headline's promise, so it is
 * hidden from assistive tech.
 */
export function HeroVisual({ scrollY }: { scrollY: MotionValue<number>; depth: boolean }) {
  void scrollY;
  return (
    <div className="hero-visual" aria-hidden="true">
      <ul className="hv-index">
        <li>
          <span>01</span>
          ISO 9001
          <small>Qualitätsmanagement</small>
        </li>
        <li>
          <span>02</span>
          ISO 14001
          <small>Umweltmanagement</small>
        </li>
        <li>
          <span>03</span>
          ISO 45001
          <small>Arbeitsschutzmanagement</small>
        </li>
      </ul>
    </div>
  );
}
