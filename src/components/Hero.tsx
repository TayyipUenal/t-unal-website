import { ArrowDown, ArrowUpRight } from "lucide-react";
import { useEffect, useState } from "react";
import { contact } from "../content";
import { HeroScene } from "./HeroScene";
import { WhatsAppIcon } from "./WhatsAppIcon";

/**
 * Opening: a very large statement, a short promise, the main action, and a
 * full-width band below. The band shows /photos/hero.jpg when that file exists;
 * until then it carries the 3D monoliths, one per standard.
 */
export function Hero({ onConsultation }: { onConsultation: () => void }) {
  const [photo, setPhoto] = useState(false);
  useEffect(() => {
    const image = new Image();
    image.onload = () => setPhoto(true);
    image.src = "/photos/hero.jpg";
  }, []);

  return (
    <section id="top" className="hero" aria-labelledby="hero-title">
      <div className="hero-top">
        <h1 id="hero-title">
          <span className="hero-line">
            <span className="hero-line-inner">Wer sauber arbeitet,</span>
          </span>
          <span className="hero-line">
            <span className="hero-line-inner">
              <em>besteht jedes Audit.</em>
            </span>
          </span>
        </h1>
      </div>

      <div className="hero-foot">
        <div className="hero-foot-copy">
          <p className="hero-lead">
            Wir auditieren, zertifizieren und schulen Betriebe nach ISO 9001, 14001, 45001 und SCC.
            Persönlich, klar und mit Verantwortung bis zum dokumentierten Ergebnis.
          </p>
          <div className="hero-actions">
            <button type="button" className="button button-primary" onClick={onConsultation}>
              Erstgespräch vereinbaren <ArrowUpRight size={17} aria-hidden="true" />
            </button>
            <a className="text-link hero-secondary" href="#audits">
              Angebot konfigurieren <ArrowDown size={16} aria-hidden="true" />
            </a>
          </div>
        </div>
        <ul className="hero-social" aria-label="Weitere Kanäle">
          <li>
            <a href={contact.linkedIn} target="_blank" rel="noreferrer">
              LinkedIn
            </a>
          </li>
          <li>
            <a href={contact.provenExpert} target="_blank" rel="noreferrer">
              ProvenExpert
            </a>
          </li>
          <li>
            <a href={contact.whatsappHref} target="_blank" rel="noreferrer">
              <WhatsAppIcon size={15} /> WhatsApp
            </a>
          </li>
        </ul>
      </div>

      <div className={photo ? "hero-band has-photo" : "hero-band"} aria-hidden={photo ? undefined : "true"}>
        {photo ? <img src="/photos/hero.jpg" alt="Tayyip Ünal" /> : <HeroScene />}
        {!photo && (
          <ul className="hv-index">
            <li>
              <span>01</span>
              ISO 9001
              <small>Qualitätsmanagement</small>
            </li>
            <li>
              <span>02</span>
              ISO 14001
              <small>Umweltmanagement</small>
            </li>
            <li>
              <span>03</span>
              ISO 45001
              <small>Arbeitsschutzmanagement</small>
            </li>
          </ul>
        )}
      </div>
    </section>
  );
}
