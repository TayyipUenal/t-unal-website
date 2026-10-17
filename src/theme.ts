export type Theme = "light" | "dark";

const KEY = "tu-theme";

/** Saved choice, else the system preference. Safe to call before hydration. */
export function preferredTheme(): Theme {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    /* storage can be blocked */
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function currentTheme(): Theme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

/** Switch themes with a circular reveal from the click position when supported. */
export function toggleTheme(origin?: { x: number; y: number }) {
  const next: Theme = currentTheme() === "dark" ? "light" : "dark";
  const apply = () => {
    document.documentElement.dataset.theme = next;
    const meta = document.querySelector('meta[name="theme-color"]');
    meta?.setAttribute("content", next === "dark" ? "#06151f" : "#ffffff");
    window.dispatchEvent(new CustomEvent("themechange", { detail: next }));
  };
  try {
    localStorage.setItem(KEY, next);
  } catch {
    /* storage can be blocked */
  }
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const start = (document as Document & { startViewTransition?: (cb: () => void) => unknown }).startViewTransition;
  if (!start || reduced) {
    apply();
    return;
  }
  if (origin) {
    document.documentElement.style.setProperty("--tx", `${origin.x}px`);
    document.documentElement.style.setProperty("--ty", `${origin.y}px`);
  }
  start.call(document, apply);
}
