import { AnimatePresence, motion, useAnimate, useReducedMotion } from "framer-motion";
import { ArrowLeft, ArrowRight, ArrowUpRight, Check, Pencil, Send } from "lucide-react";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type PropsWithChildren,
} from "react";
import { postInquiry } from "../api";
import { useSearch } from "../hooks";
import {
  quoteSizes,
  quoteSituations,
  quoteStandards,
  quoteSteps,
  quoteTimeframes,
  standardsFromSearch,
  type QuoteChoice,
  type QuoteSelection,
} from "../quote";
import { EASE } from "../motion-tokens";
import { Kicker, Rise, Wipe } from "./motion";

const TOTAL = quoteSteps.length;
/** `standards: null` means "untouched": the URL pre-selection (if any) applies. */
type Selection = Omit<QuoteSelection, "standards"> & { standards: string[] | null };
const emptySelection: Selection = { standards: null, situation: "", size: "", timeframe: "" };
const emptyContact = { name: "", email: "", company: "", phone: "", note: "" };
type Contact = typeof emptyContact;

const listVariants = { hidden: {}, show: { transition: { staggerChildren: 0.045 } } };
const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: EASE } },
};
const cardVariants = {
  idle: { y: 0, scale: 1 },
  selected: { y: 0, scale: 1 },
  hover: { y: -3, scale: 1 },
  tap: { y: 0, scale: 0.98 },
};
const iconVariants = {
  idle: { y: 0, rotate: 0, scale: 1 },
  selected: { y: 0, rotate: 0, scale: 1 },
  hover: { y: -2, rotate: -4, scale: 1.06 },
  tap: { y: 0, rotate: 0, scale: 0.94 },
};

function OptionCard({
  choice,
  selected,
  multiple = false,
  onSelect,
}: {
  choice: QuoteChoice;
  selected: boolean;
  multiple?: boolean;
  onSelect: () => void;
}) {
  const reduced = useReducedMotion();
  const Icon = choice.icon;
  return (
    <motion.div className="quote-option-slot" variants={itemVariants}>
      <motion.button
        type="button"
        role={multiple ? "checkbox" : "radio"}
        aria-checked={selected}
        aria-label={choice.hint ? `${choice.label}: ${choice.hint}` : choice.label}
        className={`quote-option${selected ? " is-selected" : ""}`}
        onClick={onSelect}
        initial={false}
        animate={selected ? "selected" : "idle"}
        whileHover={reduced ? undefined : "hover"}
        whileTap={reduced ? undefined : "tap"}
        variants={cardVariants}
        transition={{ type: "spring", stiffness: 420, damping: 28 }}
      >
        <span className="quote-option-visual">
          <motion.span
            className="quote-option-icon"
            style={{ color: choice.tone, background: choice.tint }}
            variants={iconVariants}
          >
            <Icon strokeWidth={1.6} aria-hidden="true" />
          </motion.span>
          <AnimatePresence>
            {selected && (
              <motion.span
                className="quote-option-check"
                aria-hidden="true"
                initial={{ scale: 0, rotate: -40 }}
                animate={{ scale: 1, rotate: 0 }}
                exit={{ scale: 0, opacity: 0 }}
                transition={{ type: "spring", stiffness: 520, damping: 24 }}
              >
                <Check size={13} strokeWidth={3} />
              </motion.span>
            )}
          </AnimatePresence>
        </span>
        <span className="quote-option-text">
          <strong>{choice.label}</strong>
          {choice.hint && <small>{choice.hint}</small>}
        </span>
      </motion.button>
    </motion.div>
  );
}

function StepPanel({
  step,
  focus,
  children,
}: PropsWithChildren<{ step: number; focus: boolean }>) {
  const reduced = useReducedMotion();
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (focus) heading.current?.focus({ preventScroll: true });
  }, [focus]);
  const meta = quoteSteps[step];
  return (
    <motion.div
      className="quote-panel"
      initial={reduced ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduced ? undefined : { opacity: 0, y: -8, transition: { duration: 0.15 } }}
      transition={{ duration: 0.3, ease: EASE }}
    >
      <h3 ref={heading} tabIndex={-1}>
        {meta.title}
      </h3>
      {meta.hint && <p className="quote-hint">{meta.hint}</p>}
      {children}
    </motion.div>
  );
}

function OptionList({
  children,
  role,
  label,
  columns = 3,
}: PropsWithChildren<{ role: "group" | "radiogroup"; label: string; columns?: 3 | 4 }>) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      className={`quote-options${columns === 4 ? " is-four" : ""}`}
      role={role}
      aria-label={label}
      variants={listVariants}
      initial={reduced ? false : "hidden"}
      animate="show"
    >
      {children}
    </motion.div>
  );
}

function SuccessCheck() {
  return (
    <motion.svg
      className="quote-success-icon"
      viewBox="0 0 56 56"
      fill="none"
      aria-hidden="true"
      initial="hidden"
      animate="visible"
    >
      <motion.circle
        cx="28"
        cy="28"
        r="25"
        stroke="currentColor"
        strokeWidth="2.5"
        variants={{ hidden: { pathLength: 0 }, visible: { pathLength: 1 } }}
        transition={{ duration: 0.6, ease: "easeOut" }}
      />
      <motion.path
        d="M17 29 L25 37 L40 20"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        variants={{ hidden: { pathLength: 0 }, visible: { pathLength: 1 } }}
        transition={{ duration: 0.4, delay: 0.4, ease: "easeOut" }}
      />
    </motion.svg>
  );
}

export function QuoteConfigurator({ onConsultation }: { onConsultation: () => void }) {
  const id = useId();
  const formId = `${id}-form`;
  const reduced = useReducedMotion();
  const [step, setStep] = useState(0);
  const [navigated, setNavigated] = useState(false);
  const [chosen, setChosen] = useState<Selection>(emptySelection);
  const [contact, setContact] = useState<Contact>(emptyContact);
  const [consent, setConsent] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [status, setStatus] = useState<"idle" | "sending" | "success" | "error">("idle");
  const [error, setError] = useState("");
  const [reference, setReference] = useState("");
  const requestId = useRef<string | null>(null);
  const card = useRef<HTMLDivElement>(null);
  const successRef = useRef<HTMLDivElement>(null);
  const [shakeScope, shake] = useAnimate();
  const search = useSearch();
  const preselected = useMemo(() => standardsFromSearch(search), [search]);
  const selection: QuoteSelection = useMemo(
    () => ({ ...chosen, standards: chosen.standards ?? preselected }),
    [chosen, preselected],
  );

  // Deep links (`/#angebot`, audit pages with `?norm=`): make sure the card is in
  // view even when the anchor did not exist yet while the browser resolved the hash.
  useEffect(() => {
    if (window.location.hash !== "#angebot" || !card.current) return;
    const frame = requestAnimationFrame(() =>
      card.current?.scrollIntoView({ block: "start", behavior: "auto" }),
    );
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (status === "success") requestAnimationFrame(() => successRef.current?.focus());
  }, [status]);

  const valid = [
    selection.standards.length > 0,
    selection.situation !== "",
    selection.size !== "",
    selection.timeframe !== "",
    true,
  ][step];

  const goTo = (target: number) => {
    setNavigated(true);
    setAttempted(false);
    setStep(target);
  };
  const next = () => {
    if (!valid) {
      setAttempted(true);
      if (!reduced)
        shake(shakeScope.current, { x: [0, -10, 9, -6, 5, 0] }, { duration: 0.45, ease: "easeOut" });
      return;
    }
    goTo(Math.min(TOTAL - 1, step + 1));
  };
  const back = () => goTo(Math.max(0, step - 1));

  const toggleStandard = (value: string) =>
    setChosen((current) => {
      const active = current.standards ?? preselected;
      return {
        ...current,
        standards: active.includes(value)
          ? active.filter((item) => item !== value)
          : quoteStandards
              .map((standard) => standard.value)
              .filter((item) => item === value || active.includes(item)),
      };
    });
  const choose = (key: "situation" | "size" | "timeframe", value: string) => {
    setAttempted(false);
    setChosen((current) => ({ ...current, [key]: value }));
  };
  const updateContact =
    (key: keyof Contact) => (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setContact((current) => ({ ...current, [key]: event.target.value }));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === "sending") return;
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const website = String(new FormData(form).get("website") ?? "");
    setStatus("sending");
    setError("");
    try {
      const result = await postInquiry(
        { kind: "quote", ...selection, ...contact, website, consent: consent ? "yes" : "" },
        requestId,
      );
      setReference(result.reference);
      setStatus("success");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unbekannter Fehler.");
      setStatus("error");
    }
  }

  const reset = () => {
    requestId.current = null;
    setChosen({ ...emptySelection, standards: [] });
    setContact(emptyContact);
    setConsent(false);
    setReference("");
    setError("");
    setStatus("idle");
    setStep(0);
  };

  const finished = status === "success";
  const summary = [
    { step: 0, label: "Norm", value: selection.standards.join(" · ") },
    { step: 1, label: "Ausgangslage", value: selection.situation },
    {
      step: 2,
      label: "Mitarbeitende",
      value: quoteSizes.find((size) => size.value === selection.size)?.label ?? "",
    },
    { step: 3, label: "Zeitrahmen", value: selection.timeframe },
  ];

  return (
    <section id="audits" className="quote-section" aria-labelledby="quote-title">
      <div className="quote-heading">
        <Kicker>01 · Audit &amp; Zertifizierung</Kicker>
        <Wipe>
          <h2 id="quote-title">
            Zertifizierung planen.
            <br />
            <em>In wenigen Klicks zum Angebot.</em>
          </h2>
        </Wipe>
      </div>

      <Rise className="quote-card-wrap" delay={0.12} distance={26}>
        <span className="quote-stack quote-stack--b" aria-hidden="true" />
        <span className="quote-stack quote-stack--a" aria-hidden="true" />
        <div id="angebot" className="quote-card" ref={card}>
          <div
            className="quote-progress"
            role="progressbar"
            aria-label="Fortschritt"
            aria-valuemin={1}
            aria-valuemax={TOTAL}
            aria-valuenow={finished ? TOTAL : step + 1}
            aria-valuetext={finished ? "Abgeschlossen" : `Schritt ${step + 1} von ${TOTAL}`}
          >
            {quoteSteps.map((meta, index) => {
              const state =
                finished || index < step ? "done" : index === step ? "current" : "todo";
              return (
                <span key={meta.key} className={`quote-segment is-${state}`}>
                  <motion.i
                    initial={false}
                    animate={{ scaleX: state === "todo" ? 0 : 1 }}
                    transition={{ duration: 0.4, ease: EASE }}
                  />
                </span>
              );
            })}
          </div>

          <div className="quote-body" ref={shakeScope}>
            {finished ? (
              <motion.div
                className="quote-success"
                role="status"
                tabIndex={-1}
                ref={successRef}
                initial={reduced ? false : { opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, ease: EASE }}
              >
                <SuccessCheck />
                <h3>Vielen Dank, {contact.name.trim().split(/\s+/)[0]}.</h3>
                <p>
                  Ihre Anfrage ist eingegangen. Wir melden uns persönlich unter{" "}
                  <strong>{contact.email}</strong>.
                </p>
                <ul className="quote-summary" aria-label="Ihre Auswahl">
                  {summary.map((item) => (
                    <li key={item.label}>
                      <span>{item.label}</span>
                      <strong>{item.value}</strong>
                    </li>
                  ))}
                </ul>
                <span className="quote-reference">Referenz {reference}</span>
                <div className="quote-success-actions">
                  <a className="text-link" href="#ablauf">
                    So geht es weiter <ArrowRight size={16} aria-hidden="true" />
                  </a>
                  <button type="button" className="quote-ghost" onClick={reset}>
                    Neue Anfrage
                  </button>
                </div>
              </motion.div>
            ) : (
              <AnimatePresence mode="wait" initial={false}>
                {step === 0 && (
                  <StepPanel key="norm" step={0} focus={navigated}>
                    <OptionList role="group" label="Normen">
                      {quoteStandards.map((standard) => (
                        <OptionCard
                          key={standard.value}
                          choice={standard}
                          multiple
                          selected={selection.standards.includes(standard.value)}
                          onSelect={() => {
                            setAttempted(false);
                            toggleStandard(standard.value);
                          }}
                        />
                      ))}
                    </OptionList>
                    <p className="quote-aside">
                      Unsicher, welche Norm passt?{" "}
                      <button type="button" onClick={onConsultation}>
                        Erstgespräch anfragen
                      </button>
                    </p>
                  </StepPanel>
                )}
                {step === 1 && (
                  <StepPanel key="situation" step={1} focus>
                    <OptionList role="radiogroup" label="Ausgangslage">
                      {quoteSituations.map((situation) => (
                        <OptionCard
                          key={situation.value}
                          choice={situation}
                          selected={selection.situation === situation.value}
                          onSelect={() => choose("situation", situation.value)}
                        />
                      ))}
                    </OptionList>
                  </StepPanel>
                )}
                {step === 2 && (
                  <StepPanel key="size" step={2} focus>
                    <OptionList role="radiogroup" label="Mitarbeitende" columns={4}>
                      {quoteSizes.map((size) => (
                        <OptionCard
                          key={size.value}
                          choice={size}
                          selected={selection.size === size.value}
                          onSelect={() => choose("size", size.value)}
                        />
                      ))}
                    </OptionList>
                  </StepPanel>
                )}
                {step === 3 && (
                  <StepPanel key="timeframe" step={3} focus>
                    <OptionList role="radiogroup" label="Zeitrahmen">
                      {quoteTimeframes.map((timeframe) => (
                        <OptionCard
                          key={timeframe.value}
                          choice={timeframe}
                          selected={selection.timeframe === timeframe.value}
                          onSelect={() => choose("timeframe", timeframe.value)}
                        />
                      ))}
                    </OptionList>
                  </StepPanel>
                )}
                {step === 4 && (
                  <StepPanel key="contact" step={4} focus>
                    <ul className="quote-recap" aria-label="Ihre Auswahl">
                      {summary.map((item) => (
                        <li key={item.label}>
                          <button type="button" onClick={() => goTo(item.step)}>
                            <span>{item.label}</span>
                            <strong>{item.value}</strong>
                            <Pencil size={12} aria-hidden="true" />
                          </button>
                        </li>
                      ))}
                    </ul>
                    <form
                      id={formId}
                      className="inquiry-form quote-form"
                      method="post"
                      action="/api/inquiry.php"
                      onSubmit={submit}
                    >
                      <div className="form-grid">
                        <label htmlFor={`${id}-name`}>
                          Ihr Name *
                          <input
                            id={`${id}-name`}
                            name="name"
                            autoComplete="name"
                            required
                            minLength={2}
                            maxLength={100}
                            placeholder="Vor- und Nachname"
                            value={contact.name}
                            onChange={updateContact("name")}
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
                            value={contact.email}
                            onChange={updateContact("email")}
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
                            value={contact.company}
                            onChange={updateContact("company")}
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
                            value={contact.phone}
                            onChange={updateContact("phone")}
                          />
                        </label>
                      </div>
                      <label htmlFor={`${id}-note`}>
                        Anmerkung (optional)
                        <textarea
                          id={`${id}-note`}
                          name="note"
                          rows={2}
                          maxLength={2000}
                          placeholder="Standorte, Besonderheiten oder ein Wunschtermin …"
                          value={contact.note}
                          onChange={updateContact("note")}
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
                        <input
                          name="consent"
                          type="checkbox"
                          required
                          value="yes"
                          checked={consent}
                          onChange={(event) => setConsent(event.target.checked)}
                        />
                        <span>
                          Ich habe die{" "}
                          <a href="/datenschutz/" target="_blank" rel="noreferrer">
                            Datenschutzhinweise
                          </a>{" "}
                          gelesen und bin mit der Verarbeitung meiner Angaben zur
                          Erstellung eines Angebots einverstanden. *
                        </span>
                      </label>
                      {status === "error" && (
                        <p className="form-error" role="alert">
                          {error}
                        </p>
                      )}
                    </form>
                  </StepPanel>
                )}
              </AnimatePresence>
            )}
          </div>

          {!finished && (
            <footer className="quote-footer">
              {step > 0 ? (
                <button type="button" className="quote-back" onClick={back}>
                  <ArrowLeft size={16} aria-hidden="true" /> Zurück
                </button>
              ) : (
                <span />
              )}
              <span className="quote-footer-hint" role="alert" aria-live="assertive">
                {attempted && !valid ? "Bitte treffen Sie zuerst eine Auswahl." : ""}
              </span>
              {step < TOTAL - 1 ? (
                <button type="button" className="button button-primary quote-next" onClick={next}>
                  Weiter <ArrowRight size={17} aria-hidden="true" />
                </button>
              ) : (
                <button
                  type="submit"
                  form={formId}
                  className="button button-primary quote-next"
                  disabled={status === "sending"}
                >
                  {status === "sending" ? "Wird übermittelt …" : "Angebot anfragen"}
                  <Send size={16} aria-hidden="true" />
                </button>
              )}
            </footer>
          )}
        </div>
      </Rise>

      <Rise className="quote-links" delay={0.18}>
        <span>Mehr zu den Normen</span>
        {quoteStandards.map((standard) => (
          <a key={standard.slug} href={standard.path}>
            {standard.value} <ArrowUpRight size={14} aria-hidden="true" />
          </a>
        ))}
      </Rise>
    </section>
  );
}
