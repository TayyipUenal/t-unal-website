import { ArrowUpRight, Award, Check, GraduationCap, HardHat } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { api, setPageMeta } from "./api";

type PartnerInfo = { name: string; company: string; bio: string; slug: string };

const topics = ["ISO 9001 Qualität", "ISO 14001 Umwelt", "ISO 45001 Arbeitsschutz", "SCC-Schulung", "Beratung und Audit", "Sonstiges"];

/** Personal page of one partner: who recommends, what Tayyip Ünal does, and a form that credits the partner. */
export function PartnerLanding({ slug }: { slug: string }) {
  const [partner, setPartner] = useState<PartnerInfo | "missing" | null>(null);
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState("");

  useEffect(() => {
    setPageMeta("Empfehlung | Tayyip Ünal");
    api<{ partner: PartnerInfo }>(`/api/partner-page/${encodeURIComponent(slug)}`)
      .then((result) => setPartner(result.partner))
      .catch(() => setPartner("missing"));
  }, [slug]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state === "sending") return;
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const data = new FormData(form);
    setState("sending");
    setError("");
    try {
      await api("/api/leads", {
        name: data.get("name"),
        company: data.get("company"),
        email: data.get("email"),
        phone: data.get("phone"),
        topic: data.get("topic"),
        message: data.get("message"),
        website: data.get("website"),
        partnerSlug: slug,
        consent: data.get("consent") === "on",
      });
      setState("done");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Bitte versuchen Sie es erneut.");
      setState("idle");
    }
  }

  if (partner === null) return <main className="pt-page"><p className="pt-empty">Wird geladen …</p></main>;
  if (partner === "missing")
    return (
      <main className="pt-page">
        <section className="pt-auth">
          <div className="pt-card pt-login">
            <h1>Seite nicht gefunden</h1>
            <p className="pt-hint">Diese Partnerseite gibt es nicht oder sie ist nicht mehr aktiv.</p>
            <a className="button button-primary" href="/">
              Zur Startseite
            </a>
          </div>
        </section>
      </main>
    );

  return (
    <main className="pl">
      <section className="pl-hero">
        <div className="pl-inner">
          <p className="hero-kicker">
            <span aria-hidden="true" />
            Persönliche Empfehlung
          </p>
          <h1>
            <span className="hero-line">
              <span className="hero-line-inner">{partner.name}</span>
            </span>
            <span className="hero-line">
              <span className="hero-line-inner">
                empfiehlt <em>Tayyip Ünal.</em>
              </span>
            </span>
          </h1>
          {partner.company && <p className="pl-company">{partner.company}</p>}
          <p className="pl-lead">
            {partner.bio ||
              "Audit, Zertifizierung und Schulung für Betriebe: persönlich, klar und mit Verantwortung bis zum dokumentierten Ergebnis."}
          </p>
        </div>
      </section>

      <section className="pl-body">
        <div className="pl-inner pl-split">
          <div>
            <h2>Wofür Tayyip Ünal steht.</h2>
            <ul className="pl-list">
              <li>
                <Award size={22} strokeWidth={1.5} aria-hidden="true" />
                <span>
                  <b>Audit und Zertifizierung</b>
                  ISO 9001, 14001 und 45001: von der Ist-Analyse bis zum Zertifizierungsaudit.
                </span>
              </li>
              <li>
                <GraduationCap size={22} strokeWidth={1.5} aria-hidden="true" />
                <span>
                  <b>SCC-Schulung</b>
                  Schulung und Prüfungsvorbereitung nach Dok. 017 und 018, bei Ihnen vor Ort.
                </span>
              </li>
              <li>
                <HardHat size={22} strokeWidth={1.5} aria-hidden="true" />
                <span>
                  <b>Arbeitssicherheit</b>
                  Gefährdungsbeurteilung, Unterweisungen und Systeme, die im Alltag tragen.
                </span>
              </li>
            </ul>
            <p className="pl-note">Das Erstgespräch ist kostenfrei und unverbindlich.</p>
          </div>

          {state === "done" ? (
            <div className="pa-form pa-done" role="status">
              <Check size={36} aria-hidden="true" />
              <h3>Vielen Dank für Ihre Anfrage.</h3>
              <p>Tayyip Ünal meldet sich persönlich bei Ihnen. {partner.name} wurde als Empfehlung vermerkt.</p>
            </div>
          ) : (
            <form className="pa-form" onSubmit={submit}>
              <h3>Unverbindlich anfragen</h3>
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
                <span>Thema</span>
                <select name="topic" defaultValue={topics[0]}>
                  {topics.map((topic) => (
                    <option key={topic}>{topic}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Ihre Nachricht</span>
                <textarea name="message" rows={3} maxLength={2000} />
              </label>
              <input name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="visually-hidden" />
              <label className="pa-consent">
                <input type="checkbox" name="consent" required />
                <span>
                  Ich habe die <a href="/datenschutz/">Datenschutzerklärung</a> gelesen und bin mit der Verarbeitung meiner
                  Angaben zur Bearbeitung der Anfrage einverstanden. Ich bin außerdem damit einverstanden, dass {partner.name} als Empfehlungsgeber meine Angaben und den Bearbeitungsstand dieser Anfrage einsehen kann. *
                </span>
              </label>
              {error && (
                <p className="pa-error" role="alert">
                  {error}
                </p>
              )}
              <button type="submit" className="button button-primary" disabled={state === "sending"}>
                {state === "sending" ? "Wird gesendet …" : "Anfrage senden"} <ArrowUpRight size={17} aria-hidden="true" />
              </button>
            </form>
          )}
        </div>
      </section>
    </main>
  );
}
