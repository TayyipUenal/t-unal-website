import type { Variants } from "framer-motion";

/** Shared easing and list-reveal variants used by the motion components. */
export const EASE = [0.22, 1, 0.36, 1] as const;
export const staggerItem: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: EASE } },
};
