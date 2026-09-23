import { motion, useReducedMotion } from "framer-motion";
import { useVisible } from "../hooks";

/**
 * Line icons that draw themselves stroke by stroke when they scroll into view.
 * Shapes are taken from Lucide (ISC licence); rectangles and circles are
 * written as paths so every stroke can be drawn. Array order = drawing order,
 * so outlines come first and the meaningful detail (a check, a ribbon) last.
 */
const icons = {
  hardHat: [
    "M3 15h18a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-2a1 1 0 0 1 1-1z",
    "M4 15v-3a6 6 0 0 1 6-6",
    "M14 6a6 6 0 0 1 6 6v3",
    "M10 10V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v5",
  ],
  bookOpen: [
    "M20.001 19A2 2 0 0022 17V5a2 2 0 00-1.999-2L16 3.002A5 5 0 0012 5a5 5 0 00-4-2H4a2 2 0 00-2 2v12a2 2 0 001.999 2H8a5 5 0 014 2 5 5 0 014-2z",
    "M12 5v16",
  ],
  clipboardCheck: [
    "M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2",
    "M9 2h6a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z",
    "m9 14 2 2 4-4",
  ],
  award: [
    "M12 2a6 6 0 1 1 0 12a6 6 0 1 1 0-12z",
    "m15.477 12.89 1.515 8.526a.5.5 0 0 1-.81.47l-3.58-2.687a1 1 0 0 0-1.197 0l-3.586 2.686a.5.5 0 0 1-.81-.469l1.514-8.526",
  ],
  calendarCheck: [
    "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z",
    "M3 9h18",
    "M8 2v3",
    "M16 2v3",
    "m9 15 2 2 4-4",
  ],
} as const;

export type DrawIconName = keyof typeof icons;

const DRAW_EASE = [0.65, 0, 0.35, 1] as const;

export function DrawIcon({ name, delay = 0.15 }: { name: DrawIconName; delay?: number }) {
  const reduced = useReducedMotion();
  const [ref, shown] = useVisible<HTMLSpanElement>();
  const draw = Boolean(reduced) || shown;
  return (
    <span ref={ref} className="draw-icon">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {icons[name].map((d, index) => {
          const start = delay + index * 0.14;
          return (
            <motion.path
              key={d}
              d={d}
              initial={{ pathLength: 0, opacity: 0 }}
              animate={draw ? { pathLength: 1, opacity: 1 } : { pathLength: 0, opacity: 0 }}
              transition={
                reduced
                  ? { duration: 0 }
                  : {
                      pathLength: { duration: 0.75, delay: start, ease: DRAW_EASE },
                      opacity: { duration: 0.15, delay: start },
                    }
              }
            />
          );
        })}
      </svg>
    </span>
  );
}
