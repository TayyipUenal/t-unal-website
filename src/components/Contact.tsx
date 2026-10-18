import { motion } from "framer-motion";
import { ArrowUpRight, Clock3, Mail, MapPin, Phone } from "lucide-react";
import { contact } from "../content";
import { staggerItem } from "../motion-tokens";
import { Depth, Kicker, Rise, Stagger, Wipe } from "./motion";
import { WhatsAppIcon } from "./WhatsAppIcon";

export function Contact({ onConsultation }: { onConsultation: () => void }) {
  return (
    <section id="kontakt" className="contact" aria-labelledby="contact-title">
      <Rise className="contact-stage" distance={28}>
        <Depth className="contact-letter-wrap" depth={-26}>
          <div className="sheet contact-letter" aria-hidden="true">
            <div className="contact-letter-head">
              <span className="hv-mark" />
              <span>
                <strong>Ihre Anfrage</strong>
                <small>an info@tayyipuenal.de</small>
              </span>
            </div>
            <div className="sheet-lines">
              <i />
              <i />
              <i />
              <i />
            </div>
          </div>
        </Depth>
        <div className="contact-panel">
          <div className="contact-panel-copy">
            <Kicker light>Bereit, wenn Sie es sind.</Kicker>
            <Wipe>
              <h2 id="contact-title">Was soll als Nächstes sicher funktionieren?</h2>
            </Wipe>
            <p className="contact-intro">
              Ein kostenfreies Erstgespräch. Eine ehrliche Einschätzung. Konkrete
              nächste Schritte.
            </p>
            <div className="contact-actions">
              <button type="button" className="button button-light" onClick={onConsultation}>
                Erstgespräch anfragen <ArrowUpRight size={17} aria-hidden="true" />
              </button>
              <a className="contact-mail" href={`mailto:${contact.email}`}>
                <Mail size={16} aria-hidden="true" /> {contact.email}
              </a>
              <a className="contact-mail" href={contact.whatsappHref} target="_blank" rel="noreferrer">
                <WhatsAppIcon size={16} /> WhatsApp
              </a>
            </div>
          </div>
        </div>
      </Rise>

      <Stagger className="contact-tiles">
        <motion.a className="contact-tile" href={`mailto:${contact.email}`} variants={staggerItem}>
          <span className="contact-tile-icon">
            <Mail size={18} aria-hidden="true" />
          </span>
          <small>E-Mail</small>
          <strong>{contact.email}</strong>
        </motion.a>
        <motion.a className="contact-tile" href={contact.phoneHref} variants={staggerItem}>
          <span className="contact-tile-icon">
            <Phone size={18} aria-hidden="true" />
          </span>
          <small>Telefon</small>
          <strong>{contact.phoneLabel}</strong>
        </motion.a>
        <motion.a
          className="contact-tile"
          href={contact.whatsappHref}
          target="_blank"
          rel="noreferrer"
          variants={staggerItem}
        >
          <span className="contact-tile-icon">
            <WhatsAppIcon size={18} />
          </span>
          <small>WhatsApp</small>
          <strong>Direkt schreiben</strong>
        </motion.a>
        <motion.a
          className="contact-tile"
          href={contact.mapsHref}
          target="_blank"
          rel="noreferrer"
          variants={staggerItem}
        >
          <span className="contact-tile-icon">
            <MapPin size={18} aria-hidden="true" />
          </span>
          <small>Standort</small>
          <strong>{contact.address}</strong>
        </motion.a>
        <motion.div className="contact-tile" variants={staggerItem}>
          <span className="contact-tile-icon">
            <Clock3 size={18} aria-hidden="true" />
          </span>
          <small>Geschäftszeiten</small>
          <strong>Mo–Fr · 09:00–18:00 Uhr</strong>
        </motion.div>
      </Stagger>

      <div className="contact-socials">
        <span>Im Netzwerk</span>
        <a href={contact.linkedIn} target="_blank" rel="noreferrer">
          <span aria-hidden="true">in</span> LinkedIn
        </a>
        <a href={contact.provenExpert} target="_blank" rel="noreferrer">
          <span aria-hidden="true">★</span> ProvenExpert
        </a>
      </div>
    </section>
  );
}
