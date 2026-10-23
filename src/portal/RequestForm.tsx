import { CheckCircle2 } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import { api } from "./api";

const STANDARDS = ["ISO 9001", "ISO 14001", "ISO 45001", "ISO 50001", "SCC / SCP", "AZAV", "Sonstige"];
const COURSES = ["Staplerschulung", "Hebebühnenbediener", "Kranführer", "Ersthelfer", "Brandschutzhelfer", "Sicherheitsbeauftragte", "Sonstige"];

function Field({ label, wide = false, children }: { label: string; wide?: boolean; children: ReactNode }) {
  return (
    <label className={wide ? "pt-field pt-field-wide" : "pt-field"}>
      <span>{label}</span>
      {children}
    </label>
  );
}

/**
 * Application the partner fills in together with the customer, like the certification request of United Certification:
 * only the data needed for an offer. On submit it becomes a new customer; Tayyip Ünal uploads the offer later.
 */
export function RequestForm({ onDone, onCancel, disabled = false }: { onDone: () => void; onCancel: () => void; disabled?: boolean }) {
  const [category, setCategory] = useState<"zertifizierung" | "personenzertifizierung" | "arbeitssicherheit">("zertifizierung");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const value = (name: string) => String(form.get(name) ?? "");
    setBusy(true);
    setError("");
    try {
      await api("/api/partner/requests", {
        category,
        company: value("company"),
        contactName: value("contactName"),
        email: value("email"),
        phone: value("phone"),
        street: value("street"),
        city: value("city"),
        employees: value("employees"),
        sites: value("sites"),
        standards: form.getAll("standards").map(String),
        procedure: value("procedure"),
        existingSystem: value("existingSystem"),
        scope: value("scope"),
        course: value("course"),
        participants: value("participants"),
        desiredDate: value("desiredDate"),
        notes: value("notes"),
        consent: form.get("consent") === "on",
      });
      setSent(true);
      onDone();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Senden nicht möglich.");
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="pt-request-done" role="status">
        <CheckCircle2 size={28} aria-hidden="true" />
        <div>
          <h3>Antrag ist angekommen</h3>
          <p>
            Tayyip Ünal holt das beste Angebot ein und lädt es hier in Ihrem Portal hoch. Sie werden benachrichtigt, sobald es bereitliegt.
          </p>
          <button type="button" className="button button-light pt-small" onClick={() => setSent(false)}>
            Weiteren Antrag ausfüllen
          </button>
        </div>
      </div>
    );
  }

  return (
    <form className="pt-request" onSubmit={submit}>
      <div className="pt-request-intro">
        <h3>Antrag mit dem Kunden ausfüllen</h3>
        <p className="pt-hint">
          Die wichtigsten Angaben genügen. Nach dem Absenden holt Tayyip Ünal das beste Angebot ein und lädt es hier hoch. Sie werden benachrichtigt.
        </p>
      </div>

      <fieldset className="pt-segment">
        <legend>Worum geht es?</legend>
        {(
          [
            ["zertifizierung", "Zertifizierung"],
            ["personenzertifizierung", "Personenzertifizierung"],
            ["arbeitssicherheit", "Arbeitssicherheit (Grundbetreuung)"],
          ] as const
        ).map(([value, label]) => (
          <label key={value} className={category === value ? "is-on" : undefined}>
            <input type="radio" name="category" value={value} checked={category === value} onChange={() => setCategory(value)} />
            {label}
          </label>
        ))}
      </fieldset>

      <h4>Unternehmen</h4>
      <div className="pt-form">
        <Field label="Firma *">
          <input name="company" required maxLength={160} autoComplete="organization" />
        </Field>
        <Field label="Ansprechpartner *">
          <input name="contactName" required maxLength={120} autoComplete="name" />
        </Field>
        <Field label="E-Mail">
          <input name="email" type="email" maxLength={200} autoComplete="email" />
        </Field>
        <Field label="Telefon">
          <input name="phone" type="tel" maxLength={60} autoComplete="tel" />
        </Field>
        <Field label="Straße und Hausnummer">
          <input name="street" maxLength={160} autoComplete="street-address" />
        </Field>
        <Field label="PLZ und Ort">
          <input name="city" maxLength={120} />
        </Field>
        <Field label="Mitarbeitende">
          <input name="employees" type="number" min={1} max={100000} inputMode="numeric" />
        </Field>
        {category !== "personenzertifizierung" && (
          <Field label="Anzahl Standorte">
            <input name="sites" type="number" min={1} max={500} defaultValue={1} inputMode="numeric" />
          </Field>
        )}
      </div>

      {category === "zertifizierung" && (
        <>
          <h4>Zertifizierung</h4>
          <fieldset className="pt-checks">
            <legend>Normen</legend>
            {STANDARDS.map((standard) => (
              <label key={standard}>
                <input type="checkbox" name="standards" value={standard} /> {standard}
              </label>
            ))}
          </fieldset>
          <div className="pt-form">
            <Field label="Verfahren">
              <select name="procedure" defaultValue="Erstzertifizierung">
                <option>Erstzertifizierung</option>
                <option>Rezertifizierung</option>
                <option>Wechsel der Zertifizierungsstelle</option>
              </select>
            </Field>
            <Field label="Managementsystem vorhanden?">
              <select name="existingSystem" defaultValue="Nein, muss aufgebaut werden">
                <option>Nein, muss aufgebaut werden</option>
                <option>Teilweise vorhanden</option>
                <option>Ja, vollständig</option>
              </select>
            </Field>
            <Field label="Tätigkeit / Geltungsbereich" wide>
              <textarea name="scope" rows={3} maxLength={600} placeholder="Zum Beispiel Gebäudereinigung, Unterhaltsreinigung, Winterdienst" />
            </Field>
          </div>
        </>
      )}

      {category === "personenzertifizierung" && (
        <>
          <h4>Schulung und Zertifikat</h4>
          <div className="pt-form">
            <Field label="Schulung">
              <select name="course" defaultValue={COURSES[0]}>
                {COURSES.map((course) => (
                  <option key={course}>{course}</option>
                ))}
              </select>
            </Field>
            <Field label="Teilnehmende">
              <input name="participants" type="number" min={1} max={500} defaultValue={1} inputMode="numeric" />
            </Field>
          </div>
        </>
      )}

      {category === "arbeitssicherheit" && (
        <>
          <h4>Arbeitssicherheit</h4>
          <div className="pt-form">
            <Field label="Branche / Tätigkeit" wide>
              <textarea name="scope" rows={3} maxLength={600} placeholder="Zum Beispiel Sicherheitsdienst, Bau, Logistik" />
            </Field>
          </div>
          <p className="pt-hint">Für die Grundbetreuung in der Arbeitssicherheit gibt es keine Provision.</p>
        </>
      )}

      <h4>Zeitplan und Hinweise</h4>
      <div className="pt-form">
        <Field label="Wunschtermin">
          <input name="desiredDate" maxLength={40} placeholder="zum Beispiel Dezember 2026" />
        </Field>
        <Field label="Anmerkungen" wide>
          <textarea name="notes" rows={3} maxLength={2000} />
        </Field>
      </div>

      <label className="pt-right pt-consent">
        <input type="checkbox" name="consent" required />
        <span>
          <b>Der Kunde ist einverstanden,</b>
          <small>dass seine Angaben zur Erstellung eines Angebots an Tayyip Ünal weitergegeben werden.</small>
        </span>
      </label>

      {error && (
        <p className="pa-error" role="alert">
          {error}
        </p>
      )}
      <div className="pt-link-actions">
        <button className="button button-primary" disabled={busy || disabled}>
          {busy ? "Wird gesendet …" : "Absenden und Angebot anfordern"}
        </button>
        <button type="button" className="text-link" onClick={onCancel}>
          Abbrechen
        </button>
      </div>
    </form>
  );
}
