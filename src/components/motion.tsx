import { motion, useReducedMotion, useScroll, useTransform, type Variants } from "framer-motion";
import { useRef, type PropsWithChildren } from "react";
import { useMediaQuery, useScrollCopy, useVisible } from "../hooks";
import { EASE, staggerItem } from "../motion-tokens";

/**
 * The page's motion vocabulary. Everything is short and runs once when an
 * element scrolls into view.
 *
 * Every primitive starts in its "hidden" variant, exactly like the server
 * render, and switches to "show" when revealed. With reduced motion it shows
 * immediately (the app's MotionConfig makes the remaining transforms
 * instant). Never use `initial={false}` here: the prerendered hidden styles
 * would then stay in place and the content would remain invisible.
 *
 * - `Kicker`: a thin rule draws in, then the label slides after it.
 * - `Wipe`: headings are revealed from behind a mask while sliding up.
 * - `Rise`: blocks fade up a few pixels.
 * - `Stagger` + `staggerItem` (from motion-tokens): lists reveal their children one after another.
 * - `Depth`: a layer drifts against the scroll by up to `depth` px, which
 *   separates stacked layers (tablet and desktop only).
 */

type Base = PropsWithChildren<{ className?: string; delay?: number }>;

export function Rise({
  children,
  className,
  delay = 0,
  distance = 18,
  scale = false,
}: Base & { distance?: number; scale?: boolean }) {
  const reduced = useReducedMotion();
  const [ref, shown] = useVisible<HTMLDivElement>();
  return (
    <motion.div
      ref={ref}
      className={className}
      variants={{
        hidden: { opacity: 0, y: distance, scale: scale ? 0.965 : 1 },
        show: { opacity: 1, y: 0, scale: 1 },
      }}
      initial="hidden"
      animate={reduced || shown ? "show" : "hidden"}
      transition={reduced ? { duration: 0 } : { duration: 0.5, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

const wipeOuter: Variants = {
  hidden: { clipPath: "inset(0% -10% 100% -10%)" },
  show: { clipPath: "inset(-20% -10% -20% -10%)" },
};
const wipeInner: Variants = { hidden: { y: "34%" }, show: { y: "0%" } };

export function Wipe({ children, className, delay = 0 }: Base) {
  const reduced = useReducedMotion();
  const [ref, shown] = useVisible<HTMLDivElement>();
  return (
    <motion.div
      ref={ref}
      className={className}
      variants={wipeOuter}
      initial="hidden"
      animate={reduced || shown ? "show" : "hidden"}
      transition={reduced ? { duration: 0 } : { duration: 0.65, delay, ease: EASE }}
    >
      <motion.div
        variants={wipeInner}
        transition={reduced ? { duration: 0 } : { duration: 0.65, delay, ease: EASE }}
      >
        {children}
      </motion.div>
    </motion.div>
  );
}

const staggerParent: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06, delayChildren: 0.04 } },
};

export function Stagger({ children, className }: Base) {
  const reduced = useReducedMotion();
  const [ref, shown] = useVisible<HTMLDivElement>();
  return (
    <motion.div
      ref={ref}
      className={className}
      variants={staggerParent}
      initial="hidden"
      animate={reduced || shown ? "show" : "hidden"}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({ children, className }: Base) {
  return (
    <motion.div className={className} variants={staggerItem}>
      {children}
    </motion.div>
  );
}

const rule: Variants = {
  hidden: { scaleX: 0 },
  show: { scaleX: 1, transition: { duration: 0.5, ease: EASE } },
};
const label: Variants = {
  hidden: { opacity: 0, x: -6 },
  show: { opacity: 1, x: 0, transition: { duration: 0.4, delay: 0.22, ease: EASE } },
};

export function Kicker({
  children,
  className = "",
  light = false,
}: PropsWithChildren<{ className?: string; light?: boolean }>) {
  const reduced = useReducedMotion();
  const [ref, shown] = useVisible<HTMLParagraphElement>();
  return (
    <motion.p
      ref={ref}
      className={`section-kicker${light ? " light" : ""}${className ? ` ${className}` : ""}`}
      initial="hidden"
      animate={reduced || shown ? "show" : "hidden"}
    >
      <motion.span className="kicker-rule" aria-hidden="true" variants={rule} />
      <motion.span variants={label}>{children}</motion.span>
    </motion.p>
  );
}

export function Depth({
  children,
  className,
  depth = 30,
}: PropsWithChildren<{ className?: string; depth?: number }>) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const wide = useMediaQuery("(min-width: 781px)");
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const progress = useScrollCopy(scrollYProgress);
  const y = useTransform(progress, [0, 1], [depth, -depth]);
  return (
    <motion.div ref={ref} className={className} style={reduced || !wide ? undefined : { y }}>
      {children}
    </motion.div>
  );
}
