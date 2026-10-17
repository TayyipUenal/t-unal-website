import { useEffect, useRef } from "react";
import type { HeroScene as Scene } from "../hero-scene";
import { currentTheme } from "../theme";

/**
 * WebGL backdrop of the hero (see src/hero-scene.ts). Decorative: hidden from
 * assistive tech, skipped when reduced motion is requested or WebGL is not
 * available. The three.js code loads after the first paint.
 */
export function HeroScene() {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let cancelled = false;
    let scene: Scene | null = null;
    const onTheme = (event: Event) => scene?.setTheme((event as CustomEvent<string>).detail === "dark");
    const start = () => {
      import("../hero-scene")
        .then(({ startHeroScene }) => {
          if (cancelled || !canvas.current) return;
          try {
            scene = startHeroScene(canvas.current, {
              still: false,
              dark: currentTheme() === "dark",
              small: window.innerWidth < 781,
            });
            canvas.current.classList.add("is-live");
          } catch {
            /* no WebGL: the page works without the backdrop */
          }
        })
        .catch(() => {});
    };
    const idle = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 400));
    const handle = idle(start);
    window.addEventListener("themechange", onTheme);
    return () => {
      cancelled = true;
      window.removeEventListener("themechange", onTheme);
      if (window.cancelIdleCallback) window.cancelIdleCallback(handle);
      scene?.stop();
    };
  }, []);

  return <canvas ref={canvas} className="hero-scene" aria-hidden="true" />;
}
