import { ArrowLeft, ArrowUpRight, Award, RotateCcw } from "lucide-react";
import { useMemo, useState } from "react";
import { Kicker, Rise, Wipe } from "./motion";

type Norm = "ISO 9001" | "ISO 14001" | "ISO 45001";

const questions = [
  {
    title: "Was ist Ihnen am wichtigsten?",
    options: [
      { label: "Zufriedene Kunden", hint: "Qualität und verlässliche Abläufe", norm: "ISO 9001" as Norm },
      { label: "Nachhaltigkeit", hint: "Umweltauflagen und Ressourcen", norm: "ISO 14001" as Norm },
      { label: "Sichere Mitarbeitende", hint: "Arbeitsschutz und weniger Unfälle", norm: "ISO 45001" as Norm },
    ],
  },
  {
    title: "Wie groß ist Ihr Unternehmen?",
    options: [
      { label: "Bis 20 Mitarbeitende", hint: "Kleiner Betrieb", value: 0 },
      { label: "21 bis 100", hint: "Mittelstand", value: 1 },
      { label: "Über 100", hint: "Mehrere Standorte oder Teams", value: 2 },
    ],
  },
  {
    title: "Wo stehen Sie heute?",
    options: [
      { label: "Ganz am Anfang", hint: "Noch nichts dokumentiert", value: 28 },
      { label: "Teilweise vorhanden", hint: "Einiges ist geregelt", value: 58 },
      { label: "Fast fertig", hint: "Es fehlt der letzte Schliff", value: 84 },
    ],
  },
];

const advice: Record<Norm, { title: string; next: string }> = {
  "ISO 9001": {
    title: "Qualitätsmanagement",
    next: "Prozesse erfassen, Verantwortung klären und das erste interne Audit planen.",
  },
  "ISO 14001": {
    title: "Umweltmanagement",
    next: "Umweltaspekte bewerten, Rechtsvorgaben prüfen und Ziele festlegen.",
  },
  "ISO 45001": {
    title: "Arbeitsschutzmanagement",
    next: "Gefährdungen erfassen, Schutzmaßnahmen festlegen und Unterweisungen planen.",
  },
};

/**
 * Three-question check that recommends a standard and shows a readiness
 * estimate on a 3D certificate. A quick, playful first step towards the
 * consultation; the result is an estimate, not an assessment.
 */
export function NormCheck({ onRequest }: { onRequest: () => void }) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);
  const done = step >= questions.length;

  const result = useMemo(() => {
    if (answers.length < questions.length) return null;
    const norm = (questions[0].options[answers[0]] as { norm: Norm }).norm;
    const size = (questions[1].options[answers[1]] as { value: number }).value;
    const base = (questions[2].options[answers[2]] as { value: number }).value;
    return { norm, score: Math.max(12, base - size * 6) };
  }, [answers]);

  const choose = (index: number) => {
    setAnswers((current) => [...current.slice(0, step), index]);
    setStep(step + 1);
  };
  const back = () => setStep(Math.max(0, step - 1));
  const restart = () => {
    setAnswers([]);
    setStep(0);
  };

  return (
    <section id="norm-check" className="nc-section" aria-labelledby="nc-title">
      <div className="nc-inner">
        <div className="nc-copy">
          <Kicker>In 30 Sekunden</Kicker>
          <Wipe>
            <h2 id="nc-title">Welche Norm passt zu Ihnen?</h2>
          </Wipe>
          <Rise delay={0.08}>
            <p>
              Drei kurze Fragen, eine klare Empfehlung. Dazu eine erste Einschätzung, wie nah Sie
              am Zertifikat sind.
            </p>
          </Rise>
        </div>

        <div className="nc-card">
          <div className="nc-top">
            <span>{done ? "Ergebnis" : `Frage ${step + 1} von ${questions.length}`}</span>
            {step > 0 && (
              <button type="button" className="nc-back" onClick={done ? restart : back}>
                {done ? <RotateCcw size={14} aria-hidden="true" /> : <ArrowLeft size={14} aria-hidden="true" />}
                {done ? "Neu starten" : "Zurück"}
              </button>
            )}
          </div>
          <div className="nc-bar" aria-hidden="true">
            <i style={{ width: `${(Math.min(step, questions.length) / questions.length) * 100}%` }} />
          </div>

          {!done && (
            <div className="nc-q" key={step}>
              <h3>{questions[step].title}</h3>
              <div className="nc-opts">
                {(questions[step].options as { label: string; hint: string }[]).map((option, index) => (
                  <button
                    type="button"
                    key={option.label}
                    className={answers[step] === index ? "nc-opt is-on" : "nc-opt"}
                    onClick={() => choose(index)}
                  >
                    <strong>{option.label}</strong>
                    <small>{option.hint}</small>
                  </button>
                ))}
              </div>
            </div>
          )}

          {done && result && (
            <div className="nc-result" key="result">
              <div className="nc-stage">
                <div className="nc-tilt">
                  <div className="nc-cert" aria-hidden="true">
                    <span className="nc-cert-seal">
                      <Award size={26} />
                    </span>
                    <small>Empfehlung</small>
                    <strong>{result.norm}</strong>
                    <em>{advice[result.norm].title}</em>
                    <i />
                    <i />
                    <i className="short" />
                  </div>
                </div>
              </div>

              <div className="nc-side">
                <div className="nc-ring" role="img" aria-label={`Geschätzte Auditreife ${result.score} Prozent`}>
                  <svg viewBox="0 0 80 80" aria-hidden="true">
                    <circle cx="40" cy="40" r="34" />
                    <circle
                      className="fg"
                      cx="40"
                      cy="40"
                      r="34"
                      style={{ ["--off" as string]: `${214 - (214 * result.score) / 100}` }}
                    />
                  </svg>
                  <b>{result.score}%</b>
                </div>
                <p className="nc-next">
                  <strong>Nächster Schritt:</strong> {advice[result.norm].next}
                </p>
                <p className="nc-note">Erste Einschätzung, keine Bewertung.</p>
                <button type="button" className="button button-primary" onClick={onRequest}>
                  Erstgespräch vereinbaren <ArrowUpRight size={17} aria-hidden="true" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
