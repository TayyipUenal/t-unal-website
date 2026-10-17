import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from "framer-motion";
import { useState, type PropsWithChildren, type PointerEvent } from "react";
import { useMediaQuery } from "../hooks";

/**
 * 3D hover tilt: the child leans towards the pointer and a soft highlight
 * follows it. Only active with a fine pointer and without reduced motion;
 * otherwise the child renders flat.
 */
export function Tilt({
  children,
  className,
  max = 9,
}: PropsWithChildren<{ className?: string; max?: number }>) {
  const reduced = useReducedMotion();
  const fine = useMediaQuery("(pointer: fine)");
  const [hover, setHover] = useState(false);
  const x = useMotionValue(0.5);
  const y = useMotionValue(0.5);
  const spring = { stiffness: 220, damping: 22, mass: 0.5 };
  const rotateY = useSpring(useTransform(x, [0, 1], [-max, max]), spring);
  const rotateX = useSpring(useTransform(y, [0, 1], [max, -max]), spring);
  const glow = useTransform(
    [x, y],
    ([px, py]: number[]) =>
      `radial-gradient(circle at ${px * 100}% ${py * 100}%, rgba(255,255,255,0.55), transparent 55%)`,
  );

  if (reduced || !fine) return <div className={className}>{children}</div>;

  const move = (event: PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    x.set((event.clientX - box.left) / box.width);
    y.set((event.clientY - box.top) / box.height);
  };
  const reset = () => {
    x.set(0.5);
    y.set(0.5);
    setHover(false);
  };

  return (
    <motion.div
      className={className ? `tilt ${className}` : "tilt"}
      style={{ transformPerspective: 900, rotateX, rotateY }}
      onPointerMove={move}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={reset}
    >
      {children}
      <motion.span className="tilt-glow" aria-hidden="true" style={{ background: glow, opacity: hover ? 1 : 0 }} />
    </motion.div>
  );
}
