import { Check, Copy, LogOut, Mail, Plus, ShieldCheck } from "lucide-react";
import qrcode from "qrcode-generator";
import { WhatsAppIcon } from "../components/WhatsAppIcon";
import { contact } from "../content";
import { DownloadsAdmin, FileLinks, OfferUpload, PartnerDownloads } from "./Files";
import { AREAS, areaHint, areaLabel, noCommission } from "./areas";
import { PARTNER_PAGES } from "./features";
import { Kpis } from "./Kpis";
import { Visits } from "./Visits";
import { RequestForm } from "./RequestForm";
import { PartnerMonths } from "./PartnerMonths";
import { PartnerTree } from "./Tree";
import { Fragment, useCallback, useEffect, useState, type FormEvent } from "react";
import {
  api,
  dateDe,
  euro,
  setPageMeta,
  STATUS_LABEL,
  STATUS_ORDER,
  PARTNER_RIGHTS,
  STAFF_RIGHTS,
  type AdminLead,
  type AdminPartner,
  type LeadEvent,
  type LeadStatus,
  type PartnerLead,
  type Perms,
  type StaffMember,
  type FileInfo,
  type Summary,
  type User,
} from "./api";

/* ---------- small shared pieces ---------- */

function StatusPill({ status }: { status: LeadStatus }) {
  return <span className={`pa-pill is-${status}`}>{STATUS_LABEL[status]}</span>;
}

/** Four steps from "Eingegangen" to "Auftrag erhalten"; lost leads show a muted bar. */
function Progress({ status }: { status: LeadStatus }) {
  const steps: LeadStatus[] = ["new", "contacted", "offer", "won"];
  const at = status === "lost" ? -1 : steps.indexOf(status);
  return (
    <span className={status === "lost" ? "pt-progress is-lost" : "pt-progress"} aria-hidden="true">
      {steps.map((step, index) => (
        <i key={step} className={index <= at ? "is-on" : undefined} />
      ))}
    </span>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="pt-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function useCopy() {
  const [copied, setCopied] = useState("");
  const copy = (text: string) => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(text);
      window.setTimeout(() => setCopied(""), 1800);
    });
  };
  return { copied, copy };
}

/* ---------- login ---------- */

function Login({ onUser }: { onUser: (user: User) => void }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      const result = await api<{ user: User }>("/api/auth/login", { email: data.get("email"), password: data.get("password") });
      onUser(result.user);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Anmeldung nicht möglich.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="pt-auth">
      <form onSubmit={submit} className="pt-card pt-login">
        <p className="pt-eyebrow">Partnerportal</p>
        <h1>Anmelden</h1>
        <Field label="E-Mail">
          <input name="email" type="email" required autoComplete="username" />
        </Field>
        <Field label="Passwort">
          <input name="password" type="password" required autoComplete="current-password" />
        </Field>
        {error && (
          <p className="pa-error" role="alert">
            {error}
          </p>
        )}
        <button className="button button-primary" disabled={busy}>
          {busy ? "Einen Moment …" : "Anmelden"}
        </button>
        <p className="pt-hint">
          Noch kein Zugang? <a href="/partner-werden">Jetzt Partner werden</a>
        </p>
      </form>
    </section>
  );
}

/* ---------- history and sharing ---------- */

/** Vertical history of a customer: arrival, status changes and notes. */
function Timeline({ created, events, internalLabels = false }: { created: string; events: LeadEvent[] | null; internalLabels?: boolean }) {
  return (
    <ol className="pt-timeline">
      <li>
        <b>Eingegangen</b>
        <time>{dateDe(created)}</time>
      </li>
      {events === null && <li className="is-muted">Wird geladen …</li>}
      {(events ?? []).map((event, index) => (
        <li key={index} className={event.kind === "note" ? "is-note" : undefined}>
          {event.kind === "status" && event.status ? (
            <b>{STATUS_LABEL[event.status]}</b>
          ) : (
            <span>
              {event.note}
              {internalLabels && event.visible === 0 && <em> · intern</em>}
            </span>
          )}
          <time>{dateDe(event.created_at)}</time>
        </li>
      ))}
    </ol>
  );
}

/** QR code for a link, drawn as inline SVG so it prints sharp. */
function QrCode({ value }: { value: string }) {
  const code = qrcode(0, "M");
  code.addData(value);
  code.make();
  const svg = code.createSvgTag({ cellSize: 6, margin: 3, scalable: true });
  const download = () => {
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "empfehlung-qr.svg";
    link.click();
    URL.revokeObjectURL(link.href);
  };
  return (
    <div className="pt-qr">
      <div className="pt-qr-code" role="img" aria-label="QR-Code zu Ihrer Partnerseite" dangerouslySetInnerHTML={{ __html: svg }} />
      <button type="button" className="text-link" onClick={download}>
        Als Datei speichern
      </button>
    </div>
  );
}

/* ---------- partner dashboard ---------- */

const pct = (value: number) => String(value).replace(".", ",");

/** Provision of one customer: expected while open, then waiting for the customer's payment, due, paid out. */
function ProvisionCell({ lead, rate }: { lead: PartnerLead; rate: number | null }) {
  const used = lead.commission_rate ?? rate;
  if (noCommission(lead.category)) return <small>keine Provision</small>;
  if (lead.commission_cents !== null) {
    const state = lead.commission_status === "paid" ? "ausgezahlt" : lead.customer_paid_at ? "fällig, wird ausgezahlt" : "wartet auf Zahlung des Kunden";
    return (
      <>
        <b>{euro(lead.commission_cents)}</b>
        <small>
          {used !== null && `${pct(used)} % vom Nettobetrag · `}
          {state}
        </small>
      </>
    );
  }
  if (lead.status === "lost" || used === null) return <small>–</small>;
  if (lead.deal_cents) return <small>voraussichtlich {euro(Math.round((lead.deal_cents * used) / 100))} ({pct(used)} %), sobald der Auftrag erteilt ist</small>;
  return <small>{pct(used)} % vom Nettobetrag bei Auftrag</small>;
}

function StatusCell({ lead, showPayment }: { lead: PartnerLead; showPayment: boolean }) {
  if (!lead.status) return null;
  const note =
    lead.status === "offer"
      ? "Angebot liegt vor, noch nicht unterschrieben"
      : lead.status === "won" && showPayment
        ? lead.customer_paid_at
          ? "Kunde hat bezahlt"
          : "Auftrag erteilt, Rechnung noch offen"
        : "";
  return (
    <>
      <StatusPill status={lead.status} />
      <Progress status={lead.status} />
      {note && <small>{note}</small>}
    </>
  );
}

/** One area (Zertifizierung / Personenzertifizierung) with its customers. */
function LeadGroup({
  category,
  leads,
  can,
  rate,
  openLead,
  onToggle,
  events,
}: {
  category: string;
  leads: PartnerLead[];
  can: Perms;
  rate: number | null;
  openLead: number | null;
  onToggle: (id: number) => void;
  events: Record<number, LeadEvent[]>;
}) {
  const offers = leads.filter((l) => l.status === "offer").length;
  const won = leads.filter((l) => l.status === "won").length;
  return (
    <section className="pt-card pt-table-card pt-group">
      <div className="pt-table-head">
        <div>
          <h2>{areaLabel(category)}</h2>
          {areaHint(category) && <p className="pt-hint">{areaHint(category)}</p>}
        </div>
        {can.seeStatus && leads.length > 0 && (
          <p className="pt-group-count">
            {leads.length} {leads.length === 1 ? "Kunde" : "Kunden"}
            {offers > 0 && (offers === 1 ? " · 1 Angebot läuft" : ` · ${offers} Angebote laufen`)}
            {won > 0 && ` · ${won} beauftragt`}
          </p>
        )}
      </div>
      {leads.length === 0 ? (
        <p className="pt-empty">Noch keine Kunden in diesem Bereich.</p>
      ) : (
        <div className="pt-scroll pt-cards-mobile">
          <table className="pt-table">
            <thead>
              <tr>
                <th>Kunde</th>
                <th>Angebotene Leistung</th>
                {can.seeStatus && <th>Stand</th>}
                {can.seeAmounts && <th>Wert (netto)</th>}
                {(can.seeAmounts || can.seeRate) && <th>Ihre Provision</th>}
                <th>Seit</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => (
                <Fragment key={lead.id}>
                  <tr>
                    <td>
                      <b>{lead.company || lead.contact_name}</b>
                      <small>{lead.company ? lead.contact_name : lead.email || lead.phone}</small>
                      <FileLinks files={lead.files ?? []} />
                      <button type="button" className="text-link" onClick={() => onToggle(lead.id)}>
                        {openLead === lead.id ? "Verlauf schließen" : "Verlauf"}
                      </button>
                    </td>
                    <td data-label="Leistung">{lead.topic || "–"}</td>
                    {can.seeStatus && (
                      <td data-label="Stand">
                        <StatusCell lead={lead} showPayment={can.seeAmounts} />
                      </td>
                    )}
                    {can.seeAmounts && <td data-label="Wert (netto)">{euro(lead.deal_cents)}</td>}
                    {(can.seeAmounts || can.seeRate) && (
                      <td data-label="Ihre Provision">
                        <ProvisionCell lead={lead} rate={rate} />
                      </td>
                    )}
                    <td data-label="Seit">{dateDe(lead.created_at)}</td>
                  </tr>
                  {openLead === lead.id && (
                    <tr>
                      <td colSpan={6}>
                        <Timeline created={lead.created_at} events={events[lead.id] ?? null} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

type PartnerPreview = { summary: Summary; leads: PartnerLead[]; events: Record<number, LeadEvent[]>; downloads?: FileInfo[] };

function PartnerDashboard({ user, preview, onExit }: { user: User; preview?: PartnerPreview; onExit?: () => void }) {
  const [summary, setSummary] = useState<Summary | null>(preview?.summary ?? null);
  const [leads, setLeads] = useState<PartnerLead[] | null>(preview?.leads ?? null);
  const [form, setForm] = useState(false);
  const [request, setRequest] = useState(false);
  const [error, setError] = useState("");
  const [bio, setBio] = useState(user.bio);
  const [bioSaved, setBioSaved] = useState(false);
  const { copied, copy } = useCopy();
  const [qr, setQr] = useState(false);
  const [openLead, setOpenLead] = useState<number | null>(null);
  const [leadEvents, setLeadEvents] = useState<Record<number, LeadEvent[]>>({});
  const toggleLead = (id: number) => {
    setOpenLead((current) => (current === id ? null : id));
    if (preview) {
      setLeadEvents((all) => ({ ...all, [id]: preview.events[id] ?? [] }));
      return;
    }
    api<{ events: LeadEvent[] }>(`/api/partner/leads/${id}/events`)
      .then((result) => setLeadEvents((all) => ({ ...all, [id]: result.events })))
      .catch(() => setLeadEvents((all) => ({ ...all, [id]: [] })));
  };

  const load = useCallback(() => {
    if (preview) return;
    Promise.all([api<Summary>("/api/partner/summary"), api<{ leads: PartnerLead[] }>("/api/partner/leads")])
      .then(([s, l]) => {
        setSummary(s);
        setLeads(l.leads);
      })
      .catch(() => setError("Die Daten konnten nicht geladen werden."));
  }, [preview]);
  useEffect(() => {
    load();
  }, [load]);

  async function addLead(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formEl = event.currentTarget;
    const data = new FormData(formEl);
    setError("");
    try {
      await api("/api/partner/leads", Object.fromEntries(data.entries()));
      formEl.reset();
      setForm(false);
      load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Speichern nicht möglich.");
    }
  }

  async function saveBio() {
    await api("/api/partner/profile", { bio, company: user.company, phone: "" }).then(() => {
      setBioSaved(true);
      window.setTimeout(() => setBioSaved(false), 2000);
    });
  }

  const pageUrl = summary?.slug ? `${window.location.origin}/partner/${summary.slug}` : "";
  const counts = summary?.leadsByStatus ?? {};
  const total = summary?.total ?? 0;
  const can = user.permissions;
  const showMoney = summary !== null && summary.openCents !== null;

  return (
    <>
      {preview && (
        <div className="pt-card pt-preview" role="status">
          <p>
            <b>Vorschau:</b> So sieht {user.name} sein Portal. Nur Ansicht, hier lässt sich nichts ändern.
          </p>
          <button type="button" className="button button-light pt-small" onClick={onExit}>
            Zurück zur Verwaltung
          </button>
        </div>
      )}
      <div className="pt-top">
        <div>
          <p className="pt-eyebrow">Partnerportal</p>
          <h1>Hallo {user.name}</h1>
        </div>
      </div>

      <div className="pt-stats">
        {can.seeRate && (
          <div className="pt-card pt-rate">
            <small>Ihr Anteil</small>
            <strong>{summary && summary.ratePercent !== null ? `${String(summary.ratePercent).replace(".", ",")} %` : "–"}</strong>
            <span>vom Nettoauftragswert, einmalig je Auftrag. Keine Provision bei Arbeitssicherheit (Grundbetreuung), IT-Sicherheit und Factoring.</span>
          </div>
        )}
        {can.seeAmounts && (
          <>
            <div className="pt-card">
              <small>Offene Provision</small>
              <strong>{showMoney ? euro(summary.openCents) : "–"}</strong>
              <span>aus gewonnenen Aufträgen</span>
            </div>
            <div className="pt-card">
              <small>Ausgezahlt</small>
              <strong>{showMoney ? euro(summary.paidCents) : "–"}</strong>
              <span>bisher an Sie überwiesen</span>
            </div>
          </>
        )}
        <div className="pt-card">
          <small>Ihre Kunden</small>
          <strong>{total}</strong>
          <span>{can.seeStatus ? `${summary?.won ?? 0} Aufträge erhalten` : "von Ihnen vermittelt"}</span>
        </div>
      </div>

      {can.seeStatus && total > 0 && (
        <div className="pt-card pt-pipeline" aria-label="Verteilung nach Stand">
          <div className="pt-pipeline-bar">
            {STATUS_ORDER.map((key) =>
              counts[key] ? <i key={key} className={`is-${key}`} style={{ flexGrow: counts[key] }} title={`${STATUS_LABEL[key]}: ${counts[key]}`} /> : null,
            )}
          </div>
          <ul>
            {STATUS_ORDER.map((key) => (
              <li key={key}>
                <i className={`is-${key}`} aria-hidden="true" />
                {STATUS_LABEL[key]} <b>{counts[key] ?? 0}</b>
              </li>
            ))}
          </ul>
        </div>
      )}

      {PARTNER_PAGES && can.pageActive && (
      <div className="pt-card pt-link">
        <div>
          <small>Ihre Partnerseite und Ihr Empfehlungslink</small>
          {pageUrl ? <code>{pageUrl}</code> : <span>Wird nach der Freigabe angezeigt.</span>}
          <p>Wer über diese Seite anfragt, wird automatisch Ihnen zugeordnet.</p>
        </div>
        {pageUrl && (
          <div className="pt-link-actions">
            <button type="button" className="button button-light" onClick={() => copy(pageUrl)}>
              {copied === pageUrl ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
              {copied === pageUrl ? "Kopiert" : "Link kopieren"}
            </button>
            <a
              className="button button-light"
              href={`https://wa.me/?text=${encodeURIComponent(`Ich empfehle Tayyip Ünal für Audit, Zertifizierung und Schulung: ${pageUrl}`)}`}
              target="_blank"
              rel="noreferrer"
            >
              Per WhatsApp teilen
            </a>
            <button type="button" className="button button-light" onClick={() => setQr((value) => !value)}>
              {qr ? "QR-Code ausblenden" : "QR-Code"}
            </button>
            <a className="text-link" href={pageUrl} target="_blank" rel="noreferrer">
              Seite ansehen
            </a>
          </div>
        )}
      </div>
      )}

      {PARTNER_PAGES && qr && pageUrl && (
        <div className="pt-card">
          <QrCode value={pageUrl} />
          <p className="pt-hint">Für Visitenkarte, Flyer oder Mail-Signatur. Wer den Code scannt, landet auf Ihrer Partnerseite.</p>
        </div>
      )}

      {leads && leads.length > 0 && <PartnerTree name={user.name} leads={leads} showStatus={can.seeStatus} />}

      {leads && leads.length > 0 && <PartnerMonths leads={leads} />}

      <section className="pt-card pt-table-card">
        <div className="pt-table-head">
          <h2>Ihre Kunden</h2>
          {can.submitLeads && (
            <div className="pt-link-actions">
              <button type="button" className="button button-primary" onClick={() => setRequest((open) => !open)}>
                <Plus size={16} aria-hidden="true" /> Antrag ausfüllen
              </button>
              <button type="button" className="button button-light" disabled={!!preview} onClick={() => setForm((open) => !open)}>
                Kontakt melden
              </button>
            </div>
          )}
        </div>

        {request && can.submitLeads && <RequestForm disabled={!!preview} onDone={load} onCancel={() => setRequest(false)} />}

        {form && can.submitLeads && (
          <form className="pt-form" onSubmit={addLead}>
            <Field label="Ansprechpartner *">
              <input name="name" required maxLength={120} />
            </Field>
            <Field label="Firma">
              <input name="company" maxLength={160} />
            </Field>
            <Field label="E-Mail">
              <input name="email" type="email" maxLength={200} />
            </Field>
            <Field label="Telefon">
              <input name="phone" type="tel" maxLength={60} />
            </Field>
            <Field label="Thema">
              <select name="topic" defaultValue="">
                <option value="">Bitte wählen</option>
                <option>ISO 9001</option>
                <option>ISO 14001</option>
                <option>ISO 45001</option>
                <option>SCC-Schulung</option>
                <option>Arbeitssicherheit</option>
                <option>Sonstiges</option>
              </select>
            </Field>
            <Field label="Notiz">
              <input name="message" maxLength={2000} />
            </Field>
            <p className="pt-hint">Bitte nur Kontakte melden, die damit einverstanden sind.</p>
            <button className="button button-primary">Speichern</button>
          </form>
        )}

        {error && (
          <p className="pa-error" role="alert">
            {error}
          </p>
        )}

      </section>

      {leads === null ? (
        <p className="pt-empty">Wird geladen …</p>
      ) : leads.length === 0 ? (
        <p className="pt-empty">Noch keine Kunden. Füllen Sie mit Ihrem Kunden einen Antrag aus oder melden Sie einen Kontakt.</p>
      ) : (
        [...AREAS.map((area) => area.key as string), ""].map((category) => {
          const rows = leads.filter((lead) => (lead.category ?? "") === category);
          if (category !== "zertifizierung" && category !== "personenzertifizierung" && rows.length === 0) return null;
          return (
            <LeadGroup
              key={category || "other"}
              category={category}
              leads={rows}
              can={can}
              rate={summary?.ratePercent ?? null}
              openLead={openLead}
              onToggle={toggleLead}
              events={leadEvents}
            />
          );
        })
      )}

      <PartnerDownloads preset={preview?.downloads} />

      <section className="pt-card pt-direct">
        <h2>Direkter Draht</h2>
        <p className="pt-hint">Fragen zu einem Kunden oder Antrag? Schreiben Sie mir direkt.</p>
        <div className="pt-direct-links">
          <a href="https://wa.me/4915563084795?text=Hallo%20Tayyip%2C%20ich%20bin%20Partner%20und%20habe%20eine%20Frage%3A%20" target="_blank" rel="noreferrer">
            <WhatsAppIcon size={20} />
            <span><small>WhatsApp</small>0155 63084795</span>
          </a>
          <a href={`mailto:${contact.email}`}>
            <Mail size={20} />
            <span><small>E-Mail</small>{contact.email}</span>
          </a>
        </div>
      </section>

      {PARTNER_PAGES && can.editProfile && (
      <section className="pt-card">
        <h2>Text auf Ihrer Partnerseite</h2>
        <p className="pt-hint">Dieser Text erscheint auf Ihrer Seite, zum Beispiel wer Sie sind und warum Sie Tayyip Ünal empfehlen.</p>
        <textarea className="pt-bio" rows={4} maxLength={1200} value={bio} readOnly={!!preview} onChange={(event) => setBio(event.target.value)} />
        <button type="button" className="button button-light" disabled={!!preview} onClick={saveBio}>
          {bioSaved ? "Gespeichert" : "Speichern"}
        </button>
      </section>
      )}
    </>
  );
}

/* ---------- admin dashboard ---------- */

type Tab = "bewerbungen" | "partner" | "leads" | "provisionen" | "kennzahlen" | "downloads" | "rechte";
type AdminData = { downloads?: FileInfo[]; isSuper: boolean; partnerOptions: { id: number; name: string }[]; permissions: Perms; partners: AdminPartner[]; staff: StaffMember[]; leads: AdminLead[] };

function AdminDashboard({ user }: { user: User }) {
  const [data, setData] = useState<AdminData | null>(null);
  const mine = user.permissions;
  const tabs: [Tab, string][] = [];
  const [tab, setTab] = useState<Tab>(mine.managePartners ? "bewerbungen" : mine.manageLeads ? "leads" : mine.managePayouts ? "provisionen" : "rechte");
  const [error, setError] = useState("");
  const [viewAs, setViewAs] = useState<({ user: User } & PartnerPreview) | null>(null);
  const [invite, setInvite] = useState<{ url: string; email: string; name: string; mailed?: boolean } | null>(null);
  const { copied, copy } = useCopy();

  const load = useCallback(() => {
    api<AdminData>("/api/admin/overview")
      .then((result) => setData(result))
      .catch(() => setError("Die Daten konnten nicht geladen werden."));
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const run = async (action: () => Promise<unknown>) => {
    setError("");
    try {
      await action();
      load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Aktion nicht möglich.");
    }
  };

  if (mine.managePartners) tabs.push(["bewerbungen", `Bewerbungen (${data?.partners.filter((p) => p.status === "pending").length ?? 0})`], ["partner", "Partner"]);
  if (mine.manageLeads) tabs.push(["leads", "Kunden und Leads"]);
  if (mine.managePayouts) tabs.push(["provisionen", "Provisionen"]);
  if (mine.manageLeads) tabs.push(["kennzahlen", "Kennzahlen"]);
  if (mine.managePartners) tabs.push(["downloads", "Downloads"]);
  if (user.role === "admin") tabs.push(["rechte", "Team und Rechte"]);

  const pending = data?.partners.filter((p) => p.status === "pending") ?? [];
  const others = data?.partners.filter((p) => p.status !== "pending") ?? [];
  const wonCommissions = data?.leads.filter((l) => l.commission_id) ?? [];
  const openSum = wonCommissions.filter((l) => l.commission_status === "open").reduce((sum, l) => sum + (l.commission_cents ?? 0), 0);
  const paidSum = wonCommissions.filter((l) => l.commission_status === "paid").reduce((sum, l) => sum + (l.commission_cents ?? 0), 0);

  async function approve(partner: AdminPartner, rate: number) {
    await run(async () => {
      const result = await api<{ inviteUrl: string; mailed: boolean }>(`/api/admin/partners/${partner.id}/approve`, { ratePercent: rate });
      setInvite({ url: result.inviteUrl, email: partner.email, name: partner.name, mailed: result.mailed });
    });
  }

  if (viewAs) return <PartnerDashboard user={viewAs.user} preview={viewAs} onExit={() => setViewAs(null)} />;

  return (
    <>
      <div className="pt-top">
        <div>
          <p className="pt-eyebrow">
            <ShieldCheck size={14} aria-hidden="true" /> Verwaltung
          </p>
          <h1>{user.role === "admin" ? "Partner und Provisionen" : "Verwaltung"}</h1>
        </div>
      </div>

      <div className="pt-stats">
        <div className="pt-card">
          <small>Neue Bewerbungen</small>
          <strong>{pending.length}</strong>
          <span>warten auf Ihre Prüfung</span>
        </div>
        <div className="pt-card">
          <small>Aktive Partner</small>
          <strong>{others.filter((p) => p.status === "active").length}</strong>
          <span>mit Zugang</span>
        </div>
        <div className="pt-card">
          <small>Offene Provisionen</small>
          <strong>{euro(openSum)}</strong>
          <span>noch nicht ausgezahlt</span>
        </div>
        <div className="pt-card">
          <small>Ausgezahlt</small>
          <strong>{euro(paidSum)}</strong>
          <span>insgesamt</span>
        </div>
      </div>

      {invite && (
        <div className="pt-card pt-invite" role="status">
          <h2>Zugang für {invite.name} freigegeben</h2>
          <p>
            {invite.mailed
              ? `Die Einladung wurde per E-Mail an ${invite.email} gesendet. Falls sie nicht ankommt, können Sie den Link auch selbst weitergeben.`
              : `Die E-Mail konnte nicht automatisch versendet werden. Senden Sie diesen Link bitte selbst an ${invite.email}.`}{" "}
            Der Link ist 7 Tage gültig und dient dazu, das Passwort zu setzen.
          </p>
          <code>{invite.url}</code>
          <div className="pt-link-actions">
            <button type="button" className="button button-primary" onClick={() => copy(invite.url)}>
              {copied === invite.url ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
              {copied === invite.url ? "Kopiert" : "Link kopieren"}
            </button>
            <a
              className="button button-light"
              href={`mailto:${invite.email}?subject=${encodeURIComponent("Ihr Zugang zum Partnerportal")}&body=${encodeURIComponent(`Guten Tag ${invite.name},\n\nvielen Dank für Ihre Bewerbung. Hier ist Ihr persönlicher Zugang zum Partnerportal:\n\n${invite.url}\n\nDer Link ist 7 Tage gültig.\n\nBeste Grüße\nTayyip Ünal`)}`}
            >
              Per E-Mail senden
            </a>
            <button type="button" className="text-link" onClick={() => setInvite(null)}>
              Schließen
            </button>
          </div>
        </div>
      )}

      <div className="pt-tabs" role="tablist">
        {tabs.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? "is-on" : undefined} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>

      {error && (
        <p className="pa-error" role="alert">
          {error}
        </p>
      )}

      {tab === "rechte" && user.role === "admin" && data && <RightsTab data={data} run={run} setInvite={setInvite} />}

      {tab === "kennzahlen" && user.role === "admin" && <Visits />}

      {tab === "kennzahlen" && mine.manageLeads && data && <Kpis leads={data.leads} />}

      {tab === "downloads" && mine.managePartners && data && <DownloadsAdmin files={data.downloads ?? []} onChange={load} />}

      {tab === "bewerbungen" && mine.managePartners && (
        <section className="pt-card pt-table-card">
          {pending.length === 0 ? (
            <p className="pt-empty">Keine offenen Bewerbungen.</p>
          ) : (
            pending.map((partner) => <ApplicationRow key={partner.id} partner={partner} onApprove={approve} onBlock={() => run(() => api(`/api/admin/partners/${partner.id}/block`, {}))} />)
          )}
        </section>
      )}

      {tab === "partner" && mine.managePartners && (
        <section className="pt-card pt-table-card">
          <CreatePartner
            onCreated={(result, name, email) => {
              setInvite({ url: result.inviteUrl, email, name, mailed: result.mailed });
              load();
            }}
          />
          <div className="pt-scroll">
            <table className="pt-table">
              <thead>
                <tr>
                  <th>Partner</th>
                  <th>Status</th>
                  <th>Anteil</th>
                  <th>Kunden</th>
                  <th>Offen</th>
                  <th>Ausgezahlt</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {others.map((partner) => (
                  <PartnerRow
                    key={partner.id}
                    partner={partner}
                    onRate={(rate) => run(() => api(`/api/admin/partners/${partner.id}/rate`, { ratePercent: rate }))}
                    onBlock={() => run(() => api(`/api/admin/partners/${partner.id}/block`, {}))}
                    onInvite={() => approve(partner, partner.rate_percent)}
                    onPreview={() => run(async () => setViewAs({ ...(await api<{ user: User } & PartnerPreview>(`/api/admin/partners/${partner.id}/preview`)), downloads: data?.downloads ?? [] }))}
                  />
                ))}
              </tbody>
            </table>
            {others.length === 0 && <p className="pt-empty">Noch keine Partner.</p>}
          </div>
        </section>
      )}

      {tab === "leads" && mine.manageLeads && (
        <section className="pt-card pt-table-card">
          <CreateLead partners={data?.partnerOptions ?? []} onCreated={load} />
          <div className="pt-scroll">
            <table className="pt-table">
              <thead>
                <tr>
                  <th>Kunde</th>
                  <th>Partner</th>
                  <th>Bereich und Leistung</th>
                  <th>Stand</th>
                  <th>Wert netto (€)</th>
                  <th>Zahlung</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {(data?.leads ?? []).map((lead) => (
                  <LeadRow key={lead.id} lead={lead} partners={data?.partnerOptions ?? []} onChanged={load} onSave={(changes) => run(() => api(`/api/admin/leads/${lead.id}`, changes))} />
                ))}
              </tbody>
            </table>
            {data && data.leads.length === 0 && <p className="pt-empty">Noch keine Leads.</p>}
          </div>
        </section>
      )}

      {tab === "provisionen" && mine.managePayouts && (
        <section className="pt-card pt-table-card">
          <div className="pt-scroll">
            <table className="pt-table">
              <thead>
                <tr>
                  <th>Partner</th>
                  <th>Kunde</th>
                  <th>Auftragswert</th>
                  <th>Provision</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {wonCommissions.map((lead) => (
                  <tr key={lead.id}>
                    <td>{lead.partner_name}</td>
                    <td>{lead.company || lead.contact_name}</td>
                    <td>{euro(lead.deal_cents)}</td>
                    <td>
                      <b>{euro(lead.commission_cents)}</b>
                    </td>
                    <td>{lead.commission_status === "paid" ? "ausgezahlt" : "offen"}</td>
                    <td>
                      {lead.commission_status === "open" && (
                        <button className="button button-light pt-small" onClick={() => run(() => api(`/api/admin/commissions/${lead.commission_id}/pay`, {}))}>
                          Als ausgezahlt markieren
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {wonCommissions.length === 0 && <p className="pt-empty">Noch keine Provisionen.</p>}
          </div>
        </section>
      )}
    </>
  );
}

function RightsEditor({
  rights,
  value,
  onSave,
}: {
  rights: [keyof Perms, string, string][];
  value: Perms;
  onSave: (perms: Partial<Perms>) => void;
}) {
  const [draft, setDraft] = useState<Perms>(value);
  const changed = rights.some(([key]) => draft[key] !== value[key]);
  return (
    <div className="pt-rights">
      {rights.map(([key, label, hint]) => (
        <label key={key} className="pt-right">
          <input type="checkbox" checked={draft[key]} onChange={(event) => setDraft({ ...draft, [key]: event.target.checked })} />
          <span>
            <b>{label}</b>
            <small>{hint}</small>
          </span>
        </label>
      ))}
      {changed && (
        <button type="button" className="button button-primary pt-small" onClick={() => onSave(Object.fromEntries(rights.map(([key]) => [key, draft[key]])))}>
          Rechte speichern
        </button>
      )}
    </div>
  );
}

const NO_STAFF_RIGHTS = { managePartners: false, manageLeads: false, managePayouts: false } as Perms;

function RightsTab({
  data,
  run,
  setInvite,
}: {
  data: AdminData;
  run: (action: () => Promise<unknown>) => Promise<void>;
  setInvite: (invite: { url: string; email: string; name: string; mailed?: boolean }) => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newPerms, setNewPerms] = useState<Perms>(NO_STAFF_RIGHTS);
  const people = [
    ...data.staff.map((p) => ({ ...p, kind: "staff" as const, company: "" })),
    ...data.partners.filter((p) => p.status !== "pending").map((p) => ({ ...p, kind: "partner" as const })),
  ];
  async function createStaff(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    await run(async () => {
      const result = await api<{ inviteUrl: string; mailed: boolean }>("/api/admin/staff/create", {
        name: form.get("name"),
        email: form.get("email"),
        permissions: Object.fromEntries(STAFF_RIGHTS.map(([key]) => [key, newPerms[key]])),
      });
      setInvite({ url: result.inviteUrl, email: String(form.get("email")), name: String(form.get("name")), mailed: result.mailed });
      formEl.reset();
      setNewPerms(NO_STAFF_RIGHTS);
      setCreating(false);
    });
  }
  const statusLabel = { approved: "eingeladen", active: "aktiv", blocked: "gesperrt", pending: "offen" };
  return (
    <section className="pt-card pt-table-card">
      <div className="pt-create">
        <p className="pt-hint">
          Als Superadmin haben nur Sie alle Rechte. Hier legen Sie fest, was Mitarbeiter bearbeiten dürfen und was jeder Partner im Portal sehen und tun darf.
        </p>
<div className="pt-link-actions">
          <button type="button" className="button button-primary" onClick={() => setCreating((value) => !value)}>
            <Plus size={16} aria-hidden="true" /> Mitarbeiter anlegen
          </button>
          <button
            type="button"
            className="button button-light"
            onClick={() =>
              run(async () => {
                await api("/api/admin/mail-preview", {});
                window.alert("Zwei Beispiel-Mails (Einladung und Angebot bereit) sind an Ihre Adresse unterwegs.");
              })
            }
          >
            Beispiel-Mails an mich senden
          </button>
        </div>
        {creating && (
          <form className="pt-form" onSubmit={createStaff}>
            <Field label="Name *">
              <input name="name" required maxLength={120} />
            </Field>
            <Field label="E-Mail *">
              <input name="email" type="email" required maxLength={200} />
            </Field>
            <div className="pt-rights">
              {STAFF_RIGHTS.map(([key, label, hint]) => (
                <label key={key} className="pt-right">
                  <input type="checkbox" checked={newPerms[key]} onChange={(event) => setNewPerms({ ...newPerms, [key]: event.target.checked })} />
                  <span>
                    <b>{label}</b>
                    <small>{hint}</small>
                  </span>
                </label>
              ))}
            </div>
            <button className="button button-primary">Anlegen und Einladung erzeugen</button>
          </form>
        )}
      </div>
      <div className="pt-scroll">
        <table className="pt-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Rolle</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {people.map((person) => {
              const key = `${person.kind}-${person.id}`;
              return (
                <Fragment key={key}>
                  <tr>
                    <td>
                      <b>{person.name}</b>
                      <small>{person.company || person.email}</small>
                    </td>
                    <td>{person.kind === "staff" ? "Mitarbeiter" : "Partner"}</td>
                    <td>{statusLabel[person.status]}</td>
                    <td className="pt-actions">
                      <button className="text-link" onClick={() => setOpen(open === key ? null : key)}>
                        Rechte
                      </button>
                      {person.status !== "blocked" && (
                        <button
                          className="text-link"
                          onClick={() =>
                            run(async () => {
                              const result = await api<{ inviteUrl: string; mailed: boolean }>(`/api/admin/users/${person.id}/invite`, {});
                              setInvite({ url: result.inviteUrl, email: person.email, name: person.name, mailed: result.mailed });
                            })
                          }
                        >
                          Neuer Link
                        </button>
                      )}
                      {person.status !== "blocked" && (
                        <button className="text-link" onClick={() => run(() => api(`/api/admin/users/${person.id}/block`, {}))}>
                          Sperren
                        </button>
                      )}
                    </td>
                  </tr>
                  {open === key && (
                    <tr>
                      <td colSpan={4}>
                        <RightsEditor
                          rights={person.kind === "staff" ? STAFF_RIGHTS : PARTNER_RIGHTS.filter(([key]) => PARTNER_PAGES || (key !== "editProfile" && key !== "pageActive"))}
                          value={person.perms}
                          onSave={(permissions) => run(() => api(`/api/admin/users/${person.id}/permissions`, { permissions }))}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
        {people.length === 0 && <p className="pt-empty">Noch keine Partner oder Mitarbeiter.</p>}
      </div>
    </section>
  );
}

function CreatePartner({ onCreated }: { onCreated: (result: { inviteUrl: string; pageUrl: string; mailed: boolean }, name: string, email: string) => void }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formEl = event.currentTarget;
    const data = Object.fromEntries(new FormData(formEl).entries());
    setError("");
    try {
      const result = await api<{ inviteUrl: string; pageUrl: string; mailed: boolean }>("/api/admin/partners/create", { ...data, ratePercent: Number(data.ratePercent) });
      onCreated(result, String(data.name), String(data.email));
      formEl.reset();
      setOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Anlegen nicht möglich.");
    }
  }
  return (
    <div className="pt-create">
      <button type="button" className="button button-primary" onClick={() => setOpen((value) => !value)}>
        <Plus size={16} aria-hidden="true" /> Partner anlegen
      </button>
      {open && (
        <form className="pt-form" onSubmit={submit}>
          <Field label="Name *">
            <input name="name" required maxLength={120} />
          </Field>
          <Field label="Firma">
            <input name="company" maxLength={160} />
          </Field>
          <Field label="E-Mail *">
            <input name="email" type="email" required maxLength={200} />
          </Field>
          <Field label="Telefon">
            <input name="phone" type="tel" maxLength={60} />
          </Field>
          <Field label="Anteil in %">
            <input name="ratePercent" type="number" min={0} max={50} step={0.5} defaultValue={10} />
          </Field>
          {PARTNER_PAGES && (
            <Field label="Text auf der Partnerseite">
              <input name="bio" maxLength={1200} placeholder="Wer ist der Partner, warum empfiehlt er Tayyip Ünal?" />
            </Field>
          )}
          {error && (
            <p className="pa-error" role="alert">
              {error}
            </p>
          )}
          <button className="button button-primary">Anlegen und Einladung erzeugen</button>
        </form>
      )}
    </div>
  );
}

function ApplicationRow({
  partner,
  onApprove,
  onBlock,
}: {
  partner: AdminPartner;
  onApprove: (partner: AdminPartner, rate: number) => void;
  onBlock: () => void;
}) {
  const [rate, setRate] = useState(String(partner.rate_percent));
  return (
    <article className="pt-application">
      <div>
        <h3>{partner.name}</h3>
        <p>
          {partner.company || "–"} · <a href={`mailto:${partner.email}`}>{partner.email}</a>
          {partner.phone && ` · ${partner.phone}`} · {dateDe(partner.created_at)}
        </p>
        {partner.pitch && <blockquote>{partner.pitch}</blockquote>}
      </div>
      <div className="pt-application-actions">
        <label>
          <span>Anteil in %</span>
          <input type="number" min={0} max={50} step={0.5} value={rate} onChange={(event) => setRate(event.target.value)} />
        </label>
        <button className="button button-primary" onClick={() => onApprove(partner, Number(rate))}>
          Freigeben
        </button>
        <button className="text-link" onClick={onBlock}>
          Ablehnen
        </button>
      </div>
    </article>
  );
}

function PartnerRow({
  partner,
  onRate,
  onBlock,
  onInvite,
  onPreview,
}: {
  partner: AdminPartner;
  onRate: (rate: number) => void;
  onBlock: () => void;
  onInvite: () => void;
  onPreview: () => void;
}) {
  const [rate, setRate] = useState(String(partner.rate_percent));
  const label = { approved: "eingeladen", active: "aktiv", blocked: "gesperrt", pending: "offen" }[partner.status];
  return (
    <tr>
      <td>
        <b>{partner.name}</b>
        <small>{partner.company || partner.email}</small>
        {PARTNER_PAGES && partner.slug && partner.status !== "blocked" && (
          <small>
            <a href={`/partner/${partner.slug}`} target="_blank" rel="noreferrer">
              /partner/{partner.slug}
            </a>
          </small>
        )}
      </td>
      <td>{label}</td>
      <td>
        <span className="pt-inline">
          <input type="number" min={0} max={50} step={0.5} value={rate} onChange={(event) => setRate(event.target.value)} aria-label="Anteil in Prozent" />
          %
          {Number(rate) !== partner.rate_percent && (
            <button className="text-link" onClick={() => onRate(Number(rate))}>
              Speichern
            </button>
          )}
        </span>
      </td>
      <td>
        {partner.leads} <small>{partner.won} gewonnen</small>
      </td>
      <td>{euro(partner.open_cents)}</td>
      <td>{euro(partner.paid_cents)}</td>
      <td className="pt-actions">
        <button className="text-link" onClick={onPreview}>
          Als Partner ansehen
        </button>
        {partner.status !== "blocked" && (
          <button className="text-link" onClick={onInvite}>
            Neuer Link
          </button>
        )}
        {partner.status !== "blocked" && (
          <button className="text-link" onClick={onBlock}>
            Sperren
          </button>
        )}
      </td>
    </tr>
  );
}

type LeadChanges = {
  status: LeadStatus;
  dealEuro: number | null;
  category: string;
  partnerId: number | null;
  customerPaid: boolean;
};

const CATEGORY_OPTIONS: [string, string][] = [
  ["", "Noch nicht zugeordnet"],
  ...AREAS.map((area): [string, string] => [area.key, area.noCommission ? `${area.label} (keine Provision)` : area.label]),
];

function LeadRow({
  lead,
  partners,
  onSave,
  onChanged,
}: {
  lead: AdminLead;
  partners: { id: number; name: string }[];
  onSave: (changes: LeadChanges) => void;
  onChanged: () => void;
}) {
  const dealText = (cents: number | null) => (cents === null ? "" : String(cents / 100));
  const [status, setStatus] = useState<LeadStatus>(lead.status);
  const [deal, setDeal] = useState(dealText(lead.deal_cents));
  const [category, setCategory] = useState(lead.category ?? "");
  const [partnerId, setPartnerId] = useState<number | null>(lead.partner_id);
  const [paid, setPaid] = useState(!!lead.customer_paid_at);
  const [open, setOpen] = useState(false);
  const [events, setEvents] = useState<LeadEvent[] | null>(null);
  const [note, setNote] = useState("");
  const [shared, setShared] = useState(false);
  const [error, setError] = useState("");
  const locked = lead.commission_status === "paid";
  const changed =
    status !== lead.status ||
    deal !== dealText(lead.deal_cents) ||
    category !== (lead.category ?? "") ||
    partnerId !== lead.partner_id ||
    paid !== !!lead.customer_paid_at;

  const loadEvents = useCallback(() => {
    api<{ events: LeadEvent[] }>(`/api/admin/leads/${lead.id}/events`)
      .then((result) => setEvents(result.events))
      .catch(() => setEvents([]));
  }, [lead.id]);
  useEffect(() => {
    if (open) loadEvents();
  }, [open, loadEvents, lead.status, lead.customer_paid_at]);

  async function addNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    try {
      await api(`/api/admin/leads/${lead.id}/notes`, { note, visible: shared });
      setNote("");
      loadEvents();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Speichern nicht möglich.");
    }
  }

  return (
    <>
      <tr>
        <td>
          <b>{lead.company || lead.contact_name}</b>
          <small>
            {lead.company ? `${lead.contact_name} · ` : ""}
            {lead.email || lead.phone}
          </small>
          {lead.message && <small>{lead.message}</small>}
          <button type="button" className="text-link" onClick={() => setOpen((value) => !value)}>
            {open ? "Verlauf schließen" : "Verlauf und Notizen"}
          </button>
        </td>
        <td>
          <select value={partnerId ?? ""} onChange={(event) => setPartnerId(event.target.value === "" ? null : Number(event.target.value))} disabled={locked} aria-label="Partner">
            <option value="">Direkt über die Seite</option>
            {partners.map((partner) => (
              <option key={partner.id} value={partner.id}>
                {partner.name}
              </option>
            ))}
          </select>
        </td>
        <td>
          <select value={category} onChange={(event) => setCategory(event.target.value)} disabled={locked} aria-label="Bereich">
            {CATEGORY_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <small>{lead.topic || "–"}</small>
        </td>
        <td>
          <select value={status} onChange={(event) => setStatus(event.target.value as LeadStatus)} disabled={locked} aria-label="Stand">
            {STATUS_ORDER.map((key) => (
              <option key={key} value={key}>
                {STATUS_LABEL[key]}
              </option>
            ))}
          </select>
        </td>
        <td>
          <input type="number" min={0} step={50} value={deal} onChange={(event) => setDeal(event.target.value)} disabled={locked} aria-label="Wert netto in Euro" />
        </td>
        <td>
          <label className="pt-right">
            <input type="checkbox" checked={paid} onChange={(event) => setPaid(event.target.checked)} disabled={status !== "won"} />
            <span>
              <b>bezahlt</b>
            </span>
          </label>
        </td>
        <td>
          {changed && !locked && (
            <button
              className="button button-primary pt-small"
              onClick={() => onSave({ status, dealEuro: deal === "" ? null : Number(deal), category, partnerId, customerPaid: status === "won" && paid })}
            >
              Speichern
            </button>
          )}
          {locked && <small>ausgezahlt</small>}
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={7}>
            <Timeline created={lead.created_at} events={events} internalLabels />
            <h4 className="pt-subhead">Angebote</h4>
            <FileLinks
              files={lead.files ?? []}
              onDelete={(id) => {
                if (window.confirm("Angebot wirklich löschen?")) api(`/api/admin/files/${id}/delete`, {}).then(onChanged, onChanged);
              }}
            />
            <OfferUpload leadId={lead.id} onDone={() => { loadEvents(); onChanged(); }} />
            <h4 className="pt-subhead">Notiz</h4>
            <form className="pt-note" onSubmit={addNote}>
              <input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Notiz zum Kunden, zum Beispiel Telefonat, Angebot raus …" maxLength={1000} aria-label="Notiz" />
              <label className="pt-right">
                <input type="checkbox" checked={shared} onChange={(event) => setShared(event.target.checked)} disabled={!lead.partner_id} />
                <span>
                  <b>Für den Partner sichtbar</b>
                </span>
              </label>
              <button className="button button-light pt-small" disabled={!note.trim()}>
                Notiz speichern
              </button>
            </form>
            {error && (
              <p className="pa-error" role="alert">
                {error}
              </p>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

/** The admin enters a customer by hand: which partner, which area, how far, net value. */
function CreateLead({ partners, onCreated }: { partners: { id: number; name: string }[]; onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formEl = event.currentTarget;
    const data = Object.fromEntries(new FormData(formEl).entries());
    setError("");
    try {
      await api("/api/admin/leads/create", { ...data, partnerId: data.partnerId === "" ? null : Number(data.partnerId) });
      formEl.reset();
      setOpen(false);
      onCreated();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Anlegen nicht möglich.");
    }
  }
  return (
    <div className="pt-create">
      <button type="button" className="button button-primary" onClick={() => setOpen((value) => !value)}>
        <Plus size={16} aria-hidden="true" /> Kunde anlegen
      </button>
      {open && (
        <form className="pt-form" onSubmit={submit}>
          <Field label="Firma *">
            <input name="company" required maxLength={160} />
          </Field>
          <Field label="Ansprechpartner">
            <input name="name" maxLength={120} />
          </Field>
          <Field label="E-Mail">
            <input name="email" type="email" maxLength={200} />
          </Field>
          <Field label="Telefon">
            <input name="phone" type="tel" maxLength={60} />
          </Field>
          <Field label="Partner">
            <select name="partnerId" defaultValue="">
              <option value="">Kein Partner</option>
              {partners.map((partner) => (
                <option key={partner.id} value={partner.id}>
                  {partner.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Bereich">
            <select name="category" defaultValue="zertifizierung">
              {CATEGORY_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Angebotene Leistung">
            <input name="topic" maxLength={80} placeholder="zum Beispiel ISO 9001 Zertifizierung" />
          </Field>
          <Field label="Stand">
            <select name="status" defaultValue="offer">
              {STATUS_ORDER.map((key) => (
                <option key={key} value={key}>
                  {STATUS_LABEL[key]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Wert netto in €">
            <input name="dealEuro" type="number" min={0} step={50} />
          </Field>
          <Field label="Notiz">
            <input name="message" maxLength={2000} />
          </Field>
          {error && (
            <p className="pa-error" role="alert">
              {error}
            </p>
          )}
          <button className="button button-primary">Kunde speichern</button>
        </form>
      )}
    </div>
  );
}

/* ---------- setup and activation ---------- */

function PasswordForm({
  title,
  intro,
  extra,
  action,
  button,
}: {
  title: string;
  intro: string;
  extra?: React.ReactNode;
  action: (data: FormData) => Promise<void>;
  button: string;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    if (data.get("password") !== data.get("again")) {
      setError("Die beiden Passwörter stimmen nicht überein.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await action(data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Das hat nicht geklappt.");
      setBusy(false);
    }
  }
  return (
    <section className="pt-auth">
      <form onSubmit={submit} className="pt-card pt-login">
        <p className="pt-eyebrow">Partnerportal</p>
        <h1>{title}</h1>
        <p className="pt-hint">{intro}</p>
        {extra}
        <Field label="Passwort (mindestens 12 Zeichen)">
          <input name="password" type="password" required minLength={12} autoComplete="new-password" />
        </Field>
        <Field label="Passwort wiederholen">
          <input name="again" type="password" required minLength={12} autoComplete="new-password" />
        </Field>
        {error && (
          <p className="pa-error" role="alert">
            {error}
          </p>
        )}
        <button className="button button-primary" disabled={busy}>
          {busy ? "Einen Moment …" : button}
        </button>
      </form>
    </section>
  );
}

function Activate() {
  const token = new URLSearchParams(window.location.search).get("token") ?? "";
  const [info, setInfo] = useState<{ name: string; email: string } | "invalid" | null>(null);
  useEffect(() => {
    api<{ name: string; email: string }>(`/api/auth/invite?token=${encodeURIComponent(token)}`)
      .then((result) => setInfo({ name: result.name, email: result.email }))
      .catch(() => setInfo("invalid"));
  }, [token]);
  if (info === null) return <p className="pt-empty">Wird geprüft …</p>;
  if (info === "invalid")
    return (
      <section className="pt-auth">
        <div className="pt-card pt-login">
          <h1>Link nicht gültig</h1>
          <p className="pt-hint">Der Einladungslink ist ungültig oder abgelaufen. Bitte fordern Sie einen neuen an.</p>
        </div>
      </section>
    );
  return (
    <PasswordForm
      title={`Willkommen, ${info.name}`}
      intro={`Legen Sie ein Passwort für ${info.email} fest.`}
      button="Zugang aktivieren"
      action={async (data) => {
        await api("/api/auth/activate", { token, password: data.get("password") });
        window.location.assign("/portal");
      }}
    />
  );
}

function Setup() {
  return (
    <PasswordForm
      title="Portal einrichten"
      intro="Einmalige Einrichtung des Administrator-Zugangs. Sie brauchen den Einrichtungscode."
      button="Zugang anlegen"
      extra={
        <>
          <Field label="Einrichtungscode">
            <input name="token" type="password" required autoComplete="off" />
          </Field>
          <Field label="Ihr Name">
            <input name="name" required autoComplete="name" />
          </Field>
          <Field label="E-Mail">
            <input name="email" type="email" required autoComplete="username" />
          </Field>
        </>
      }
      action={async (data) => {
        await api("/api/setup", { token: data.get("token"), name: data.get("name"), email: data.get("email"), password: data.get("password") });
        window.location.assign("/portal");
      }}
    />
  );
}

/* ---------- entry ---------- */

export function Portal({ path }: { path: string }) {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  useEffect(() => {
    setPageMeta("Partnerportal | Tayyip Ünal");
    api<{ user: User }>("/api/me")
      .then((result) => setUser(result.user))
      .catch(() => setUser(null));
  }, []);

  const signOut = async () => {
    await api("/api/auth/logout", {}).catch(() => null);
    setUser(null);
  };

  if (path === "/portal/aktivieren") return <main className="pt-page"><Activate /></main>;
  if (path === "/portal/einrichten") return <main className="pt-page"><Setup /></main>;

  return (
    <main className="pt-page">
      <div className="pt-wrap">
        {user === undefined && <p className="pt-empty">Wird geladen …</p>}
        {user === null && <Login onUser={setUser} />}
        {user && (
          <>
            <div className="pt-bar">
              <span>
                {user.name} · {user.role === "admin" ? "Superadmin" : user.role === "staff" ? "Mitarbeiter" : "Partner"}
              </span>
              <button type="button" className="text-link" onClick={signOut}>
                <LogOut size={15} aria-hidden="true" /> Abmelden
              </button>
            </div>
            {user.role === "partner" ? <PartnerDashboard user={user} /> : <AdminDashboard user={user} />}
          </>
        )}
      </div>
    </main>
  );
}
