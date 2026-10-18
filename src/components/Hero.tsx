import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import { ArrowDown, ArrowUpRight, Award, BadgeCheck, ShieldCheck } from "lucide-react";
import { useMediaQuery } from "../hooks";
import { HeroScene } from "./HeroScene";
import { HeroVisual } from "./HeroVisual";

export function Hero({ onConsultation }: { onConsultation: () => void }) {
  const reduced = useReducedMotion();
  const wide = useMediaQuery("(min-width: 781px)");
  const depth = wide && !reduced;
  const { scrollY } = useScroll();
  const copyY = useTransform(scrollY, [0, 700], [0, -30]);
  return (
    <section id="top" className="hero" aria-labelledby="hero-title">
      <div className="hero-glow" aria-hidden="true" />
      <div className="hero-grid" aria-hidden="true" />
      <HeroScene />
      <div className="hero-inner">
        <motion.div className="hero-copy" style={depth ? { y: copyY } : undefined}>
          <p className="hero-eyebrow">
            <span className="hero-eyebrow-dot" aria-hidden="true" />
            ISO 9001 · ISO 14001 · ISO 45001
          </p>
          <h1 id="hero-title">
            <span className="hero-line">
              <span className="hero-line-inner">Ein klarer Weg.</span>
            </span>
            <span className="hero-line">
              <span className="hero-line-inner">
                <em>
                  Bis zum Abschluss.
                </em>
              </span>
            </span>
          </h1>
          <p className="hero-lead">
            Zertifizierung, Audit oder Beratung: Wir begleiten Sie von der
            Paketauswahl bis zum dokumentierten Ergebnis.
          </p>
          <div className="hero-actions">
            <button type="button" className="button button-primary" onClick={onConsultation}>
              Erstgespräch vereinbaren <ArrowUpRight size={17} aria-hidden="true" />
            </button>
            <a className="text-link hero-secondary" href="#angebot">
              Angebot konfigurieren <ArrowDown size={16} aria-hidden="true" />
            </a>
          </div>
          <ul className="hero-trust" aria-label="Auf einen Blick">
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
