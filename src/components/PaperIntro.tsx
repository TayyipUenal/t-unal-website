import { animate } from "framer-motion";
import { useEffect } from "react";

declare global {
  interface Window {
    __tuIntro?: boolean;
  }
}

/**
 * Page-load story: paper sheets flutter in the air, then fly onto the hero's
 * building blocks (elements marked `data-paper`) and turn into them.
 *
 * It plays on every load of the home page. The inline gate in index.html adds
 * `html.intro` before first paint (hiding the targets); this component only
 * runs when that class is present. Sheets land in reading order and reveal
 * their target on landing. Any input, scrolling or a new viewport width skips
 * to the end, a background tab waits until it is looked at, and the intro
 * always ends with every target visible.
 */
const SETTLE = [0.22, 1, 0.36, 1] as const;
/** If the app starts later than this (slow network), show the hero at once. */
const LATEST_START_MS = 2200;
let currentRun = 0;

type Target = { element: HTMLElement; cx: number; cy: number; w: number; h: number; rotate: number };
type Land = (element: HTMLElement) => void;

/** Stable pseudo-random numbers, so the scatter looks designed rather than noisy. */
const random = (index: number, salt: number) => {
  const value = Math.sin(index * 127.1 + salt * 311.7) * 43758.5453;
  return value - Math.floor(value);
};

const readRotation = (element: HTMLElement) => {
  const degrees = parseFloat(getComputedStyle(element).rotate);
  return Number.isFinite(degrees) ? degrees : 0;
};

/** Landing spots currently on screen, in landing order; the rest are revealed directly. */
function collectTargets(all: HTMLElement[], land: Land): Target[] {
  const viewportHeight = window.innerHeight;
  const targets: Target[] = [];
  for (const element of all) {
    const rect = element.getBoundingClientRect();
    if (rect.width < 8 || rect.height < 8 || rect.bottom <= 0 || rect.top >= viewportHeight) {
      land(element);
      continue;
    }
    targets.push({
      element,
      cx: rect.left + rect.width / 2,
      cy: rect.top + rect.height / 2,
      w: element.offsetWidth,
      h: element.offsetHeight,
      rotate: readRotation(element),
    });
  }
  return targets.sort((a, b) => Number(a.element.dataset.paper) - Number(b.element.dataset.paper));
}

/** Flies one sheet onto each target. Returns a function that tears everything down. */
function fly(targets: Target[], land: Land, finish: () => void, isFinished: () => boolean) {
  const root = document.documentElement;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const startScroll = window.scrollY;

  const layer = document.createElement("div");
  layer.className = "intro-layer";
  layer.setAttribute("aria-hidden", "true");
  document.body.append(layer);
  root.classList.add("intro-run");

  const sheetWidth = Math.min(128, Math.max(68, viewportWidth * 0.1));
  const sheetHeight = sheetWidth * 1.3;
  const flights: { stop: () => void }[] = [];
  const sheets: HTMLElement[] = [];
  let landed = 0;
  let closeTimer = 0;

  const close = (delay: number) => {
    window.clearTimeout(closeTimer);
    closeTimer = window.setTimeout(() => {
      layer.remove();
      finish();
      removeListeners();
    }, delay);
  };

  const onLanded = (index: number) => {
    land(targets[index].element);
    const sheet = sheets[index];
    animate(sheet, { opacity: 0 }, { duration: 0.34, ease: "easeOut" }).then(() => sheet.remove());
    landed += 1;
    // Let the last target finish fading in before the transition rules go away.
    if (landed === targets.length) close(420);
  };

  targets.forEach((target, index) => {
    const sheet = document.createElement("div");
    sheet.className = "intro-sheet";
    const left = target.cx - target.w / 2;
    const top = target.cy - target.h / 2;
    sheet.style.left = `${left}px`;
    sheet.style.top = `${top}px`;
    sheet.style.width = `${sheetWidth}px`;
    sheet.style.height = `${sheetHeight}px`;
    sheet.style.opacity = "0";
    layer.append(sheet);
    sheets.push(sheet);

    // Start in the air: spread across the width, in the upper half, some just above the fold.
    const startX = viewportWidth * (0.08 + 0.84 * random(index, 1));
    const startY = viewportHeight * (-0.1 + 0.5 * random(index, 2));
    const x0 = startX - left - sheetWidth / 2;
    const y0 = startY - top - sheetHeight / 2;
    const sway = (random(index, 3) > 0.5 ? 1 : -1) * (24 + 30 * random(index, 4));
    const drop = 40 + 70 * random(index, 5);
    const spin = -30 + 60 * random(index, 6);
    const tumbleX = 30 + 28 * random(index, 7);
    const tumbleY = (random(index, 8) > 0.5 ? 1 : -1) * (16 + 20 * random(index, 9));

    const flight = animate(
      sheet,
      {
        opacity: [0, 1, 1, 1, 1],
        x: [x0, x0 + sway, x0 - sway * 0.6, x0 + sway * 0.25, 0],
        y: [y0, y0 + drop * 0.35, y0 + drop * 0.7, y0 + drop, 0],
        rotate: [spin, spin + 16, spin - 10, spin + 5, target.rotate],
        rotateX: [tumbleX, -tumbleX * 0.6, tumbleX * 0.4, -tumbleX * 0.15, 0],
        rotateY: [tumbleY, -tumbleY * 0.5, tumbleY * 0.3, 0, 0],
        width: [sheetWidth, sheetWidth, sheetWidth, sheetWidth, target.w],
        height: [sheetHeight, sheetHeight, sheetHeight, sheetHeight, target.h],
      },
      {
        duration: 1 + index * 0.075,
        times: [0, 0.16, 0.4, 0.64, 1],
        ease: ["easeOut", "easeInOut", "easeInOut", SETTLE],
      },
    );
    flights.push(flight);
    flight.then(() => {
      if (!isFinished()) onLanded(index);
    });
  });

  const skip = () => {
    if (isFinished()) return;
    flights.forEach((flight) => flight.stop());
    targets.forEach((target) => land(target.element));
    sheets.forEach((sheet) => animate(sheet, { opacity: 0 }, { duration: 0.18 }));
    close(240);
  };
  const onVisibility = () => {
    if (document.visibilityState === "hidden") skip();
  };
  // Scrolling (by the visitor or a jump to an #anchor) moves the landing spots.
  const onScroll = () => {
    if (Math.abs(window.scrollY - startScroll) > 24) skip();
  };
  // Mobile toolbars change only the height; a new width means a new layout.
  const onResize = () => {
    if (window.innerWidth !== viewportWidth) skip();
  };
  const inputs = ["pointerdown", "keydown", "wheel", "touchstart"] as const;
  inputs.forEach((type) => window.addEventListener(type, skip, { passive: true }));
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onResize);
  document.addEventListener("visibilitychange", onVisibility);
  const safety = window.setTimeout(skip, 3600);

  function removeListeners() {
    inputs.forEach((type) => window.removeEventListener(type, skip));
    window.removeEventListener("scroll", onScroll);
    window.removeEventListener("resize", onResize);
    document.removeEventListener("visibilitychange", onVisibility);
    window.clearTimeout(safety);
  }

  return () => {
    flights.forEach((flight) => flight.stop());
    removeListeners();
    window.clearTimeout(closeTimer);
    layer.remove();
    root.classList.remove("intro-run");
  };
}

export function PaperIntro() {
  useEffect(() => {
    const root = document.documentElement;
    if (!root.classList.contains("intro")) return;
    const run = ++currentRun;
    window.__tuIntro = true;

    const all = Array.from(document.querySelectorAll<HTMLElement>("[data-paper]"));
    const land: Land = (element) => element.setAttribute("data-landed", "");
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      all.forEach(land);
      root.classList.remove("intro", "intro-run");
      root.classList.add("intro-done");
    };

    let teardown = () => {};
    const start = (deferred: boolean) => {
      const targets = collectTargets(all, land);
      if (!targets.length || (!deferred && performance.now() > LATEST_START_MS)) {
        finish();
        return;
      }
      teardown = fly(targets, land, finish, () => finished);
    };

    // A page opened in a background tab plays once it is looked at.
    const onFirstView = () => {
      if (document.visibilityState !== "visible") return;
      document.removeEventListener("visibilitychange", onFirstView);
      start(true);
    };
    if (document.visibilityState === "visible") start(false);
    else document.addEventListener("visibilitychange", onFirstView);

    return () => {
      document.removeEventListener("visibilitychange", onFirstView);
      teardown();
      // React StrictMode re-runs effects in development: only reveal if no new run took over.
      window.setTimeout(() => {
        if (currentRun === run) finish();
      }, 60);
    };
  }, []);

  return null;
}
