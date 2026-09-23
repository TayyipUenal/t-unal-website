import {
  AnimatePresence,
  easeInOut,
  motion,
  transform,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useTransform,
  type MotionValue,
  type Variants,
} from "framer-motion";
import { ArrowDown } from "lucide-react";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import { useHydrated, useScrollCopy } from "../hooks";
import { EASE } from "../motion-tokens";
import { Kicker } from "./motion";

/**
 * "03 · Zusammenarbeit" as a pinned scroll story: scattered documents
 * (Verstehen) are sorted (Ordnen) and become a certificate (Umsetzen).
 * The server renders a static version; the pinned version replaces it after
 * hydration unless the visitor prefers reduced motion.
 */
const chapters = [
  {
    key: "verstehen",
    number: "01",
    title: "Verstehen",
    text: "Ein kurzes, unverbindliches Gespräch schafft Klarheit über Ziel, Ausgangslage und Zeitrahmen.",
  },
  {
    key: "ordnen",
    number: "02",
    title: "Ordnen",
    text: "Der konkrete Bedarf wird analysiert. Sie erhalten einen verständlichen Plan mit klaren Prioritäten.",
  },
  {
    key: "umsetzen",
    number: "03",
    title: "Umsetzen",
    text: "Lösungen werden gemeinsam eingeführt, trainiert und bis zum sicheren Ergebnis begleitet.",
  },
];
const intro =
  "Direkter Ansprechpartner, kurze Wege und eine ehrliche Einschätzung — ohne Standardkonzepte von der Stange.";

/* Pinned timeline (0 → 1). Formations hold, then morph: A · A→B · B · B→C · C. */
const STOPS = [0, 0.18, 0.3, 0.48, 0.6, 1];
const BOUNDS = [0, 0.24, 0.54, 0.9];
const EXIT = 0.9;
const linear = (value: number) => value;
const SEGMENTS = [linear, easeInOut, linear, easeInOut, linear];

type Pose = [x: number, y: number, rotate: number];
/* Positions are fractions of the stage size, measured from its centre. */
const papers: { category: 0 | 1 | 2; a: Pose; b: Pose; c: Pose }[] = [
  { category: 0, a: [-0.34, -0.3, -16], b: [-0.3, -0.19, 0], c: [-0.075, 0.115, -4] },
  { category: 1, a: [0.02, -0.34, 10], b: [0, -0.19, 0], c: [-0.068, 0.108, 2] },
  { category: 2, a: [0.33, -0.25, -7], b: [0.3, -0.19, 0], c: [-0.061, 0.101, -2.5] },
  { category: 0, a: [-0.24, 0.02, 8], b: [-0.3, -0.03, 0], c: [-0.054, 0.094, 3] },
  { category: 1, a: [0.12, 0, -13], b: [0, -0.03, 0], c: [-0.047, 0.087, -1.5] },
  { category: 2, a: [0.38, 0.12, 17], b: [0.3, -0.03, 0], c: [-0.04, 0.08, 1.5] },
  { category: 0, a: [-0.36, 0.3, -5], b: [-0.3, 0.13, 0], c: [-0.033, 0.073, -3] },
  { category: 1, a: [-0.04, 0.3, 19], b: [0, 0.13, 0], c: [-0.026, 0.066, 2] },
  { category: 2, a: [0.26, 0.34, -10], b: [0.3, 0.13, 0], c: [-0.019, 0.059, -1] },
];
const poses = papers.map(({ a, b, c }) => {
  const track = (axis: 0 | 1 | 2) =>
    transform(STOPS, [a[axis], a[axis], b[axis], b[axis], c[axis], c[axis]], { ease: SEGMENTS });
  return { x: track(0), y: track(1), rotate: track(2) };
});
const circleRadius = transform([0.08, 0.96], [0, 108], { ease: easeInOut });
const lensX = transform([0, 0.2], [-0.2, 0.16]);
const lensY = transform([0, 0.2], [-0.12, 0.08]);

const chapterAt = (progress: number) => (progress < BOUNDS[1] ? 0 : progress < BOUNDS[2] ? 1 : 2);

const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export function Story() {
  const hydrated = useHydrated();
  const reduced = useReducedMotion();
  const pinned = hydrated && !reduced;
  const section = useRef<HTMLElement>(null);
  const lastHeight = useRef(0);

  // Switching to the tall pinned layout must not move content the visitor is
  // already looking at further down the page (deep links, restored scroll).
  useIsomorphicLayoutEffect(() => {
    const element = section.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    const previous = lastHeight.current;
    lastHeight.current = rect.height;
    if (previous && rect.height !== previous && rect.top + previous <= 0) {
      const html = document.documentElement;
      const behavior = html.style.scrollBehavior;
      html.style.scrollBehavior = "auto";
      window.scrollBy(0, rect.height - previous);
      html.style.scrollBehavior = behavior;
    }
  }, [pinned]);

  return pinned ? <PinnedStory sectionRef={section} /> : <StaticStory sectionRef={section} />;
}

function StaticStory({ sectionRef }: { sectionRef: RefObject<HTMLElement | null> }) {
  return (
    <section id="ablauf" ref={sectionRef} className="story is-static" aria-labelledby="story-title">
      <div className="story-static">
        <div>
          <Kicker light>03 · Zusammenarbeit</Kicker>
          <h2 id="story-title">Komplexes wird klar.</h2>
          <p className="story-intro">{intro}</p>
          <a href="#kontakt" className="text-link story-cta">
            Projekt besprechen <ArrowDown aria-hidden="true" size={17} />
          </a>
        </div>
        <ol className="story-static-steps">
          {chapters.map((chapter) => (
            <li key={chapter.key}>
              <span>{chapter.number}</span>
              <div>
                <h3>{chapter.title}</h3>
                <p>{chapter.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

const panelVariants: Variants = {
  on: { opacity: 1, transition: { duration: 0.3 } },
  past: { opacity: 0, transition: { duration: 0.3 } },
  future: { opacity: 0, transition: { duration: 0.3 } },
};
const titleVariants: Variants = {
  on: { y: "0%", transition: { duration: 0.65, ease: EASE } },
  past: { y: "-110%", transition: { duration: 0.45, ease: EASE } },
  future: { y: "110%", transition: { duration: 0.45, ease: EASE } },
};
const textVariants: Variants = {
  on: { opacity: 1, y: 0, transition: { duration: 0.5, delay: 0.12, ease: EASE } },
  past: { opacity: 0, y: -12, transition: { duration: 0.3 } },
  future: { opacity: 0, y: 12, transition: { duration: 0.3 } },
};
const numeralVariants: Variants = {
  enter: (direction: number) => ({ y: `${direction * 55}%`, opacity: 0 }),
  center: { y: "0%", opacity: 1 },
  leave: (direction: number) => ({ y: `${direction * -55}%`, opacity: 0 }),
};

function PinnedStory({ sectionRef }: { sectionRef: RefObject<HTMLElement | null> }) {
  const stage = useRef<HTMLDivElement>(null);
  const width = useMotionValue(640);
  const height = useMotionValue(520);
  const [active, setActive] = useState(0);
  const [direction, setDirection] = useState(1);
  const [sweep, setSweep] = useState(0);
  const activeRef = useRef(0);

  const pinnedScroll = useScroll({ target: sectionRef, offset: ["start start", "end end"] });
  const entryScroll = useScroll({ target: sectionRef, offset: ["start end", "start start"] });
  const progress = useScrollCopy(pinnedScroll.scrollYProgress);
  const entry = useScrollCopy(entryScroll.scrollYProgress);

  useEffect(() => {
    const element = stage.current;
    if (!element) return;
    const observer = new ResizeObserver(([item]) => {
      width.set(item.contentRect.width);
      height.set(item.contentRect.height);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [width, height]);

  const sync = (value: number) => {
    const next = chapterAt(value);
    if (next === activeRef.current) return;
    setDirection(next > activeRef.current ? 1 : -1);
    activeRef.current = next;
    setActive(next);
    setSweep((count) => count + 1);
  };
  useMotionValueEvent(progress, "change", sync);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const next = chapterAt(progress.get());
      if (next !== activeRef.current) {
        activeRef.current = next;
        setActive(next);
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [progress]);

  const clipPath = useTransform(entry, (value) => {
    const radius = circleRadius(value);
    return radius >= 104 ? "none" : `circle(${radius.toFixed(2)}% at 50% 40%)`;
  });
  const contentOpacity = useTransform(entry, [0.55, 0.92], [0, 1]);
  const frameScale = useTransform(progress, [EXIT, 1], [1, 0.9]);
  const frameRadius = useTransform(progress, [EXIT, 1], [0, 32]);

  return (
    <section id="ablauf" ref={sectionRef} className="story is-pinned" aria-labelledby="story-title">
      <div className="story-sticky">
        <motion.div className="story-frame" style={{ clipPath, scale: frameScale, borderRadius: frameRadius }}>
          <div className="story-numeral" aria-hidden="true">
            <AnimatePresence initial={false} mode="popLayout" custom={direction}>
              <motion.span
                key={active}
                custom={direction}
                variants={numeralVariants}
                initial="enter"
                animate="center"
                exit="leave"
                transition={{ duration: 0.75, ease: EASE }}
              >
                {chapters[active].number}
              </motion.span>
            </AnimatePresence>
          </div>

          <motion.div className="story-head" style={{ opacity: contentOpacity }}>
            <Kicker light>03 · Zusammenarbeit</Kicker>
            <h2 id="story-title">Komplexes wird klar.</h2>
            <p className="story-intro">{intro}</p>
          </motion.div>

          <motion.div className="story-stage" ref={stage} style={{ opacity: contentOpacity }} aria-hidden="true">
            <Lens progress={progress} width={width} height={height} />
            {papers.map((paper, index) => (
              <StoryPaper key={index} index={index} progress={progress} width={width} height={height} />
            ))}
            <ColumnLabels progress={progress} />
            <Certificate progress={progress} />
            {sweep > 0 && (
              <motion.span
                key={sweep}
                className="story-scan"
                initial={{ x: "-6%", opacity: 0 }}
                animate={{ x: "104%", opacity: [0, 1, 1, 0] }}
                transition={{ duration: 0.95, ease: [0.4, 0, 0.2, 1] }}
              />
            )}
          </motion.div>

          <motion.div className="story-body" style={{ opacity: contentOpacity }}>
            <ol className="story-panels">
              {chapters.map((chapter, index) => (
                <motion.li
                  key={chapter.key}
                  className="story-panel"
                  initial={false}
                  animate={index === active ? "on" : index < active ? "past" : "future"}
                  variants={panelVariants}
                  aria-current={index === active ? "step" : undefined}
                >
                  <span className="story-panel-num">{chapter.number}</span>
                  <span className="story-panel-mask">
                    <motion.h3 variants={titleVariants}>{chapter.title}</motion.h3>
                  </span>
                  <motion.p variants={textVariants}>{chapter.text}</motion.p>
                </motion.li>
              ))}
            </ol>
            <ol className="story-rail" aria-hidden="true">
              {chapters.map((chapter, index) => (
                <RailSegment key={chapter.key} index={index} active={active} progress={progress} />
              ))}
            </ol>
            <a href="#kontakt" className="text-link story-cta">
              Projekt besprechen <ArrowDown aria-hidden="true" size={17} />
            </a>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}

type Tracks = { progress: MotionValue<number>; width: MotionValue<number>; height: MotionValue<number> };

function StoryPaper({ index, progress, width, height }: Tracks & { index: number }) {
  const pose = poses[index];
  const x = useTransform([progress, width], ([value, size]: number[]) => pose.x(value) * size);
  const y = useTransform([progress, height], ([value, size]: number[]) => pose.y(value) * size);
  const rotate = useTransform(progress, (value) => pose.rotate(value));
  return (
    <motion.div className={`story-paper cat-${papers[index].category}`} style={{ x, y, rotate }}>
      <i />
      <i />
      <i />
    </motion.div>
  );
}

function Lens({ progress, width, height }: Tracks) {
  const x = useTransform([progress, width], ([value, size]: number[]) => lensX(value) * size);
  const y = useTransform([progress, height], ([value, size]: number[]) => lensY(value) * size);
  const opacity = useTransform(progress, [0, 0.14, 0.22], [1, 1, 0]);
  return <motion.span className="story-lens" style={{ x, y, opacity }} />;
}

function ColumnLabels({ progress }: { progress: MotionValue<number> }) {
  const opacity = useTransform(progress, [0.26, 0.32, 0.48, 0.54], [0, 1, 1, 0]);
  return (
    <motion.div className="story-labels" style={{ opacity }}>
      <span>Prozesse</span>
      <span>Nachweise</span>
      <span>Maßnahmen</span>
    </motion.div>
  );
}

function Certificate({ progress }: { progress: MotionValue<number> }) {
  const opacity = useTransform(progress, [0.56, 0.64], [0, 1]);
  const scale = useTransform(progress, [0.56, 0.66], [0.8, 1]);
  const draw = useTransform(progress, [0.62, 0.72], [0, 1]);
  return (
    <motion.div className="story-cert" style={{ opacity, scale }}>
      <div className="story-cert-head">
        <span className="story-cert-mark" />
        <span>
          <strong>Zertifikat</strong>
          <small>Managementsystem</small>
        </span>
      </div>
      <div className="sheet-lines">
        <i />
        <i />
        <i />
      </div>
      <svg className="story-cert-seal" viewBox="0 0 48 48">
        <circle cx="24" cy="24" r="21" />
        <motion.path d="M15 25 L21.5 31 L33 18" style={{ pathLength: draw }} />
      </svg>
    </motion.div>
  );
}

function RailSegment({ index, active, progress }: { index: number; active: number; progress: MotionValue<number> }) {
  const fill = useTransform(progress, [BOUNDS[index], BOUNDS[index + 1]], [0, 1]);
  const state = index === active ? "is-active" : index < active ? "is-done" : undefined;
  return (
    <li className={state}>
      <span className="story-rail-track">
        <motion.i style={{ scaleX: fill }} />
      </span>
      <span className="story-rail-label">{chapters[index].title}</span>
    </li>
  );
}
