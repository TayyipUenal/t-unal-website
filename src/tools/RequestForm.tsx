import { Check } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import { sendToolRequest, type ToolRequest } from "./tools";

/**
 * Small contact form under a tool: e-mail and consent, optionally name, company and phone.
 * The tool passes what the visitor entered (details, gaps, expiry) along with it.
 */
export function RequestForm({
  tool,
  fields = [],
  details,
  gaps,
  expires,
  submit,
  done,
}: {
  tool: ToolRequest["tool"];
  fields?: ("name" | "company" | "phone")[];
  details?: Record<string, string>;
  gaps?: string[];
  expires?: string;
  submit: string;
  done: ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const text = (key: string) => String(form.get(key) ?? "").trim();
    setBusy(true);
    setError("");
    try {
      await sendToolRequest({
        tool,
        email: text("email"),
        name: text("name"),
        company: text("company"),
        phone: text("phone"),
        details,
        gaps,
        expires,
        consent: form.get("consent") === "on",
        website: text("website"),
      });
      setSent(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Das hat nicht geklappt.");
    } finally {
      setBusy(false);
    }
  }

  if (sent)
    return (
      <div className="tl-done" role="status">
        <span className="tl-done-icon">
          <Check size={20} aria-hidden="true" />
        </span>
        <div>{done}</div>
      </div>
    );

  return (
    <form className="tl-form" onSubmit={onSubmit}>
      <div className="tl-form-fields">
        {fields.includes("name") && <input name="name" required autoComplete="name" placeholder="Ihr Name" aria-label="Ihr Name" />}
        {fields.includes("company") && <input name="company" autoComplete="organization" placeholder="Firma" aria-label="Firma" />}
        <input name="email" type="email" required autoComplete="email" placeholder="E-Mail-Adresse" aria-label="E-Mail-Adresse" />
        {fields.includes("phone") && <input name="phone" type="tel" autoComplete="tel" placeholder="Telefon (optional)" aria-label="Telefon" />}
      </div>
      <input className="tl-hp" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" />
      <label className="tl-consent">
        <input type="checkbox" name="consent" required />
        <span>
          Ich bin einverstanden, dass meine Angaben zur Bearbeitung meiner Anfrage gespeichert werden. Mehr in der{" "}
          <a href="/datenschutz" target="_blank" rel="noopener">
            Datenschutzerklärung
          </a>
          .
        </span>
      </label>
      <button className="button button-primary tl-submit" disabled={busy}>
        {busy ? "Wird gesendet …" : submit}
      </button>
      {error && (
        <p className="tl-error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
