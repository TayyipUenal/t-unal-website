import { useTransform, type MotionValue } from "framer-motion";
import { useEffect, useRef, useState, useSyncExternalStore, type RefObject } from "react";
import { watchVisibility } from "./reveal";

const noopSubscribe = () => () => {};

/** False during server rendering and hydration, true afterwards. */
export function useHydrated() {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}

/** Live media query result; false on the server and during hydration. */
export function useMediaQuery(query: string) {
  return useSyncExternalStore(
    (onChange) => {
      const media = window.matchMedia(query);
      media.addEventListener("change", onChange);
      return () => media.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** The page's query string; empty on the server and during hydration. */
export function useSearch() {
  return useSyncExternalStore(noopSubscribe, () => window.location.search, () => "");
}

/**
 * `mode: "enter"` flips to true once and stays true — used for reveals.
 * `mode: "center"` follows the element through the middle of the viewport.
 */
export function useVisible<T extends HTMLElement>(
  mode: "enter" | "center" = "enter",
): [RefObject<T | null>, boolean] {
  const ref = useRef<T>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    return watchVisibility(element, mode, setVisible);
  }, [mode]);
  return [ref, visible];
}

/**
 * A JavaScript-driven copy of a `useScroll` progress value.
 *
 * framer-motion hands `useTransform(progress, [..], [..])` chains of a
 * targeted `useScroll` to a native ViewTimeline animation. With the pinned
 * story and parallax layers that native mapping produced wrong values
 * (verified in Chromium on 2026-09-23), so every scroll-linked style reads
 * from this plain copy, which is updated on each scroll frame instead.
 */
export function useScrollCopy(progress: MotionValue<number>) {
  return useTransform(progress, (value) => value);
}
