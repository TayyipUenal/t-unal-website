import { AnimatePresence, motion } from "framer-motion";
import { CalendarCheck, X } from "lucide-react";
import { useEffect, useState } from "react";
import { contact } from "../content";
import { WhatsAppIcon } from "../components/WhatsAppIcon";
import { goToBooking } from "./tools";

const CLOSED_KEY = "tu-bar-closed";

/** Office hours in Berlin: Monday to Friday, 9 to 17. */
function inOffice() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", weekday: "short", hour: "2-digit", hourCycle: "h23" })
      .formatToParts(new Date())
      .map((p) => [p.type, p.value]),
  );
  const hour = Number(parts.hour);
  return !["Sat", "Sun"].includes(parts.weekday) && hour >= 9 && hour < 17;
}

/**
 * Bar at the bottom after some scrolling: availability, WhatsApp and the appointment calendar.
 * Replaces the round WhatsApp button. Closing hides it for the rest of the visit.
 */
export function StickyBar() {
  const [visible, setVisible] = useState(false);
  const [closed, setClosed] = useState(() => {
    try {
      return sessionStorage.getItem(CLOSED_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [office, setOffice] = useState(false);
  useEffect(() => {
    setOffice(inOffice());
    const timer = setInterval(() => setOffice(inOffice()), 60000);
    const onScroll = () => setVisible(window.scrollY > 600);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      clearInterval(timer);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);
  const close = () => {
    setClosed(true);
    try {
      sessionStorage.setItem(CLOSED_KEY, "1");
    } catch {
      /* private mode: closes for this page only */
    }
  };

  return (
    <AnimatePresence>
      {visible && !closed && (
        <motion.aside
          className="sb"
          aria-label="Kontakt"
          initial={{ y: 120, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 120, opacity: 0 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        >
          <p className="sb-text">
            <span className={`sb-dot${office ? " is-on" : ""}`} aria-hidden="true" />
            <b>{office ? "Jetzt erreichbar" : "Gerade nicht im Büro"}</b>
            <span className="sb-sub">{office ? " · Mo–Fr 9–17 Uhr" : " · Antwort am nächsten Werktag"}</span>
          </p>
          <a className="sb-wa" href={contact.whatsappHref} target="_blank" rel="noreferrer" aria-label="Per WhatsApp schreiben">
            <WhatsAppIcon size={18} /> <span>WhatsApp</span>
          </a>
          <button type="button" className="button button-primary sb-book" onClick={() => goToBooking()}>
            <CalendarCheck size={17} aria-hidden="true" /> Termin wählen
          </button>
          <button type="button" className="sb-close" onClick={close} aria-label="Leiste schließen">
            <X size={18} />
          </button>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
