import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import { ArrowDown, ArrowUpRight, Award, BadgeCheck, ShieldCheck } from "lucide-react";
import { useMediaQuery } from "../hooks";
import { HeroScene } from "./HeroScene";
import { HeroVisual } from "./HeroVisual";

/**
 * Elements marked `data-paper` are the landing spots of the paper intro
 * (see PaperIntro). The number is the landing order: the headline first.
 */
export function Hero({ onConsultation }: { onConsultation: () => void }) {
  const reduced = useReducedMotion();
  const wide = useMediaQuery("(min-width: 781px)");
  const depth = wide && !reduced;
  const { scrollY } = useScroll();
  const copyY = useTransform(scrollY, [0, 700], [0, -30]);
  return (
    <section id="top" className="hero" aria-labelledby="hero-title">
      <div className="hero-glow" aria-hidden="true" />
      <div className="hero-aurora" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
      <div className="hero-floor" aria-hidden="true" />
      <HeroScene />
      <div className="hero-inner">
        <motion.div className="hero-copy" style={depth ? { y: copyY } : undefined}>
          <p className="hero-eyebrow" data-paper="0">
            <span className="hero-eyebrow-dot" aria-hidden="true" />
            ISO 9001 · ISO 14001 · ISO 45001
          </p>
          <h1 id="hero-title" data-paper="1">
            <span className="hero-line">
              <span className="hero-line-inner">Ein klarer Weg.</span>
            </span>
            <span className="hero-line">
              <span className="hero-line-inner">
                <em>
                  Bis zum Abschluss.
                  <svg className="hero-underline" viewBox="0 0 300 14" preserveAspectRatio="none" aria-hidden="true">
                    <path d="M3 10 C 70 3, 150 13, 297 4" />
                  </svg>
                </em>
              </span>
            </span>
          </h1>
          <p className="hero-lead" data-paper="2">
            Zertifizierung, Audit oder Beratung: Wir begleiten Sie von der
            Paketauswahl bis zum dokumentierten Ergebnis.
          </p>
          <div className="hero-actions" data-paper="3">
            <button type="button" className="button button-primary" onClick={onConsultation}>
              Erstgespräch vereinbaren <ArrowUpRight size={17} aria-hidden="true" />
            </button>
            <a className="text-link hero-secondary" href="#angebot">
              Angebot konfigurieren <ArrowDown size={16} aria-hidden="true" />
            </a>
          </div>
          <ul className="hero-trust" data-paper="4" aria-label="Auf einen Blick">
            <li>
              <Award size={16} aria-hidden="true" /> 5+ Jahre Erfahrung
            </li>
            <li>
              <BadgeCheck size={16} aria-hidden="true" /> Zertifizierter Auditor
            </li>
            <li>
              <ShieldCheck size={16} aria-hidden="true" /> Erstgespräch kostenfrei
            </li>
          </ul>
        </motion.div>
        <HeroVisual scrollY={scrollY} depth={depth} />
      </div>
    </section>
  );
}
