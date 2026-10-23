import { ArrowDown, ArrowUpRight, Check, ClipboardList, LineChart, UserCheck } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Kicker, Rise, Stagger, StaggerItem, Wipe } from "../components/motion";
import { api, euro } from "./api";

const steps = [
  {
    icon: ClipboardList,
    title: "Bewerben",
    text: "Sie schildern in wenigen Zeilen, wen Sie kennen und wie Sie empfehlen möchten.",
  },
  {
    icon: UserCheck,
    title: "Freischalten",
    text: "Tayyip Ünal prüft Ihre Bewerbung persönlich und richtet Ihren Zugang mit eigener Partnerseite ein.",
  },
  {
    icon: LineChart,
    title: "Empfehlen und verdienen",
    text: "Sie melden Kontakte, sehen live den Stand jedes Kunden und wie viel Ihnen zusteht.",
  },
];

const audience = ["Steuerberater", "Unternehmensberater", "Versicherungsmakler", "Fachkräfte für Arbeitssicherheit", "Verbände und Netzwerke", "Branchenexperten"];

const faq = [
  {
    q: "Sehe ich, wie weit meine Kunden sind?",
    a: "Ja. In Ihrem Portal sehen Sie jeden gemeldeten Kontakt mit dem aktuellen Stand: eingegangen, in Kontakt, Angebot oder Auftrag erhalten.",
  },
  {
    q: "Wo sehe ich, wie viel mir zusteht?",
    a: "Ihr persönlicher Prozentsatz steht gut sichtbar im Portal. Bei jedem gewonnenen Auftrag sehen Sie den Betrag, der Ihnen zusteht, und ob er ausgezahlt ist.",
  },
  {
    q: "Wer sieht die Daten meiner Kontakte?",
    a: "Nur Sie und Tayyip Ünal. Partner sehen niemals die Kontakte anderer Partner.",
  },
  {
    q: "Wie läuft die Zusammenarbeit genau?",
    a: "Die Konditionen, den Prozentsatz und die Auszahlung besprechen wir nach Ihrer Bewerbung persönlich und halten sie in einer Partnervereinbarung fest.",
  },
];

function Calculator() {
  const [value, setValue] = useState(6000);
  const [rate, setRate] = useState(10);
  const amount = Math.round(value * (rate / 100) * 100);
  return (
    <div className="pa-calc">
      <div className="pa-calc-head">
        <small>Beispielrechnung</small>
        <strong>{euro(amount)}</strong>
        <span>Provision bei {rate} % von {euro(value * 100)} Auftragswert</span>
      </div>
      <label>
        <span>Auftragswert</span>
        <input type="range" min={1000} max={30000} step={500} value={value} onChange={(e) => setValue(Number(e.target.value))} />
      </label>
      <label>
        <span>Prozentsatz</span>
        <input type="range" min={5} max={20} step={1} value={rate} onChange={(e) => setRate(Number(e.target.value))} />
      </label>
      <p>Nur ein Rechenbeispiel. Ihren tatsächlichen Prozentsatz legen wir persönlich fest, er steht danach in Ihrem Portal.</p>
    </div>
  );
}

/** Public page "Jetzt Partner werden": pitch, how it works, calculator, FAQ and application form. */
export function PartnerApply() {
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state === "sending") return;
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const data = new FormData(form);
    setState("sending");
    setError("");
    try {
      await api("/api/partner/apply", {
        name: data.get("name"),
        company: data.get("company"),
        email: data.get("email"),
        phone: data.get("phone"),
        pitch: data.get("pitch"),
        website: data.get("website"),
        consent: data.get("consent") === "on",
      });
      setState("done");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Bitte versuchen Sie es erneut.");
      setState("idle");
    }
  }

  return (
    <>
      <section className="pa-hero" aria-labelledby="pa-title">
        <div className="pa-hero-inner">
          <p className="hero-kicker">
            <span aria-hidden="true" />
            Partnerprogramm
          </p>
          <h1 id="pa-title">
            <span className="hero-line">
              <span className="hero-line-inner">Empfehlen Sie.</span>
            </span>
            <span className="hero-line">
              <span className="hero-line-inner">
                <em>Wir liefern das Ergebnis.</em>
              </span>
            </span>
          </h1>
          <p className="pa-lead">
            Als Partner von Tayyip Ünal bringen Sie Betriebe zusammen mit Audit, Zertifizierung und Schulung. Sie
            bekommen ein eigenes Portal, eine eigene Partnerseite und sehen jederzeit, wo Ihre Kunden stehen und was
            Ihnen zusteht.
          </p>
          <div className="pa-actions">
            <a className="button button-primary" href="#bewerben">
              Jetzt Partner werden <ArrowUpRight size={17} aria-hidden="true" />
            </a>
            <a className="text-link hero-secondary" href="/portal">
              Zum Partner-Login <ArrowDown size={16} aria-hidden="true" />
            </a>
          </div>
        </div>
      </section>

      <section className="pa-section" aria-labelledby="pa-steps">
        <div className="pa-inner">
          <Kicker>So funktioniert es</Kicker>
          <Wipe>
            <h2 id="pa-steps">Drei Schritte. Klar und nachvollziehbar.</h2>
          </Wipe>
          <Stagger className="pa-steps">
            {steps.map(({ icon: Icon, title, text }, index) => (
              <StaggerItem className="pa-step" key={title}>
                <span className="pa-step-no">0{index + 1}</span>
                <Icon size={40} strokeWidth={1.2} aria-hidden="true" />
                <h3>{title}</h3>
                <p>{text}</p>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </section>

      <section className="pa-section pa-portal" aria-labelledby="pa-portal-title">
        <div className="pa-inner pa-split">
          <div>
            <Kicker>Ihr Portal</Kicker>
            <Wipe>
              <h2 id="pa-portal-title">Jeder Kunde. Jeder Stand. Jeder Euro.</h2>
            </Wipe>
            <Rise delay={0.08}>
              <p className="pa-text">
                Im Partnerportal sehen Sie alle Kontakte, die Sie melden oder die über Ihre Partnerseite kommen, mit dem
                aktuellen Stand. Ihr Prozentsatz steht oben, und bei jedem Auftrag sehen Sie, was Ihnen zusteht.
              </p>
            </Rise>
            <ul className="pa-checks">
              <li>
                <Check size={18} aria-hidden="true" /> Live-Stand pro Kunde
              </li>
              <li>
                <Check size={18} aria-hidden="true" /> Ihr Prozentsatz und Ihre Provision auf einen Blick
              </li>
              <li>
                <Check size={18} aria-hidden="true" /> Eigene Partnerseite mit Ihrem Namen und Empfehlungslink
              </li>
            </ul>
          </div>
          <div className="pa-mock" aria-hidden="true">
            <div className="pa-mock-bar">
              <span />
              <span />
              <span />
              <em>Beispielansicht</em>
            </div>
            <div className="pa-mock-top">
              <div className="pa-mock-rate">
                <small>Ihr Anteil</small>
                <strong>12 %</strong>
              </div>
              <div>
                <small>Offen</small>
                <strong>480,00 €</strong>
              </div>
              <div>
                <small>Ausgezahlt</small>
                <strong>1.250,00 €</strong>
              </div>
            </div>
            <ul className="pa-mock-list">
              <li>
                <b>Firma Beispiel GmbH</b>
                <span className="pa-pill is-won">Auftrag erhalten</span>
                <em>480,00 €</em>
              </li>
              <li>
                <b>Muster Bau AG</b>
                <span className="pa-pill is-offer">Angebot</span>
                <em>in Aussicht</em>
              </li>
              <li>
                <b>Werkstatt Test</b>
                <span className="pa-pill is-contacted">In Kontakt</span>
                <em>–</em>
              </li>
            </ul>
          </div>
        </div>
      </section>

      <section className="pa-section" aria-labelledby="pa-calc-title">
        <div className="pa-inner pa-split">
          <div>
            <Kicker>Provision</Kicker>
            <Wipe>
              <h2 id="pa-calc-title">Provision, die man versteht.</h2>
            </Wipe>
            <Rise delay={0.08}>
              <p className="pa-text">
                Sie erhalten einen festen Prozentsatz vom Auftragswert, einmalig pro abgeschlossenem Auftrag. Der Satz wird
                individuell festgelegt und steht in Ihrem Portal. Keine versteckten Abzüge in der Anzeige: Sie sehen
                Auftragswert, Prozentsatz und Betrag. Für die Grundbetreuung in der Arbeitssicherheit gibt es keine Provision.
              </p>
            </Rise>
            <ul className="pa-tags">
              {audience.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <Calculator />
        </div>
      </section>

      <section className="pa-section pa-faq" aria-labelledby="pa-faq-title">
        <div className="pa-inner">
          <Kicker>Fragen</Kicker>
          <Wipe>
            <h2 id="pa-faq-title">Was Partner wissen wollen.</h2>
          </Wipe>
          <div className="pa-faq-list">
            {faq.map((item) => (
              <details key={item.q}>
                <summary>{item.q}</summary>
                <p>{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section id="bewerben" className="pa-section pa-apply" aria-labelledby="pa-apply-title">
        <div className="pa-inner pa-split">
          <div>
            <Kicker>Bewerbung</Kicker>
            <Wipe>
              <h2 id="pa-apply-title">Jetzt Partner werden.</h2>
            </Wipe>
            <Rise delay={0.08}>
              <p className="pa-text">
                Erzählen Sie uns kurz, wer Sie sind. Tayyip Ünal meldet sich persönlich bei Ihnen und schaltet nach der
                Prüfung Ihren Zugang frei.
              </p>
            </Rise>
          </div>

          {state === "done" ? (
            <div className="pa-form pa-done" role="status">
              <Check size={36} aria-hidden="true" />
              <h3>Vielen Dank für Ihre Bewerbung.</h3>
              <p>Wir prüfen sie persönlich und melden uns bei Ihnen. Danach erhalten Sie den Link zu Ihrem Zugang.</p>
            </div>
          ) : (
            <form className="pa-form" onSubmit={submit} noValidate={false}>
              <div className="pa-row">
                <label>
                  <span>Name *</span>
                  <input name="name" required maxLength={120} autoComplete="name" />
                </label>
                <label>
                  <span>Firma</span>
                  <input name="company" maxLength={160} autoComplete="organization" />
                </label>
              </div>
              <div className="pa-row">
                <label>
                  <span>E-Mail *</span>
                  <input name="email" type="email" required maxLength={200} autoComplete="email" />
                </label>
                <label>
                  <span>Telefon</span>
                  <input name="phone" type="tel" maxLength={60} autoComplete="tel" />
                </label>
              </div>
              <label>
                <span>Wie möchten Sie empfehlen?</span>
                <textarea name="pitch" rows={4} maxLength={2000} placeholder="Zum Beispiel: Ich betreue 40 mittelständische Betriebe in der Region." />
              </label>
              <input name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="visually-hidden" />
              <label className="pa-consent">
                <input type="checkbox" name="consent" required />
                <span>
                  Ich habe die <a href="/datenschutz/">Datenschutzerklärung</a> gelesen und bin mit der Verarbeitung meiner
                  Angaben zur Bearbeitung der Bewerbung einverstanden. *
                </span>
              </label>
              {error && (
                <p className="pa-error" role="alert">
                  {error}
                </p>
              )}
              <button type="submit" className="button button-primary" disabled={state === "sending"}>
                {state === "sending" ? "Wird gesendet …" : "Bewerbung absenden"} <ArrowUpRight size={17} aria-hidden="true" />
              </button>
            </form>
          )}
        </div>
      </section>
    </>
  );
}
