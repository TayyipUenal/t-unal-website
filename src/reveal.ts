/**
 * Scroll-driven visibility for the page's reveal animations.
 *
 * This deliberately measures geometry on scroll instead of using an
 * IntersectionObserver: an observer does not reliably report elements that are
 * already on screen when the page loads (deep links such as `#angebot`, a
 * reload in the middle of the page, a restored scroll position), and a missed
 * callback would leave content permanently invisible. One shared, passive
 * listener measures all registered elements once per animation frame.
 */
type Mode = "enter" | "center";
type Entry = { element: HTMLElement; mode: Mode; notify: (visible: boolean) => void; last: boolean };

const entries = new Set<Entry>();
let scheduled = false;
let listening = false;

function visible(entry: Entry): boolean {
  const rect = entry.element.getBoundingClientRect();
  const height = window.innerHeight || document.documentElement.clientHeight;
  if (entry.mode === "center") return rect.top < height * 0.58 && rect.bottom > height * 0.42;
  // "enter": revealed as soon as the element reaches the lower tenth of the viewport.
  return rect.top < height * 0.9 && rect.bottom > 0;
}

function measure() {
  scheduled = false;
  for (const entry of [...entries]) {
    const now = visible(entry);
    if (entry.mode === "enter") {
      if (!now) continue;
      entries.delete(entry);
      entry.notify(true);
    } else if (now !== entry.last) {
      entry.last = now;
      entry.notify(now);
    }
  }
  if (entries.size === 0) stopListening();
}

function schedule() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(measure);
}

function startListening() {
  if (listening) return;
  listening = true;
  window.addEventListener("scroll", schedule, { passive: true, capture: true });
  window.addEventListener("resize", schedule, { passive: true });
}

function stopListening() {
  if (!listening) return;
  listening = false;
  window.removeEventListener("scroll", schedule, { capture: true });
  window.removeEventListener("resize", schedule);
}

/** Watches one element; returns an unsubscribe function. */
export function watchVisibility(
  element: HTMLElement,
  mode: Mode,
  notify: (visible: boolean) => void,
): () => void {
  const entry: Entry = { element, mode, notify, last: false };
  entries.add(entry);
  startListening();
  schedule();
  return () => {
    entries.delete(entry);
    if (entries.size === 0) stopListening();
  };
}
