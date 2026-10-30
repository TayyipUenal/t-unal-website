import { BadgeCheck, Lock, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { bookingWeeks, dayNumber, monthLabel } from "../booking";
import { RequestForm } from "./RequestForm";
import { ACCREDITED_FROM, ACCREDITED_FROM_EUR, euro, goToBooking } from "./tools";

/* ---------- 1 Reife-Check ---------- */

const QUESTIONS: [string, string][] = [
  ["Gibt es schriftliche Abläufe für Ihre wichtigsten Prozesse?", "Wichtige Prozesse dokumentieren"],
  ["Sind Verantwortlichkeiten im Team klar geregelt und aufgeschrieben?", "Rollen und Verantwortung festlegen"],
  ["Werden Kundenbeschwerden erfasst und ausgewertet?", "Reklamationen erfassen und auswerten"],
  ["Haben Sie messbare Ziele für Qualität, Umwelt oder Arbeitsschutz?", "Messbare Ziele festlegen"],
  ["Gibt es eine aktuelle Gefährdungsbeurteilung?", "Gefährdungsbeurteilung aktualisieren"],
  ["Werden Schulungen der Mitarbeitenden nachgewiesen?", "Schulungsnachweise führen"],
  ["Haben Sie schon einmal ein internes Audit gemacht?", "Internes Audit durchführen"],
  ["Prüft die Geschäftsleitung das System mindestens einmal im Jahr?", "Managementbewertung einführen"],
];
const ANSWERS: [number, string][] = [
  [2, "Ja, vollständig"],
  [1, "Teilweise"],
  [0, "Nein"],
];

export function ReadinessCheck() {
  const [answers, setAnswers] = useState<number[]>([]);
  const step = answers.length;
  if (step < QUESTIONS.length) {
    return (
      <div className="tl-stage">
        <div className="tl-progress" aria-hidden="true">
          <i style={{ width: `${(step / QUESTIONS.length) * 100}%` }} />
        </div>
        <p className="tl-muted">
          Frage {step + 1} von {QUESTIONS.length}
        </p>
        <p className="tl-question" key={step}>
          {QUESTIONS[step][0]}
        </p>
        <div className="tl-answers">
          {ANSWERS.map(([value, label]) => (
            <button key={value} type="button" onClick={() => setAnswers([...answers, value])}>
              {label}
            </button>
          ))}
        </div>
        {step > 0 && (
          <button type="button" className="tl-link" onClick={() => setAnswers(answers.slice(0, -1))}>
            ← Zurück
          </button>
        )}
      </div>
    );
  }
  const score = Math.round((answers.reduce((a, b) => a + b, 0) / (QUESTIONS.length * 2)) * 100);
  const gaps = QUESTIONS.map(([, gap], i) => ({ gap, value: answers[i] })).filter((g) => g.value < 2);
  const level = score >= 75 ? "Fast auditreif" : score >= 45 ? "Gute Basis, einige Lücken" : "Noch ein Stück Weg";
  return (
    <div className="tl-stage tl-split">
      <ScoreRing value={score} />
      <div>
        <h3 className="tl-h3">{level}</h3>
        {gaps.length === 0 ? (
          <p className="tl-muted">Alle Grundlagen sind da. Zeit für das Zertifizierungsaudit.</p>
        ) : (
          <>
            <p className="tl-muted">
              {gaps.length} {gaps.length === 1 ? "Punkt fehlt" : "Punkte fehlen"} bis zum Audit. Die ersten {Math.min(2, gaps.length)} sehen Sie hier:
            </p>
            <ul className="tl-gaps">
              {gaps.slice(0, 2).map((g) => (
                <li key={g.gap} className={g.value === 0 ? "is-open" : ""}>
                  {g.gap}
                </li>
              ))}
            </ul>
          </>
        )}
        {gaps.length > 2 && (
          <div className="tl-locked">
            <ul className="tl-gaps tl-blur" aria-hidden="true">
              {gaps.slice(2).map((g) => (
                <li key={g.gap}>{g.gap}</li>
              ))}
            </ul>
            <p className="tl-lock-note">
              <Lock size={15} aria-hidden="true" /> Den vollständigen Lücken-Report schicken wir Ihnen per E-Mail.
            </p>
          </div>
        )}
        <RequestForm
          tool="reife"
          fields={["name"]}
          details={{ Ergebnis: `${score} %`, Einschätzung: level }}
          gaps={gaps.map((g) => `${g.gap}${g.value === 1 ? " (teilweise vorhanden)" : ""}`)}
          submit="Lücken-Report per E-Mail erhalten"
          done={
            <>
              <b>Der Report ist unterwegs.</b> Schauen Sie in Ihr Postfach.
            </>
          }
        />
        <button type="button" className="tl-link" onClick={() => setAnswers([])}>
          <RotateCcw size={14} aria-hidden="true" /> Nochmal starten
        </button>
      </div>
    </div>
  );
}

function ScoreRing({ value }: { value: number }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    let frame = 0;
    const start = performance.now();
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / 1200);
      setShown(Math.round(value * (1 - Math.pow(1 - k, 3))));
      if (k < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);
  const c = 2 * Math.PI * 90;
  return (
    <svg className="tl-ring" viewBox="0 0 220 220" role="img" aria-label={`${value} Prozent auditreif`}>
      <circle className="tl-ring-bg" cx="110" cy="110" r="90" />
      <circle className="tl-ring-fg" cx="110" cy="110" r="90" strokeDasharray={c} strokeDashoffset={c * (1 - shown / 100)} />
      <text x="110" y="122" className="tl-ring-num">
        {shown}%
      </text>
      <text x="110" y="150" className="tl-ring-label">
        auditreif
      </text>
    </svg>
  );
}

/* ---------- 2 Umsatz & Angebote ---------- */

function useAnimatedNumber(target: number) {
  const [shown, setShown] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    let frame = 0;
    const start = performance.now();
    const begin = from.current;
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / 500);
      const v = begin + (target - begin) * (1 - Math.pow(1 - k, 3));
      from.current = v;
      setShown(v);
      if (k < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target]);
  return shown;
}

function Range({ label, value, min, max, step = 1, show, onChange }: { label: string; value: number; min: number; max: number; step?: number; show: string; onChange: (v: number) => void }) {
  return (
    <label className="tl-range">
      <span>
        {label} <b>{show}</b>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

export function RevenueOffers() {
  const [tenders, setTenders] = useState(12);
  const [value, setValue] = useState(60000);
  const [rate, setRate] = useState(25);
  const [ask, setAsk] = useState(false);
  const [runs, setRuns] = useState(1);
  const [running, setRunning] = useState(0);
  const lost = (tenders * value * rate) / 100;
  const shown = useAnimatedNumber(lost);
  const months = lost > 0 ? Math.max(1, Math.ceil(ACCREDITED_FROM_EUR / (lost / 12))) : 0;
  const formRef = useRef<HTMLDivElement>(null);

  // The three offer cards fill one after another, then the best price pops. Runs on open and on every request.
  useEffect(() => {
    const timers = [1, 2, 3, 4, 5].map((stage) => setTimeout(() => setRunning(stage), 150 + 700 * (stage - 1)));
    return () => timers.forEach(clearTimeout);
  }, [runs]);

  const requestOffers = () => {
    setAsk(true);
    setRunning(0);
    setRuns((r) => r + 1);
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
  };

  return (
    <>
      <div className="tl-stage tl-split">
        <div>
          <Range label="Ausschreibungen / Anfragen pro Jahr mit ISO-Pflicht" value={tenders} min={1} max={60} show={String(tenders)} onChange={setTenders} />
          <Range label="Durchschnittlicher Auftragswert" value={value} min={5000} max={500000} step={5000} show={euro(value)} onChange={setValue} />
          <Range label="Ihre Zuschlagsquote, wenn Sie mitbieten dürften" value={rate} min={5} max={60} show={`${rate} %`} onChange={setRate} />
        </div>
        <div>
          <p className="tl-muted">Entgangener Umsatz pro Jahr ohne Zertifikat</p>
          <p className="tl-big">{euro(shown)}</p>
          <div className="tl-compare">
            <div>
              <small>Akkreditierte Zertifizierung ISO 9001</small>
              <b>ab {ACCREDITED_FROM}</b>
            </div>
            <div>
              <small>Hat sich bezahlt gemacht nach</small>
              <b>{months <= 1 ? "unter 1 Monat" : `${months} Monaten`}</b>
            </div>
          </div>
          <button type="button" className="button button-primary" onClick={requestOffers}>
            Mehrere Angebote für mich einholen →
          </button>
        </div>
      </div>

      <div className="tl-stage tl-network">
        <div className="tl-network-head">
          <div>
            <p className="tl-kicker">Mein Netzwerk für Sie</p>
            <h3 className="tl-h3">
              Ein Anruf. <em>Mehrere Angebote</em> akkreditierter Zertifizierer.
            </h3>
            <p className="tl-muted">
              Ich frage für Sie bei mehreren akkreditierten Zertifizierungsstellen aus meinem Netzwerk an. Sie bekommen die Angebote nebeneinander und entscheiden selbst. Akkreditierte ISO 9001
              bereits <b className="tl-gold">ab {ACCREDITED_FROM}</b>.
            </p>
          </div>
          <ul className="tl-ticks">
            <li>Nur akkreditierte Zertifizierungsstellen</li>
            <li>Angebote im direkten Vergleich</li>
            <li>Begleitung von der Vorbereitung bis zum Audit</li>
          </ul>
        </div>
        <div className="tl-offers">
          {["A", "B", "C"].map((letter, i) => {
            const state = running > i + 1 ? "done" : running === i + 1 ? "busy" : "";
            return (
              <div key={letter} className={`tl-offer ${state}`}>
                <span className="tl-badge">
                  <BadgeCheck size={13} aria-hidden="true" /> akkreditiert
                </span>
                <b>Zertifizierungsstelle {letter}</b>
                <span className="tl-bar">
                  <i />
                </span>
                <small>{state === "done" ? "Angebot liegt vor ✓" : state === "busy" ? "Angebot wird angefragt …" : "bereit für Ihre Anfrage"}</small>
              </div>
            );
          })}
          <div className={`tl-offer tl-best${running > 3 ? " pop" : ""}`}>
            <small>Ihr bestes Angebot</small>
            <b className="tl-best-price">ab {ACCREDITED_FROM}</b>
            <small>ISO 9001 · akkreditiert</small>
          </div>
        </div>
        <div ref={formRef}>
          {ask ? (
            <RequestForm
              tool="angebote"
              fields={["name", "company", "phone"]}
              details={{
                "Ausschreibungen pro Jahr": String(tenders),
                Auftragswert: euro(value),
                Zuschlagsquote: `${rate} %`,
                "Entgangener Umsatz": euro(lost),
              }}
              submit="Angebote anfragen"
              done={
                <>
                  <b>Danke, Ihre Anfrage ist angekommen.</b> Ich hole die Angebote ein und melde mich bei Ihnen.
                </>
              }
            />
          ) : (
            <button type="button" className="button button-primary tl-wide" onClick={requestOffers}>
              Angebote vergleichen lassen →
            </button>
          )}
        </div>
      </div>
    </>
  );
}

/* ---------- 3 Fahrplan ---------- */

/** Typical project length in weeks by company size (rough guide; SCC is a little shorter). */
const PLAN_WEEKS = { s: 10, m: 14, l: 20 } as const;
const NORMS = [
  ["ISO 9001", "ISO 9001 · Qualität"],
  ["ISO 14001", "ISO 14001 · Umwelt"],
  ["ISO 45001", "ISO 45001 · Arbeitsschutz"],
  ["SCC", "SCC · Sicherheit"],
] as const;
const longDate = (d: Date) => d.toLocaleDateString("de-DE", { day: "2-digit", month: "long", year: "numeric" });
const isoIn = (months: number) => {
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
};

export function Planner() {
  const [norm, setNorm] = useState<string>("ISO 9001");
  const [size, setSize] = useState<keyof typeof PLAN_WEEKS>("m");
  const [date, setDate] = useState(isoIn(4));
  const plan = useMemo(() => {
    const goal = new Date(`${date}T12:00:00`);
    if (Number.isNaN(goal.getTime())) return null;
    const need = PLAN_WEEKS[size] - (norm === "SCC" ? 2 : 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const available = (goal.getTime() - today.getTime()) / (7 * 86400000);
    const week = (w: number) => new Date(goal.getTime() - (need - w) * 7 * 86400000);
    const start = week(0);
    const steps: [Date, string, string][] = [
      [start, "Erstgespräch & Ist-Analyse", "1 Termin, rund 60 Minuten"],
      [week(need * 0.15), "Systemaufbau", "Prozesse, Dokumente, Verantwortungen"],
      [week(need * 0.55), "Internes Audit & Managementbewertung", "Die Generalprobe vor dem echten Audit"],
      [week(need * 0.8), "Zertifizierungsaudit", "Mit Begleitung vor Ort"],
      [goal, "Zertifikat in der Hand", "Rechtzeitig zu Ihrem Termin"],
    ];
    const verdict = available >= need + 2 ? "ok" : available >= need * 0.7 ? "tight" : "late";
    return { need, steps, verdict, start, today };
  }, [norm, size, date]);

  return (
    <div className="tl-stage tl-split tl-top">
      <div className="tl-fields">
        <label>
          Norm
          <select value={norm} onChange={(e) => setNorm(e.target.value)}>
            {NORMS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Mitarbeitende
          <select value={size} onChange={(e) => setSize(e.target.value as keyof typeof PLAN_WEEKS)}>
            <option value="s">bis 10</option>
            <option value="m">11 bis 50</option>
            <option value="l">über 50</option>
          </select>
        </label>
        <label>
          Zertifikat gebraucht bis
          <input type="date" value={date} min={isoIn(0)} onChange={(e) => setDate(e.target.value)} />
        </label>
        {plan && (
          <p className={`tl-verdict is-${plan.verdict}`}>
            {plan.verdict === "ok"
              ? `Gut machbar. Spätester Start: ${longDate(plan.start)}.`
              : plan.verdict === "tight"
                ? "Wird eng: Start möglichst jetzt, dann ist es zu schaffen."
                : `Normalerweise zu knapp (rund ${plan.need} Wochen nötig). Sprechen wir über Ihre Möglichkeiten.`}
          </p>
        )}
        <p className="tl-small">Richtwerte. Die genaue Dauer hängt von Ihrem Betrieb ab.</p>
        <RequestForm
          tool="fahrplan"
          fields={["name", "phone"]}
          details={{ Norm: norm, Mitarbeitende: { s: "bis 10", m: "11 bis 50", l: "über 50" }[size], "Zertifikat bis": date.split("-").reverse().join(".") }}
          submit="Fahrplan mit mir abstimmen"
          done={
            <>
              <b>Danke!</b> Ich melde mich bei Ihnen, um den Fahrplan abzustimmen.
            </>
          }
        />
      </div>
      {plan && (
        <ol className="tl-timeline" key={`${norm}${size}${date}`}>
          {plan.steps.map(([when, title, sub], i) => (
            <li key={title} className={i === 4 ? "is-goal" : when < plan.today ? "is-past" : ""} style={{ animationDelay: `${i * 80}ms` }}>
              <time>{longDate(when < plan.today && i < 4 ? plan.today : when)}</time>
              <b>{title}</b>
              <span>{sub}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/* ---------- 6 Countdown ---------- */

export function Countdown() {
  const [date, setDate] = useState(isoIn(7));
  const [norm, setNorm] = useState("ISO 9001");
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const end = new Date(`${date}T00:00:00`).getTime();
  const valid = !Number.isNaN(end);
  const ms = valid ? Math.max(0, end - now) : 0;
  const parts: [number, string][] = [
    [Math.floor(ms / 86400000), "Tage"],
    [Math.floor(ms / 3600000) % 24, "Std."],
    [Math.floor(ms / 60000) % 60, "Min."],
    [Math.floor(ms / 1000) % 60, "Sek."],
  ];
  const latest = valid ? new Date(end) : null;
  latest?.setMonth(latest.getMonth() - 3);
  return (
    <div className="tl-stage tl-split">
      <div className="tl-fields">
        <label>
          Norm
          <select value={norm} onChange={(e) => setNorm(e.target.value)}>
            {NORMS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Zertifikat gültig bis (steht auf dem Zertifikat)
          <input type="date" value={date} min={isoIn(0)} onChange={(e) => setDate(e.target.value)} />
        </label>
        <p className="tl-small">Wir erinnern Sie 6 und 3 Monate vorher per E-Mail. Abmelden geht mit einem Klick.</p>
        <RequestForm
          tool="countdown"
          fields={["name", "company"]}
          details={{ Norm: norm }}
          expires={date}
          submit="Rechtzeitig erinnern"
          done={
            <>
              <b>Erinnerung eingerichtet.</b> Eine Bestätigung ist per E-Mail unterwegs.
            </>
          }
        />
      </div>
      <div>
        <div className="tl-count">
          {parts.map(([n, label]) => (
            <div key={label}>
              <b>{String(n).padStart(2, "0")}</b>
              <small>{label}</small>
            </div>
          ))}
        </div>
        {latest && (
          <p className="tl-muted">
            {parts[0][0] > 120 ? (
              <>
                Die Rezertifizierung sollte bis <b className="tl-ink">{longDate(latest)}</b> geplant sein. Ideal, um jetzt Angebote zu vergleichen.
              </>
            ) : (
              <>
                <b className="tl-warn">Jetzt handeln:</b> In {parts[0][0]} Tagen ist Ihr Zertifikat nicht mehr gültig.
              </>
            )}
          </p>
        )}
      </div>
    </div>
  );
}

/* ---------- 7 Freie Termine ---------- */

export function FreeSlots() {
  const [taken, setTaken] = useState<Set<string> | null>(null);
  useEffect(() => {
    fetch("/api/booking/slots", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setTaken(new Set(d?.ok ? (d.taken as string[]) : [])))
      .catch(() => setTaken(new Set()));
  }, []);
  const weeks = useMemo(() => (taken ? bookingWeeks(taken, 4) : []), [taken]);
  const total = 5 * 14;
  return (
    <div className="tl-stage">
      <p className="tl-muted">Kostenloses Erstgespräch, 30 Minuten, per Telefon, Teams oder vor Ort. So viele Termine sind noch frei:</p>
      <div className="tl-weeks">
        {!taken && <p className="tl-muted">Termine werden geladen …</p>}
        {weeks.map((days, index) => {
          const free = days.reduce((sum, d) => sum + d.slots.length, 0);
          const first = days[0].date;
          const last = days[4].date;
          return (
            <button key={first} type="button" className="tl-week" disabled={!free} onClick={() => goToBooking(index)}>
              <small>{index === 0 ? "Diese Woche" : index === 1 ? "Nächste Woche" : `In ${index} Wochen`}</small>
              <b>
                {dayNumber(first)}.–{dayNumber(last)}. {monthLabel(last).split(" ")[0]}
              </b>
              <span className="tl-bar">
                <i style={{ width: `${Math.min(100, (free / total) * 100)}%` }} />
              </span>
              <small>{free ? `${free} freie Termine` : "keine Termine mehr"}</small>
            </button>
          );
        })}
      </div>
      <p className="tl-small">Ein Klick auf eine Woche öffnet den Kalender genau dort.</p>
    </div>
  );
}

/* ---------- 8 Checkliste ---------- */

export function Checklist() {
  return (
    <div className="tl-stage tl-split">
      <div className="tl-doc" aria-hidden="true">
        <span>Tayyip Ünal · Checkliste</span>
        <b>27 Punkte, die jeder Auditor prüft</b>
        <small>ISO 9001 · 14001 · 45001</small>
        <ul>
          <li>Kontext der Organisation bestimmt</li>
          <li>Politik festgelegt und bekannt gemacht</li>
          <li>Risiken und Chancen bewertet</li>
          <li>Kompetenzen nachgewiesen</li>
          <li>Internes Audit durchgeführt</li>
          <li>Managementbewertung vorhanden</li>
          <li className="tl-faint">… und 21 weitere</li>
        </ul>
      </div>
      <div>
        <h3 className="tl-h3">Kostenlos zum Ausdrucken</h3>
        <p className="tl-muted">Alle Punkte mit kurzer Erklärung, worauf der Auditor achtet. Wir schicken Ihnen den Link per E-Mail.</p>
        <ul className="tl-ticks">
          <li>Für ISO 9001, 14001 und 45001</li>
          <li>Zum Abhaken im Team</li>
          <li>Als PDF speicherbar</li>
        </ul>
        <RequestForm
          tool="checkliste"
          fields={["name"]}
          submit="Checkliste zusenden"
          done={
            <>
              <b>Die Checkliste ist unterwegs.</b> Schauen Sie in Ihr Postfach.
            </>
          }
        />
      </div>
    </div>
  );
}
