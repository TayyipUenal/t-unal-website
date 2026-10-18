import { useEffect, useRef } from "react";

/** A soft glow that trails the pointer across the whole page. Fine pointers only, no reduced motion. */
export function CursorAura() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const fine = window.matchMedia("(pointer: fine)").matches;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!fine || reduced) return;

    let tx = window.innerWidth / 2;
    let ty = window.innerHeight / 2;
    let x = tx;
    let y = ty;
    let frame = 0;
    const step = () => {
      x += (tx - x) * 0.12;
      y += (ty - y) * 0.12;
      element.style.transform = `translate3d(${x - 260}px, ${y - 260}px, 0)`;
      frame = requestAnimationFrame(step);
    };
    const move = (event: PointerEvent) => {
      tx = event.clientX;
      ty = event.clientY;
      element.dataset.on = "true";
    };
    const leave = () => {
      element.dataset.on = "false";
    };
    window.addEventListener("pointermove", move, { passive: true });
    document.documentElement.addEventListener("pointerleave", leave);
    frame = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", move);
      document.documentElement.removeEventListener("pointerleave", leave);
    };
  }, []);

  return <div ref={ref} className="aura" data-on="false" aria-hidden="true" />;
}
