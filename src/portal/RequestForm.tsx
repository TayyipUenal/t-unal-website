import { CheckCircle2 } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import { api } from "./api";
import { AREAS, type AreaKey } from "./areas";

/* What we ask per area. Kept short: only what is needed for a first offer. */

const STANDARDS = [
  "ISO 9001",
  "ISO 14001",
  "ISO 45001",
  "ISO 27001",
  "ISO 50001",
  "ISO 3834",
  "ISO 13485",
  "ISO 22000",
  "ISO 20000",
  "SCC*",
  "SCC**",
  "SCC P",
  "SCP",
  "AZAV",
];

const COURSES = [
  "Gabelstapler",
  "Kranführer",
  "Hubarbeitsbühne",
  "Erdbaumaschinen",
  "Erste Hilfe",
  "Brandschutzhelfer",
  "Sicherheitsbeauftragte",
  "SCC Dok. 016 (Personaldienstleister)",
  "SCC Dok. 017 (Führungskräfte)",
  "SCC Dok. 018 (Mitarbeitende)",
  "Ladungssicherung",
  "PSA gegen Absturz",
  "Auditoren-Qualifizierung",
  "Digitale Unterweisungen",
];

const SAFETY_SERVICES = [
  "Arbeitsmittelprüfung (DGUV V3 / Leitern / Regale)",
  "Arbeitsmedizin / Betriebsarzt",
  "Gefährdungsbeurteilung",
  "Brandschutz",
  "SiGeKo nach BaustellV",
  "HSE Officer",
  "Aufbau Managementsystem",
];

const INDUSTRIES = [
  "Bauhauptgewerbe (Hoch- und Tiefbau)",
  "Ausbau und Handwerk (Maler, Trockenbau, Dach …)",
  "Elektro und Gebäudetechnik",
  "Sanitär, Heizung, Klima",
  "Metallbau und Stahlbau",
  "Schweißtechnik",
  "Maschinen- und Anlagenbau",
  "Produktion und Industrie",
  "Kunststoff und Chemie",
  "Automotive und Kfz-Werkstatt",
  "Lebensmittel und Getränke",
  "Gastronomie und Hotellerie",
  "Einzelhandel",
  "Großhandel",
  "Logistik, Transport und Spedition",
  "Lager und Umschlag",
  "Gebäudereinigung und Gebäudedienste",
  "Facility Management und Hausmeisterdienste",
  "Sicherheitsdienst und Bewachung",
  "Personaldienstleistung und Zeitarbeit",
  "Industrieservice und Montage",
  "Energie und Versorgung",
  "Entsorgung und Recycling",
  "Garten- und Landschaftsbau",
  "Landwirtschaft",
  "Gesundheit, Pflege und Arztpraxen",
  "Medizinprodukte",
  "Bildung, Schulungen und Soziales",
  "Öffentliche Verwaltung",
  "IT, Software und Telekommunikation",
  "Immobilien und Hausverwaltung",
  "Finanzen und Versicherung",
  "Beratung und Dienstleistung",
  "Medien, Werbung und Agentur",
  "Veranstaltungen und Messebau",
  "Sonstige Branche",
];

const WEB_FEATURES = ["Kontaktformular", "Mehrsprachig", "Terminbuchung", "Onlineshop", "SEO", "Pflege und Hosting"];

function Field({ label, wide = false, children }: { label: string; wide?: boolean; children: ReactNode }) {
  return (
    <label className={wide ? "pt-field pt-field-wide" : "pt-field"}>
      <span>{label}</span>
      {children}
    </label>
  );
}

function Checks({ legend, name, options }: { legend: string; name: string; options: string[] }) {
  return (
    <fieldset className="pt-checks">
      <legend>{legend}</legend>
      {options.map((option) => (
        <label key={option}>
          <input type="checkbox" name={name} value={option} /> {option}
        </label>
      ))}
    </fieldset>
  );
}

/** Courses with a participant count each; ticking a course reveals its count. */
function CoursePicker() {
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  return (
    <fieldset className="pt-courses">
      <legend>Schulungen und Prüfungen</legend>
      {COURSES.map((course) => (
        <div key={course} className={picked[course] ? "is-on" : undefined}>
          <label>
            <input type="checkbox" name="courses" value={course} onChange={(event) => setPicked({ ...picked, [course]: event.target.checked })} /> {course}
          </label>
          {picked[course] && (
            <input name={`count:${course}`} type="number" min={1} max={500} defaultValue={1} aria-label={`Teilnehmende ${course}`} inputMode="numeric" />
          )}
        </div>
      ))}
    </fieldset>
  );
}

function AreaFields({ area }: { area: AreaKey }) {
  switch (area) {
    case "zertifizierung":
      return (
        <>
          <Checks legend="Normen" name="standards" options={STANDARDS} />
          <div className="pt-form">
            <Field label="Andere Norm">
              <input name="otherStandard" maxLength={80} />
            </Field>
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
            <Field label="Unterstützung beim Aufbau gewünscht?">
              <select name="consulting" defaultValue="Ja">
                <option>Ja</option>
                <option>Nein</option>
                <option>Noch offen</option>
              </select>
            </Field>
            <Field label="Tätigkeit / Geltungsbereich" wide>
              <textarea name="scope" rows={3} maxLength={600} placeholder="Zum Beispiel Gebäudereinigung, Unterhaltsreinigung, Winterdienst" />
            </Field>
          </div>
        </>
      );
    case "personenzertifizierung":
      return (
        <>
          <CoursePicker />
          <div className="pt-form">
            <Field label="Andere Schulung">
              <input name="otherCourse" maxLength={120} />
            </Field>
            <Field label="Ort der Schulung">
              <select name="location" defaultValue="Beim Kunden vor Ort">
                <option>Beim Kunden vor Ort</option>
                <option>In unseren Räumen</option>
                <option>Online, wo möglich</option>
                <option>Egal</option>
              </select>
            </Field>
            <Field label="Sprache der Teilnehmenden">
              <input name="language" maxLength={80} placeholder="Deutsch, Türkisch, Englisch …" />
            </Field>
          </div>
        </>
      );
    case "arbeitsschutz":
      return (
        <>
          <Checks legend="Leistungen" name="services" options={SAFETY_SERVICES} />
          <div className="pt-form">
            <Field label="Tätigkeit genauer" wide>
              <textarea name="scope" rows={3} maxLength={600} placeholder="Was genau macht der Betrieb?" />
            </Field>
          </div>
        </>
      );
    case "arbeitssicherheit":
      return (
        <>
          <div className="pt-form">
            <Field label="Tätigkeit genauer" wide>
              <textarea name="scope" rows={3} maxLength={600} placeholder="Was genau macht der Betrieb?" />
            </Field>
            <Field label="Bisher betreut?">
              <select name="currentProvider" defaultValue="Nein">
                <option>Nein</option>
                <option>Ja, Wechsel gewünscht</option>
              </select>
            </Field>
          </div>
          <p className="pt-hint">Für die Grundbetreuung in der Arbeitssicherheit gibt es keine Provision.</p>
        </>
      );
    case "webseiten":
      return (
        <>
          <div className="pt-form">
            <Field label="Art des Projekts">
              <select name="webType" defaultValue="Neue Website">
                <option>Neue Website</option>
                <option>Relaunch einer bestehenden Website</option>
                <option>Onlineshop</option>
                <option>Landingpage</option>
              </select>
            </Field>
            <Field label="Bestehende Website / Domain">
              <input name="currentSite" maxLength={200} placeholder="www.beispiel.de" />
            </Field>
            <Field label="Ungefähre Seitenzahl">
              <input name="pages" type="number" min={1} max={500} inputMode="numeric" />
            </Field>
            <Field label="Budgetrahmen">
              <input name="budget" maxLength={60} placeholder="zum Beispiel 2.000 bis 4.000 €" />
            </Field>
          </div>
          <Checks legend="Gewünschte Funktionen" name="features" options={WEB_FEATURES} />
        </>
      );
  }
}

/** Human-readable label for every field the form can send (order = order in the offer request). */
const LABELS: [string, string][] = [
  ["industry", "Branche"],
  ["street", "Straße"],
  ["city", "PLZ und Ort"],
  ["employees", "Mitarbeitende"],
  ["sites", "Standorte"],
  ["standards", "Normen"],
  ["otherStandard", "Andere Norm"],
  ["procedure", "Verfahren"],
  ["existingSystem", "Managementsystem vorhanden"],
  ["consulting", "Unterstützung beim Aufbau"],
  ["courses", "Schulungen"],
  ["otherCourse", "Andere Schulung"],
  ["location", "Ort der Schulung"],
  ["language", "Sprache"],
  ["services", "Leistungen"],
  ["devices", "Arbeitsplätze / Geräte"],
  ["itProvider", "Externer IT-Dienstleister"],
  ["currentProvider", "Bisher betreut"],
  ["revenue", "Jahresumsatz"],
  ["debtors", "Anzahl Debitoren"],
  ["invoiceSize", "Durchschnittliche Rechnungshöhe"],
  ["paymentTerms", "Zahlungsziel"],
  ["customerType", "Kunden überwiegend"],
  ["webType", "Art des Projekts"],
  ["currentSite", "Bestehende Website"],
  ["pages", "Seitenzahl"],
  ["budget", "Budget"],
  ["features", "Funktionen"],
  ["scope", "Tätigkeit / Geltungsbereich"],
  ["timing", "Zeitrahmen"],
  ["desiredDate", "Fester Termin"],
  ["notes", "Anmerkungen"],
];

/** Collects the filled fields as label → text; courses carry their participant count. */
function collect(form: FormData) {
  const details: Record<string, string> = {};
  for (const [name, label] of LABELS) {
    let value: string;
    if (name === "courses") {
      value = form
        .getAll("courses")
        .map((course) => `${course} (${form.get(`count:${course}`) || 1} TN)`)
        .join(", ");
    } else if (["standards", "services", "features"].includes(name)) {
      value = form.getAll(name).map(String).join(", ");
    } else {
      value = String(form.get(name) ?? "").trim();
    }
    if (value) details[label] = value;
  }
  return details;
}

/** Short subject line for the customer list, e.g. "ISO 9001, ISO 45001" or "Gabelstapler, Erste Hilfe". */
function subject(area: AreaKey, form: FormData) {
  const list = (name: string) => form.getAll(name).map(String);
  const parts =
    area === "zertifizierung"
      ? [...list("standards"), String(form.get("otherStandard") ?? "")]
      : area === "personenzertifizierung"
        ? [...list("courses"), String(form.get("otherCourse") ?? "")]
        : area === "arbeitsschutz"
          ? list("services")
          : area === "webseiten"
            ? [String(form.get("webType") ?? "")]
            : [];
  const label = AREAS.find((item) => item.key === area)?.label ?? "";
  const text = parts.filter(Boolean).join(", ");
  return `Antrag ${label}${text ? `: ${text}` : ""}`.slice(0, 80);
}

/**
 * Application the partner fills in together with the customer, like the certification request of United Certification:
 * only the data needed for an offer. On submit it becomes a new customer; Tayyip Ünal uploads the best offer later.
 */
export function RequestForm({ onDone, onCancel, disabled = false }: { onDone: () => void; onCancel: () => void; disabled?: boolean }) {
  const [area, setArea] = useState<AreaKey>("zertifizierung");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const hasSites = area === "zertifizierung" || area === "arbeitsschutz" || area === "arbeitssicherheit";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      await api("/api/partner/requests", {
        category: area,
        topic: subject(area, form),
        company: String(form.get("company") ?? ""),
        contactName: String(form.get("contactName") ?? ""),
        email: String(form.get("email") ?? ""),
        phone: String(form.get("phone") ?? ""),
        details: collect(form),
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
          <p>Tayyip Ünal holt das beste Angebot ein und lädt es hier in Ihrem Portal hoch. Sie werden benachrichtigt, sobald es bereitliegt.</p>
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

      <fieldset className="pt-areas">
        <legend>Worum geht es?</legend>
        {AREAS.map((item) => (
          <label key={item.key} className={area === item.key ? "is-on" : undefined}>
            <input type="radio" name="area" value={item.key} checked={area === item.key} onChange={() => setArea(item.key)} />
            <b>{item.label}</b>
            <small>{item.short}</small>
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
        <Field label="Branche *">
          <select name="industry" required defaultValue="">
            <option value="" disabled>
              Bitte wählen
            </option>
            {INDUSTRIES.map((industry) => (
              <option key={industry}>{industry}</option>
            ))}
          </select>
        </Field>
        <Field label="Mitarbeitende">
          <input name="employees" type="number" min={1} max={100000} inputMode="numeric" />
        </Field>
        {hasSites && (
          <Field label="Anzahl Standorte">
            <input name="sites" type="number" min={1} max={500} defaultValue={1} inputMode="numeric" />
          </Field>
        )}
      </div>

      <h4>{AREAS.find((item) => item.key === area)?.label}</h4>
      <div className="pt-area-fields" key={area}>
        <AreaFields area={area} />
      </div>

      <h4>Zeitplan und Hinweise</h4>
      <div className="pt-form">
        <Field label="Wann soll es losgehen?">
          <select name="timing" defaultValue="In den nächsten 1–3 Monaten">
            <option>So schnell wie möglich</option>
            <option>In den nächsten 1–3 Monaten</option>
            <option>In 3–6 Monaten</option>
            <option>In 6–12 Monaten</option>
            <option>Noch offen, erst informieren</option>
          </select>
        </Field>
        <Field label="Fester Termin (falls vorhanden)">
          <input name="desiredDate" type="date" />
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
