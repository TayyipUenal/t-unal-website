/**
 * Pointer effects shared by the whole page, wired once with event delegation:
 * magnetic buttons, a click ripple and the cursor spotlight on cards. Skipped
 * for touch input and reduced motion.
 */
const MAGNETIC = ".button, .header-contact";
const SPOT = ".quote-card, .scc-card, .qualification";

export function initFx() {
  const fine = window.matchMedia("(pointer: fine)").matches;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!fine || reduced) return () => {};

  const move = (event: PointerEvent) => {
    const target = event.target as Element | null;
    const button = target?.closest<HTMLElement>(MAGNETIC);
    if (button) {
      const box = button.getBoundingClientRect();
      const dx = event.clientX - (box.left + box.width / 2);
      const dy = event.clientY - (box.top + box.height / 2);
      button.style.setProperty("--mx", `${dx * 0.14}px`);
      button.style.setProperty("--my", `${dy * 0.22}px`);
    }
    const card = target?.closest<HTMLElement>(SPOT);
    if (card) {
      const box = card.getBoundingClientRect();
      card.style.setProperty("--px", `${event.clientX - box.left}px`);
      card.style.setProperty("--py", `${event.clientY - box.top}px`);
    }
  };
  const leave = (event: PointerEvent) => {
    const button = (event.target as Element | null)?.closest<HTMLElement>(MAGNETIC);
    if (button && !button.contains(event.relatedTarget as Node | null)) {
      button.style.removeProperty("--mx");
      button.style.removeProperty("--my");
    }
  };
  const press = (event: PointerEvent) => {
    const button = (event.target as Element | null)?.closest<HTMLElement>(MAGNETIC);
    if (!button) return;
    const box = button.getBoundingClientRect();
    const ripple = document.createElement("span");
    ripple.className = "fx-ripple";
    ripple.style.left = `${event.clientX - box.left}px`;
    ripple.style.top = `${event.clientY - box.top}px`;
    button.append(ripple);
    ripple.addEventListener("animationend", () => ripple.remove(), { once: true });
  };

  document.addEventListener("pointermove", move, { passive: true });
  document.addEventListener("pointerout", leave, { passive: true });
  document.addEventListener("pointerdown", press, { passive: true });
  return () => {
    document.removeEventListener("pointermove", move);
    document.removeEventListener("pointerout", leave);
    document.removeEventListener("pointerdown", press);
  };
}
