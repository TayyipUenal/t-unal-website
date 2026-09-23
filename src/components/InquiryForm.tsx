import { useId, useRef, useState, type FormEvent } from "react";
import { ArrowUpRight, CheckCircle2 } from "lucide-react";
import { postInquiry } from "../api";

const topics = [
  "Erstgespräch",
  "Terminanfrage",
  "ISO 9001",
  "ISO 14001",
  "ISO 45001",
  "SCC-Schulung",
  "Arbeitssicherheit",
  "Arbeitsmedizin",
  "Schulungen",
  "Beratung & Consulting",
  "Factoring-Vermittlung",
];

export function InquiryForm({
  topic = "Erstgespräch",
  message = "",
}: {
  topic?: string;
  message?: string;
}) {
  const id = useId();
  const [status, setStatus] = useState<
    "idle" | "sending" | "success" | "error"
  >("idle");
  const [error, setError] = useState("");
  const [reference, setReference] = useState("");
  const successRef = useRef<HTMLDivElement>(null);
  const requestId = useRef<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === "sending") return;
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const data = Object.fromEntries(new FormData(form).entries());
    setStatus("sending");
    setError("");
    try {
      const result = await postInquiry(data, requestId);
      setReference(result.reference);
      setStatus("success");
      requestAnimationFrame(() => successRef.current?.focus());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unbekannter Fehler.");
      setStatus("error");
    }
  }

  if (status === "success")
    return (
      <div
        className="inquiry-success"
        ref={successRef}
        tabIndex={-1}
        role="status"
      >
        <CheckCircle2 size={34} aria-hidden="true" />
        <h3>Vielen Dank für Ihre Anfrage.</h3>
        <p>
          Ihre Nachricht wurde erfolgreich übermittelt. Wir melden uns so
          schnell wie möglich persönlich bei Ihnen.
        </p>
        <span>Ihre Referenz: {reference}</span>
        <a href="/#ablauf">
          So geht die Zusammenarbeit weiter{" "}
          <ArrowUpRight size={16} aria-hidden="true" />
        </a>
      </div>
    );

  return (
    <form
      className="inquiry-form"
      method="post"
      action="/api/inquiry.php"
      onSubmit={submit}
    >
      <noscript>
        <p>
          Bitte aktivieren Sie JavaScript zum Versenden dieses Formulars oder
          schreiben Sie an{" "}
          <a href="mailto:info@tayyipuenal.de">info@tayyipuenal.de</a>.
        </p>
      </noscript>
      <p className="form-intro">
        Beschreiben Sie kurz Ihr Anliegen. Wir melden uns persönlich bei Ihnen.
        Mit * markierte Felder sind erforderlich.
      </p>
      <div className="form-grid">
        <label htmlFor={`${id}-name`}>
          Ihr Name *
          <input
            id={`${id}-name`}
            name="name"
            autoComplete="name"
            required
            maxLength={100}
            placeholder="Vor- und Nachname"
          />
        </label>
        <label htmlFor={`${id}-email`}>
          E-Mail *
          <input
            id={`${id}-email`}
            name="email"
            type="email"
            autoComplete="email"
            required
            maxLength={254}
            placeholder="name@unternehmen.de"
          />
        </label>
        <label htmlFor={`${id}-company`}>
          Unternehmen
          <input
            id={`${id}-company`}
            name="company"
            autoComplete="organization"
            maxLength={160}
            placeholder="Optional"
          />
        </label>
        <label htmlFor={`${id}-phone`}>
          Telefon
          <input
            id={`${id}-phone`}
            name="phone"
            type="tel"
            autoComplete="tel"
            maxLength={40}
            placeholder="Optional für Rückfragen"
          />
        </label>
      </div>
      <label htmlFor={`${id}-topic`}>
        Ihr Thema *
        <select id={`${id}-topic`} name="topic" defaultValue={topic} required>
          {topics.map((value) => (
            <option key={value}>{value}</option>
          ))}
        </select>
      </label>
      <label htmlFor={`${id}-message`}>
        Wobei dürfen wir Sie unterstützen? *
        <textarea
          id={`${id}-message`}
          name="message"
          rows={4}
          required
          minLength={10}
          maxLength={4000}
          defaultValue={message}
          placeholder="Ihr Ziel, Ihre Ausgangslage und ein gewünschter Zeitrahmen …"
        />
      </label>
      <div className="form-honeypot" aria-hidden="true">
        <label htmlFor={`${id}-website`}>
          Website
          <input
            id={`${id}-website`}
            name="website"
            type="text"
            tabIndex={-1}
            autoComplete="off"
          />
        </label>
      </div>
      <label className="form-consent">
        <input name="consent" type="checkbox" required value="yes" />
        <span>
          Ich habe die{" "}
          <a href="/datenschutz/" target="_blank" rel="noreferrer">
            Datenschutzhinweise
          </a>{" "}
          gelesen und bin mit der Verarbeitung meiner Angaben zur Bearbeitung
          dieser Anfrage einverstanden. *
        </span>
      </label>
      {status === "error" && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button
        className="button button-primary form-submit"
        disabled={status === "sending"}
        type="submit"
      >
        {status === "sending" ? "Wird übermittelt …" : "Anfrage absenden"}
        <ArrowUpRight size={17} aria-hidden="true" />
      </button>
      <p className="form-note">
        Direkt an info@tayyipuenal.de · Unverbindliche Anfrage
      </p>
    </form>
  );
}
