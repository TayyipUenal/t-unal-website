import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { NormCheck } from "../components/NormCheck";
import { QuoteConfigurator } from "../components/QuoteConfigurator";
import { Checklist, Countdown, FreeSlots, Planner, ReadinessCheck, RevenueOffers } from "./ToolPanels";
import { TOOLS, toolFromHash, type ToolId } from "./tools";

/**
 * One window for every tool. Opens from the "Werkzeuge" menu, the offer card in the hero, or a link with
 * #werkzeug-<id> (also the old anchors #audits and #norm-check). Tabs switch between the tools inside.
 */
export function ToolsModal({ onConsultation }: { onConsultation: () => void }) {
  const [open, setOpen] = useState<ToolId | null>(null);
  const tabsRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fromHash = () => {
      const id = toolFromHash(window.location.hash);
      if (id) setOpen(id);
    };
    const onOpen = (event: Event) => setOpen((event as CustomEvent<ToolId>).detail);
    const onClose = () => setOpen(null);
    fromHash();
    window.addEventListener("hashchange", fromHash);
    window.addEventListener("tools:open", onOpen);
    window.addEventListener("tools:close", onClose);
    return () => {
      window.removeEventListener("hashchange", fromHash);
      window.removeEventListener("tools:open", onOpen);
      window.removeEventListener("tools:close", onClose);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const root = document.documentElement;
    const previous = root.style.overflow;
    root.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpen(null);
    window.addEventListener("keydown", onKey);
    return () => {
      root.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
      // A tool link in the address bar would reopen the window on reload.
      if (toolFromHash(window.location.hash)) history.replaceState(null, "", window.location.pathname + window.location.search);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    tabsRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ inline: "center", block: "nearest" });
    bodyRef.current?.scrollTo({ top: 0 });
  }, [open]);

  const consult = () => {
    setOpen(null);
    onConsultation();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="tl-modal" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={(e) => e.target === e.currentTarget && setOpen(null)}>
          <motion.div
            className="tl-box"
            role="dialog"
            aria-modal="true"
            aria-label="Werkzeuge"
            initial={{ y: 24, scale: 0.98 }}
            animate={{ y: 0, scale: 1 }}
            exit={{ y: 16, scale: 0.98 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="tl-top">
              <p className="tl-kicker">Selbst ausprobieren · kostenlos, ohne Anmeldung</p>
              <button type="button" className="tl-close" onClick={() => setOpen(null)} aria-label="Schließen" autoFocus>
                <X size={20} />
              </button>
            </div>
            <div className="tl-tabs" role="tablist" ref={tabsRef}>
              {TOOLS.map(({ id, label, hint, icon: Icon }, index) => (
                <button key={id} type="button" role="tab" aria-selected={open === id} onClick={() => setOpen(id)}>
                  <span className="tl-tab-no">
                    <Icon size={15} aria-hidden="true" /> {String(index + 1).padStart(2, "0")}
                  </span>
                  <b>{label}</b>
                  <small>{hint}</small>
                </button>
              ))}
            </div>
            <div className="tl-body" ref={bodyRef}>
              <motion.div key={open} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
                <h2 className="tl-title">{TOOLS.find((t) => t.id === open)?.hint}</h2>
                {open === "reife" && <ReadinessCheck />}
                {open === "angebote" && <RevenueOffers />}
                {open === "fahrplan" && <Planner />}
                {open === "norm" && (
                  <div className="tl-embed">
                    <NormCheck onRequest={consult} />
                  </div>
                )}
                {open === "preis" && (
                  <div className="tl-embed">
                    <QuoteConfigurator onConsultation={consult} />
                  </div>
                )}
                {open === "countdown" && <Countdown />}
                {open === "termine" && <FreeSlots />}
                {open === "checkliste" && <Checklist />}
              </motion.div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
