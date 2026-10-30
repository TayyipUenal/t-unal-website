import { Plus, Trash2, UserPlus, X } from "lucide-react";
import { useMemo, useState } from "react";
import { api, euro, type AdminLead, type AdminPartner } from "./api";
import { AREAS } from "./areas";

type Row = {
  key: number;
  company: string;
  name: string;
  category: string;
  date: string;
  dealEuro: string;
  ratePercent: string;
  customerPaid: boolean;
  commissionPaid: boolean;
};

const NO_COMMISSION: string[] = AREAS.filter((area) => area.noCommission).map((area) => area.key);
const today = () => new Date().toISOString().slice(0, 10);
const toNumber = (text: string) => Number(text.replace(/\./g, "").replace(",", "."));
let nextKey = 1;
const emptyRow = (): Row => ({ key: nextKey++, company: "", name: "", category: "zertifizierung", date: today(), dealEuro: "", ratePercent: "", customerPaid: true, commissionPaid: false });

/**
 * Retroactive work for one partner: enter past orders (with date, value and whether the commission was already paid)
 * and assign customers that are already in the system to this partner.
 */
export function Backfill({
  partner,
  leads,
  canPayout,
  onDone,
  onClose,
}: {
  partner: AdminPartner;
  leads: AdminLead[];
  canPayout: boolean;
  onDone: () => void;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<Row[]>([emptyRow()]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<Set<number>>(new Set());

  const update = (key: number, change: Partial<Row>) => setRows((all) => all.map((row) => (row.key === key ? { ...row, ...change } : row)));

  // Commission preview with the same rules as the server: partner rate unless a row has its own, none for areas without commission.
  const preview = useMemo(() => {
    let open = 0;
    let paid = 0;
    for (const row of rows) {
      const value = toNumber(row.dealEuro);
      if (!Number.isFinite(value) || value <= 0 || NO_COMMISSION.includes(row.category)) continue;
      const rate = row.ratePercent.trim() === "" ? partner.rate_percent : toNumber(row.ratePercent);
      const cents = Math.round(value * 100 * (Number.isFinite(rate) ? rate : 0)) / 100;
      if (row.commissionPaid) paid += cents;
      else open += cents;
    }
    return { open, paid };
  }, [rows, partner.rate_percent]);

  async function saveRows() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const filled = rows.filter((row) => row.company.trim() || row.name.trim() || row.dealEuro.trim());
      const result = await api<{ created: number; openCents: number; paidCents: number }>("/api/admin/leads/backfill", { partnerId: partner.id, rows: filled });
      setMessage(`${result.created} ${result.created === 1 ? "Kunde" : "Kunden"} nachgetragen. Provision offen: ${euro(result.openCents)}, schon ausgezahlt: ${euro(result.paidCents)}.`);
      setRows([emptyRow()]);
      onDone();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Speichern nicht möglich.");
    } finally {
      setBusy(false);
    }
  }

  // Customers already in the system that could belong to this partner (not those with a paid-out commission).
  const candidates = leads.filter(
    (lead) =>
      lead.partner_id !== partner.id &&
      lead.commission_status !== "paid" &&
      `${lead.company} ${lead.contact_name} ${lead.email}`.toLowerCase().includes(search.trim().toLowerCase()),
  );

  async function assign() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await api<{ moved: number }>("/api/admin/leads/assign", { partnerId: partner.id, leadIds: [...picked] });
      setMessage(`${result.moved} ${result.moved === 1 ? "Kunde" : "Kunden"} ${partner.name} zugeordnet. Bei gewonnenen Aufträgen wurde die Provision angelegt.`);
      setPicked(new Set());
      onDone();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Zuordnen nicht möglich.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="pt-card bf">
      <div className="bf-head">
        <div>
          <p className="pt-eyebrow">Rückwirkend</p>
          <h2>Kunden für {partner.name} nachtragen</h2>
          <p className="pt-hint">
            Aufträge aus der Vergangenheit, für die {partner.name} noch Provision bekommt. Anteil: {partner.rate_percent} %, je Zeile änderbar. Der Partner sieht die Kunden danach
            in seinem Portal.
          </p>
        </div>
        <button type="button" className="text-link" onClick={onClose} aria-label="Schließen">
          <X size={18} aria-hidden="true" />
        </button>
      </div>

      <h3 className="bf-h3">Aufträge eintragen</h3>
      <div className="pt-scroll">
        <table className="pt-table bf-table">
          <thead>
            <tr>
              <th>Firma</th>
              <th>Ansprechpartner</th>
              <th>Bereich</th>
              <th>Auftragsdatum</th>
              <th>Auftragswert netto</th>
              <th>Provision %</th>
              <th>Kunde bezahlt</th>
              {canPayout && <th>Provision ausgezahlt</th>}
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key}>
                <td>
                  <input value={row.company} onChange={(e) => update(row.key, { company: e.target.value })} placeholder="Firma" aria-label="Firma" />
                </td>
                <td>
                  <input value={row.name} onChange={(e) => update(row.key, { name: e.target.value })} placeholder="optional" aria-label="Ansprechpartner" />
                </td>
                <td>
                  <select value={row.category} onChange={(e) => update(row.key, { category: e.target.value })} aria-label="Bereich">
                    {AREAS.map((area) => (
                      <option key={area.key} value={area.key}>
                        {area.noCommission ? `${area.label} (keine Provision)` : area.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <input type="date" value={row.date} max={today()} onChange={(e) => update(row.key, { date: e.target.value })} aria-label="Auftragsdatum" />
                </td>
                <td>
                  <span className="pt-inline">
                    <input inputMode="decimal" value={row.dealEuro} onChange={(e) => update(row.key, { dealEuro: e.target.value })} placeholder="0,00" aria-label="Auftragswert netto in Euro" />
                    €
                  </span>
                </td>
                <td>
                  <span className="pt-inline">
                    <input inputMode="decimal" value={row.ratePercent} onChange={(e) => update(row.key, { ratePercent: e.target.value })} placeholder={String(partner.rate_percent)} aria-label="Provision in Prozent" />%
                  </span>
                </td>
                <td className="bf-check">
                  <input type="checkbox" checked={row.customerPaid} onChange={(e) => update(row.key, { customerPaid: e.target.checked })} aria-label="Kunde hat bezahlt" />
                </td>
                {canPayout && (
                  <td className="bf-check">
                    <input
                      type="checkbox"
                      checked={row.commissionPaid}
                      onChange={(e) => update(row.key, { commissionPaid: e.target.checked, customerPaid: e.target.checked || row.customerPaid })}
                      aria-label="Provision schon ausgezahlt"
                    />
                  </td>
                )}
                <td>
                  {rows.length > 1 && (
                    <button type="button" className="text-link pt-delete" onClick={() => setRows(rows.filter((r) => r.key !== row.key))} aria-label="Zeile entfernen">
                      <Trash2 size={15} aria-hidden="true" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="bf-actions">
        <button type="button" className="text-link" onClick={() => setRows([...rows, emptyRow()])}>
          <Plus size={15} aria-hidden="true" /> Weitere Zeile
        </button>
        <span className="bf-sum">
          Provision offen <b>{euro(Math.round(preview.open))}</b>
          {preview.paid > 0 && (
            <>
              {" "}
              · schon ausgezahlt <b>{euro(Math.round(preview.paid))}</b>
            </>
          )}
        </span>
        <button type="button" className="button button-primary pt-small" disabled={busy} onClick={saveRows}>
          {busy ? "Speichert …" : "Alle speichern"}
        </button>
      </div>

      <h3 className="bf-h3">Kunden aus dem System zuordnen</h3>
      <p className="pt-hint">Kunden, die schon angelegt sind, aber noch keinem oder einem anderen Partner gehören. Ist der Auftrag gewonnen, wird die Provision automatisch angelegt.</p>
      <input className="bf-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Firma, Name oder E-Mail suchen" aria-label="Kunden suchen" />
      <ul className="bf-list">
        {candidates.slice(0, 60).map((lead) => (
          <li key={lead.id}>
            <label>
              <input
                type="checkbox"
                checked={picked.has(lead.id)}
                onChange={(e) => {
                  const next = new Set(picked);
                  if (e.target.checked) next.add(lead.id);
                  else next.delete(lead.id);
                  setPicked(next);
                }}
              />
              <span>
                <b>{lead.company || lead.contact_name}</b>
                <small>
                  {new Date(lead.created_at).toLocaleDateString("de-DE")} · {lead.partner_name ? `bisher ${lead.partner_name}` : "ohne Partner"}
                  {lead.deal_cents ? ` · ${euro(lead.deal_cents)}` : ""}
                  {lead.status === "won" ? " · gewonnen" : ""}
                </small>
              </span>
            </label>
          </li>
        ))}
        {candidates.length === 0 && <li className="pt-empty">Keine passenden Kunden.</li>}
      </ul>
      <div className="bf-actions">
        <span className="bf-sum">{picked.size} ausgewählt</span>
        <button type="button" className="button button-light pt-small" disabled={busy || picked.size === 0} onClick={assign}>
          <UserPlus size={15} aria-hidden="true" /> {partner.name} zuordnen
        </button>
      </div>

      {message && (
        <p className="bf-ok" role="status">
          {message}
        </p>
      )}
      {error && (
        <p className="pa-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
