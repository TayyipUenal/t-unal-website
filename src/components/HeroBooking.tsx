import { AnimatePresence, motion, useReducedMotion, type MotionProps } from "framer-motion";
import { ArrowLeft, CalendarCheck, ChevronLeft, ChevronRight, Clock, MapPin, Phone, Video } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { BOOKING_FORMATS, BOOKING_TOPICS, bookingWeeks, dayLong, dayNumber, monthLabel, weekdayShort } from "../booking";

type Step = "pick" | "form" | "done";
const FORMAT_ICON = { Telefon: Phone, "Microsoft Teams": Video, "Vor Ort": MapPin } as const;

/**
 * Appointment calendar in the hero: pick a weekday, a free time, then name and contact.
 * Taken times come from /api/booking/slots; the worker checks the slot again on booking.
 */
export function HeroBooking() {
  const reduce = useReducedMotion();
  const [taken, setTaken] = useState<Set<string>>(new Set());
  const [week, setWeek] = useState(0);
  const [day, setDay] = useState<string | null>(null);
  const [slot, setSlot] = useState<string | null>(null);
  const [step, setStep] = useState<Step>("pick");
  const [format, setFormat] = useState<(typeof BOOKING_FORMATS)[number]>("Telefon");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmed, setConfirmed] = useState("");

  const loadTaken = () =>
    fetch("/api/booking/slots", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => d?.ok && setTaken(new Set(d.taken as string[])))
      .catch(() => {});
  useEffect(() => {
    loadTaken();
  }, []);

  const weeks = useMemo(() => bookingWeeks(taken), [taken]);
  const firstOpen = weeks.findIndex((w) => w.some((d) => d.slots.length));
  useEffect(() => {
    if (day === null && firstOpen >= 0) {
      setWeek(firstOpen);
      setDay(weeks[firstOpen].find((d) => d.slots.length)?.date ?? null);
    }
  }, [firstOpen, weeks, day]);

  // The "Freie Termine" tool asks for a week: jump there and pick its first open day.
  useEffect(() => {
    const onWeek = (event: Event) => {
      const index = (event as CustomEvent<number>).detail;
      if (!weeks[index]) return;
      setWeek(index);
      setDay(weeks[index].find((d) => d.slots.length)?.date ?? null);
      setSlot(null);
      setStep("pick");
    };
    window.addEventListener("booking:week", onWeek);
    return () => window.removeEventListener("booking:week", onWeek);
  }, [weeks]);

  const days = weeks[week] ?? [];
  const open = days.find((d) => d.date === day)?.slots ?? [];
  const lastWeek = weeks.length - 1;

  const motionProps: MotionProps = reduce
    ? {}
    : { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -8 }, transition: { duration: 0.28, ease: [0.22, 1, 0.36, 1] } };

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/booking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slot,
          format,
          name: form.get("name"),
          company: form.get("company"),
          email: form.get("email"),
          phone: form.get("phone"),
          topic: form.get("topic"),
          note: form.get("note"),
          website: form.get("website"),
          consent: form.get("consent") === "on",
        }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.ok) {
        if (response.status === 409) {
          await loadTaken();
          setSlot(null);
          setStep("pick");
        }
        throw new Error(result?.error || "Die Buchung hat nicht geklappt. Bitte versuchen Sie es erneut.");
      }
      setConfirmed(result.when ?? "");
      setStep("done");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Die Buchung hat nicht geklappt.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="hb" id="termin" aria-labelledby="hb-title">
      <div className="hb-head">
        <span className="hb-icon" aria-hidden="true">
          <CalendarCheck size={20} strokeWidth={1.7} />
        </span>
        <div>
          <p className="hb-kicker">Termin buchen</p>
          <h2 id="hb-title">Kostenloses Erstgespräch</h2>
        </div>
        <span className="hb-duration">
          <Clock size={14} aria-hidden="true" /> 30 Min.
        </span>
      </div>

      <AnimatePresence mode="wait" initial={false}>
        {step === "pick" && (
          <motion.div key="pick" className="hb-body" {...motionProps}>
            <div className="hb-month">
              <button type="button" aria-label="Vorherige Woche" disabled={week === 0} onClick={() => setWeek(week - 1)}>
                <ChevronLeft size={18} />
              </button>
              <span>{days[0] && monthLabel(days[0].date)}</span>
              <button type="button" aria-label="Nächste Woche" disabled={week >= lastWeek} onClick={() => setWeek(week + 1)}>
                <ChevronRight size={18} />
              </button>
            </div>

            <div className="hb-days" role="listbox" aria-label="Tag wählen">
              {days.map((d) => {
                const free = d.slots.length;
                return (
                  <button
                    key={d.date}
                    type="button"
                    role="option"
                    aria-selected={day === d.date}
                    disabled={!free}
                    className={day === d.date ? "is-active" : ""}
                    onClick={() => setDay(d.date)}
                  >
                    <small>{weekdayShort(d.date)}</small>
                    <strong>{dayNumber(d.date)}</strong>
                    <i aria-hidden="true">{free ? Array.from({ length: Math.min(3, Math.ceil(free / 5)) }, (_, i) => <b key={i} />) : null}</i>
                  </button>
                );
              })}
            </div>

            <p className="hb-label">{day && open.length ? dayLong(day) : "Bitte einen freien Tag wählen"}</p>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={`${week}-${day}`} className="hb-times" {...(reduce ? {} : { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0.18 } })}>
                {(days.some((d) => d.date === day) ? open : []).map((s, i) => (
                  <motion.button
                    key={s}
                    type="button"
                    {...(reduce ? {} : { initial: { opacity: 0, y: 6 }, animate: { opacity: 1, y: 0 }, transition: { delay: i * 0.025, duration: 0.22 } })}
                    onClick={() => {
                      setSlot(s);
                      setError("");
                      setStep("form");
                    }}
                  >
                    {s.slice(11)}
                  </motion.button>
                ))}
              </motion.div>
            </AnimatePresence>
          </motion.div>
        )}

        {step === "form" && slot && (
          <motion.form key="form" className="hb-body hb-form" onSubmit={submit} {...motionProps}>
            <button type="button" className="hb-back" onClick={() => setStep("pick")}>
              <ArrowLeft size={16} aria-hidden="true" /> {dayLong(slot.slice(0, 10))}, {slot.slice(11)} Uhr
            </button>

            <div className="hb-formats" role="radiogroup" aria-label="Art des Gesprächs">
              {BOOKING_FORMATS.map((f) => {
                const Icon = FORMAT_ICON[f];
                return (
                  <button key={f} type="button" role="radio" aria-checked={format === f} className={format === f ? "is-active" : ""} onClick={() => setFormat(f)}>
                    <Icon size={16} aria-hidden="true" /> {f === "Microsoft Teams" ? "Teams" : f}
                  </button>
                );
              })}
            </div>

            <div className="hb-grid">
              <input name="name" required maxLength={120} placeholder="Name *" autoComplete="name" />
              <input name="company" maxLength={160} placeholder="Firma" autoComplete="organization" />
              <input name="email" type="email" required maxLength={200} placeholder="E-Mail *" autoComplete="email" />
              <input name="phone" type="tel" required={format === "Telefon"} maxLength={60} placeholder={format === "Telefon" ? "Telefon *" : "Telefon"} autoComplete="tel" />
              <select name="topic" defaultValue="ISO 9001" aria-label="Thema">
                {BOOKING_TOPICS.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
              <input name="note" maxLength={1000} placeholder="Kurz zum Anliegen (optional)" />
            </div>
            <input className="hb-trap" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" />

            <label className="hb-consent">
              <input type="checkbox" name="consent" required />
              <span>
                Ich bin mit der Verarbeitung meiner Angaben zur Terminvereinbarung einverstanden (
                <a href="/datenschutz/" target="_blank" rel="noreferrer">
                  Datenschutz
                </a>
                ).
              </span>
            </label>

            {error && <p className="hb-error" role="alert">{error}</p>}
            <button type="submit" className="button button-primary hb-submit" disabled={busy}>
              {busy ? "Wird gebucht …" : "Termin verbindlich buchen"}
            </button>
          </motion.form>
        )}

        {step === "done" && (
          <motion.div key="done" className="hb-body hb-done" {...motionProps}>
            <svg viewBox="0 0 52 52" aria-hidden="true">
              <circle cx="26" cy="26" r="24" />
              <path d="M15 27l7 7 15-16" />
            </svg>
            <h3>Termin gebucht</h3>
            <p>{confirmed}</p>
            <p className="hb-hint">Die Bestätigung mit Kalendereintrag ist unterwegs in Ihr Postfach.</p>
            <button
              type="button"
              className="text-link"
              onClick={() => {
                setSlot(null);
                setDay(null);
                loadTaken();
                setStep("pick");
              }}
            >
              Weiteren Termin buchen
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
