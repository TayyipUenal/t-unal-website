import { AnimatePresence, motion } from "framer-motion";
import { ArrowUpRight, Menu, X } from "lucide-react";
import { useEffect, useState } from "react";
import { watchVisibility } from "../reveal";
import { BrandLogo } from "./BrandLogo";
import { ThemeToggle } from "./ThemeToggle";
import { ToolsMobileList, ToolsNavItem } from "../tools/ToolsMenu";

const navLinks = [
  { id: "leistungen", label: "Audits" },
  { id: "schulungen", label: "Schulungen" },
  { id: "ablauf", label: "Ablauf" },
  { id: "kontakt", label: "Kontakt" },
];

/** Glass background after the hero, hidden while scrolling down, back on scroll up. */
function useHeaderScroll(locked: boolean) {
  const [scrolled, setScrolled] = useState(false);
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    let lastY = window.scrollY;
    let frame = 0;
    const update = () => {
      frame = 0;
      const y = window.scrollY;
      setScrolled(y > 24);
      const delta = y - lastY;
      if (Math.abs(delta) > 6) {
        setHidden(delta > 0 && y > 180);
        lastY = y;
      }
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    frame = requestAnimationFrame(update);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);
  return { scrolled, hidden: hidden && !locked };
}

/** The home section crossing the middle of the viewport, for the nav indicator. */
function useActiveSection(enabled: boolean) {
  const [active, setActive] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const inView = new Map<string, boolean>();
    const stops = navLinks.map(({ id }) => {
      const element = document.getElementById(id);
      if (!element) return () => {};
      return watchVisibility(element, "center", (visible) => {
        inView.set(id, visible);
        const current = [...navLinks].reverse().find((link) => inView.get(link.id));
        setActive(current?.id ?? null);
      });
    });
    return () => stops.forEach((stop) => stop());
  }, [enabled]);
  return active;
}

export function Header({
  onConsultation,
  home = false,
}: {
  onConsultation: () => void;
  home?: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { scrolled, hidden } = useHeaderScroll(menuOpen);
  const active = useActiveSection(home);
  const closeMenu = () => setMenuOpen(false);

  return (
    <header
      className={`site-header${scrolled ? " is-scrolled" : ""}${hidden ? " is-hidden" : ""}`}
    >
      <a className="header-logo" href="/" aria-label="Tayyip Ünal Startseite">
        <BrandLogo />
      </a>

      <nav className="desktop-nav" aria-label="Hauptnavigation">
        {navLinks.map((link) => {
          const current = active === link.id;
          return (
            <a
              key={link.id}
              href={`/#${link.id}`}
              className={current ? "is-active" : undefined}
              aria-current={current ? "location" : undefined}
            >
              {link.label}
              {current && (
                <motion.span
                  layoutId="nav-indicator"
                  className="nav-indicator"
                  transition={{ type: "spring", stiffness: 420, damping: 36 }}
                />
              )}
            </a>
          );
        })}
        <ToolsNavItem />
      </nav>

      <div className="header-actions">
        <a className="header-partner" href="/partner-werden" target="_blank" rel="noopener">
          Partner werden
        </a>
        <ThemeToggle />
        <button type="button" className="header-contact" onClick={onConsultation}>
          Erstgespräch
          <ArrowUpRight aria-hidden="true" size={16} />
        </button>
      </div>

      <button
        className="menu-button"
        type="button"
        aria-label={menuOpen ? "Menü schließen" : "Menü öffnen"}
        aria-expanded={menuOpen}
        aria-controls="mobile-navigation"
        onClick={() => setMenuOpen((open) => !open)}
      >
        {menuOpen ? <X /> : <Menu />}
      </button>

      <AnimatePresence>
        {menuOpen && (
          <motion.nav
            id="mobile-navigation"
            className="mobile-nav"
            aria-label="Mobile Navigation"
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
          >
            {navLinks.map((link, index) => (
              <motion.a
                key={link.id}
                href={`/#${link.id}`}
                onClick={closeMenu}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <span>0{index + 1}</span>
                {link.label}
              </motion.a>
            ))}
            <motion.a href="/partner-werden" target="_blank" rel="noopener" onClick={closeMenu} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: navLinks.length * 0.05 }}>
              <span>0{navLinks.length + 1}</span>
              Partner werden
            </motion.a>
            <button
              className="button button-primary mobile-consultation"
              type="button"
              onClick={() => {
                closeMenu();
                onConsultation();
              }}
            >
              Erstgespräch anfragen
            </button>
            <ToolsMobileList onPick={closeMenu} />
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  );
}
