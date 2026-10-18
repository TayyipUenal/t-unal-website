import { contact } from "../content";
import { WhatsAppIcon } from "./WhatsAppIcon";

/** Floating WhatsApp shortcut with a prefilled message. Opens WhatsApp in a new tab. */
export function WhatsAppButton() {
  return (
    <a
      className="wa-float"
      href={contact.whatsappHref}
      target="_blank"
      rel="noreferrer"
      aria-label="Per WhatsApp schreiben"
    >
      <span className="wa-pulse" aria-hidden="true" />
      <WhatsAppIcon size={28} />
      <span className="wa-label">Per WhatsApp schreiben</span>
    </a>
  );
}
