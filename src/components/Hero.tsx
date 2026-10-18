import { ArrowDown, ArrowUpRight, Award, GraduationCap, HardHat, Star } from "lucide-react";
import { useEffect, useState } from "react";
import { contact } from "../content";
import { HeroScene } from "./HeroScene";
import { LinkedInIcon } from "./LinkedInIcon";
import { WhatsAppIcon } from "./WhatsAppIcon";

/**
 * Opening: a large statement on the left, the 3D monoliths on the right
 * (drawn by HeroScene on its own stage), the main action, social links and the
 * qualifications. Below, a photo band shows /photos/hero.jpg once that file
 * exists; until then a quiet index of the three standards takes its place.
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
        <p className="hero-kicker">
          <span aria-hidden="true" />
          Audit · Zertifizierung · Schulung
        </p>
        <h1 id="hero-title">
          <span className="hero-line">
            <span className="hero-line-inner">Wer sauber</span>
          </span>
          <span className="hero-line">
            <span className="hero-line-inner">arbeitet,</span>
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

        <div className="hero-stage" aria-hidden="true">
          <HeroScene />
        </div>
      </div>

      <div className="hero-meta">
      <ul className="hero-quals" aria-label="Qualifikationen">
        <li>
          <Award size={20} strokeWidth={1.6} aria-hidden="true" />
          Zertifizierter Auditor
        </li>
        <li>
          <HardHat size={20} strokeWidth={1.6} aria-hidden="true" />
          Fachkraft für Arbeitssicherheit
        </li>
        <li>
          <GraduationCap size={20} strokeWidth={1.6} aria-hidden="true" />
          Zertifizierter Ausbilder
        </li>
      </ul>
        <ul className="hero-social" aria-label="Weitere Kanäle">
          <li>
            <a href={contact.linkedIn} target="_blank" rel="noreferrer" aria-label="LinkedIn" title="LinkedIn">
              <LinkedInIcon size={20} />
            </a>
          </li>
          <li>
            <a href={contact.provenExpert} target="_blank" rel="noreferrer" aria-label="ProvenExpert" title="ProvenExpert">
              <Star size={20} strokeWidth={1.8} aria-hidden="true" />
            </a>
          </li>
          <li>
            <a href={contact.whatsappHref} target="_blank" rel="noreferrer" aria-label="WhatsApp" title="WhatsApp">
              <WhatsAppIcon size={20} />
            </a>
          </li>
        </ul>
      </div>

      {photo ? (
        <div className="hero-band has-photo">
          <img src="/photos/hero.jpg" alt="Tayyip Ünal" />
        </div>
      ) : (
        <ul className="hv-index" aria-hidden="true">
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
    </section>
  );
}
