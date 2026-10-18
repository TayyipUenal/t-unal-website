import { useReducedMotion, motion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";
import { useScrollCopy } from "../hooks";

/**
 * Two huge lines of type that slide against each other while the band scrolls
 * through the viewport. One line is filled, the other outlined. Purely
 * decorative (aria-hidden); the words repeat the page's own themes.
 */
export function KineticBand({ top, bottom }: { top: string[]; bottom: string[] }) {
  const ref = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const progress = useScrollCopy(scrollYProgress);
  const x1 = useTransform(progress, [0, 1], ["6%", "-42%"]);
  const x2 = useTransform(progress, [0, 1], ["-44%", "4%"]);

  const row = (words: string[], key: string) =>
    [...words, ...words, ...words].map((word, index) => (
      <span key={`${key}-${index}`}>
        {word}
        <i aria-hidden="true">◆</i>
      </span>
    ));

  return (
    <section ref={ref} className="kb" aria-hidden="true">
      <motion.div className="kb-row kb-fill" style={reduced ? undefined : { x: x1 }}>
        {row(top, "t")}
      </motion.div>
      <motion.div className="kb-row kb-line" style={reduced ? undefined : { x: x2 }}>
        {row(bottom, "b")}
      </motion.div>
    </section>
  );
}
