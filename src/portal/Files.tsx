import { Download, Trash2, Upload } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { api, dateDe, euro, type FileInfo, type InvoiceInfo } from "./api";

const MAX_BYTES = 1_800_000;
const ACCEPT = ".pdf,.png,.jpg,.jpeg,.svg,.zip,.doc,.docx,.pptx,.xlsx";

const size = (bytes: number) => (bytes < 1_000_000 ? `${Math.max(1, Math.round(bytes / 1000))} KB` : `${(bytes / 1_000_000).toFixed(1).replace(".", ",")} MB`);

function toBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(new Error("Die Datei konnte nicht gelesen werden."));
    reader.readAsDataURL(file);
  });
}

/** Sends one file to the worker; offers need the customer, downloads a title. */
async function upload(kind: "offer" | "download" | "invoice", file: File, extra: Record<string, string | number | undefined>) {
  if (file.size > MAX_BYTES) throw new Error("Die Datei darf höchstens 1,8 MB groß sein.");
  await api("/api/admin/files", { kind, filename: file.name, mime: file.type || "application/octet-stream", data: await toBase64(file), ...extra });
}

/** Links to files; with onDelete the admin can remove them. */
export function FileLinks({ files, onDelete }: { files: FileInfo[]; onDelete?: (id: number) => void }) {
  if (!files.length) return null;
  return (
    <ul className="pt-files">
      {files.map((file) => (
        <li key={file.id}>
          <a href={`/api/files/${file.id}`}>
            <Download size={15} aria-hidden="true" /> {file.title}
          </a>
          <small>
            {size(file.size)} · {dateDe(file.created_at)}
          </small>
          {onDelete && (
            <button type="button" className="text-link" onClick={() => onDelete(file.id)} aria-label={`${file.title} löschen`}>
              <Trash2 size={14} aria-hidden="true" />
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

/** Admin: upload the offer for one customer. The partner is notified and the customer moves to "Angebot". */
export function OfferUpload({ leadId, onDone }: { leadId: number; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const file = data.get("file");
    if (!(file instanceof File) || !file.size) return;
    setBusy(true);
    setError("");
    try {
      await upload("offer", file, { leadId, title: String(data.get("title") || "") || "Angebot" });
      form.reset();
      onDone();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Hochladen nicht möglich.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="pt-note" onSubmit={submit}>
      <input name="title" placeholder="Bezeichnung, zum Beispiel Angebot ISO 9001" maxLength={120} aria-label="Bezeichnung des Angebots" />
      <input name="file" type="file" accept={ACCEPT} required aria-label="Angebotsdatei" />
      <button className="button button-light pt-small" disabled={busy}>
        <Upload size={14} aria-hidden="true" /> {busy ? "Lädt …" : "Angebot hochladen"}
      </button>
      {error && (
        <p className="pa-error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

/** Admin tab: material every partner can download (flyer, logos, text blocks). */
export function DownloadsAdmin({ files, onChange }: { files: FileInfo[]; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const file = data.get("file");
    if (!(file instanceof File) || !file.size) return;
    setBusy(true);
    setError("");
    try {
      await upload("download", file, { title: String(data.get("title") || "") || file.name });
      form.reset();
      onChange();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Hochladen nicht möglich.");
    } finally {
      setBusy(false);
    }
  }
  const remove = async (id: number) => {
    if (!window.confirm("Datei wirklich löschen?")) return;
    await api(`/api/admin/files/${id}/delete`, {}).catch(() => null);
    onChange();
  };
  return (
    <section className="pt-card">
      <h2>Downloads für Partner</h2>
      <p className="pt-hint">Flyer, Logos, Präsentationen oder Textbausteine. Alle Partner sehen diese Dateien in ihrem Portal. Höchstens 1,8 MB pro Datei.</p>
      <form className="pt-note" onSubmit={submit}>
        <input name="title" placeholder="Titel, zum Beispiel Flyer Arbeitsschutz" maxLength={120} aria-label="Titel" />
        <input name="file" type="file" accept={ACCEPT} required aria-label="Datei" />
        <button className="button button-primary pt-small" disabled={busy}>
          <Upload size={14} aria-hidden="true" /> {busy ? "Lädt …" : "Hochladen"}
        </button>
      </form>
      {error && (
        <p className="pa-error" role="alert">
          {error}
        </p>
      )}
      {files.length ? <FileLinks files={files} onDelete={remove} /> : <p className="pt-empty">Noch keine Dateien hochgeladen.</p>}
    </section>
  );
}

/** Admin: the commission invoices partners sent in. Upload with partner, number, amount and date; mark paid; filter by partner. */
export function InvoicesAdmin({
  invoices,
  partners,
  onChange,
}: {
  invoices: InvoiceInfo[];
  partners: { id: number; name: string }[];
  onChange: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [partnerFilter, setPartnerFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const file = data.get("file");
    if (!(file instanceof File) || !file.size) return;
    setBusy(true);
    setError("");
    try {
      await upload("invoice", file, {
        partnerId: Number(data.get("partnerId")),
        title: String(data.get("title") || "") || file.name,
        amount: String(data.get("amount") || ""),
        docDate: String(data.get("docDate") || ""),
      });
      form.reset();
      onChange();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Hochladen nicht möglich.");
    } finally {
      setBusy(false);
    }
  }
  const act = async (action: () => Promise<unknown>) => {
    setError("");
    try {
      await action();
      onChange();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Aktion nicht möglich.");
    }
  };
  const remove = (invoice: InvoiceInfo) => {
    if (window.confirm(`Rechnung „${invoice.title}“ wirklich löschen?`)) act(() => api(`/api/admin/files/${invoice.id}/delete`, {}));
  };
  const shown = invoices.filter(
    (invoice) =>
      (!partnerFilter || String(invoice.partner_id) === partnerFilter) &&
      (!statusFilter || (statusFilter === "paid" ? invoice.paid_at : !invoice.paid_at)),
  );
  const sum = (list: InvoiceInfo[]) => list.reduce((total, invoice) => total + (invoice.amount_cents ?? 0), 0);
  const open = shown.filter((invoice) => !invoice.paid_at);
  return (
    <section className="pt-card">
      <h2>Provisionsrechnungen</h2>
      <p className="pt-hint">Die Rechnungen, die Ihre Partner Ihnen für ihre Provision schicken. Partner sehen diesen Bereich nicht. PDF oder Bild, höchstens 1,8 MB.</p>
      <form className="pt-invoice-form" onSubmit={submit}>
        <select name="partnerId" required defaultValue="" aria-label="Partner">
          <option value="" disabled>
            Partner wählen
          </option>
          {partners.map((partner) => (
            <option key={partner.id} value={partner.id}>
              {partner.name}
            </option>
          ))}
        </select>
        <input name="title" placeholder="Rechnungsnummer, z. B. RE-2026-014" maxLength={120} aria-label="Rechnungsnummer oder Bezeichnung" />
        <input name="amount" inputMode="decimal" placeholder="Betrag in €" pattern="[0-9]+([,.][0-9]{1,2})?" aria-label="Betrag in Euro" />
        <input name="docDate" type="date" aria-label="Rechnungsdatum" defaultValue={new Date().toISOString().slice(0, 10)} />
        <input name="file" type="file" accept=".pdf,.png,.jpg,.jpeg" required aria-label="Rechnungsdatei" />
        <button className="button button-primary pt-small" disabled={busy}>
          <Upload size={14} aria-hidden="true" /> {busy ? "Lädt …" : "Rechnung speichern"}
        </button>
      </form>
      {error && (
        <p className="pa-error" role="alert">
          {error}
        </p>
      )}
      {invoices.length > 0 && (
        <div className="pt-invoice-filter">
          <select value={partnerFilter} onChange={(event) => setPartnerFilter(event.target.value)} aria-label="Nach Partner filtern">
            <option value="">Alle Partner</option>
            {partners.map((partner) => (
              <option key={partner.id} value={partner.id}>
                {partner.name}
              </option>
            ))}
          </select>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Nach Status filtern">
            <option value="">Offen und bezahlt</option>
            <option value="open">Nur offen</option>
            <option value="paid">Nur bezahlt</option>
          </select>
          <span>
            {shown.length} {shown.length === 1 ? "Rechnung" : "Rechnungen"} · {euro(sum(shown))}
            {open.length > 0 && <b> · offen {euro(sum(open))}</b>}
          </span>
        </div>
      )}
      {shown.length > 0 ? (
        <div className="pt-scroll">
          <table className="pt-table">
            <thead>
              <tr>
                <th>Datum</th>
                <th>Partner</th>
                <th>Rechnung</th>
                <th>Betrag</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {shown.map((invoice) => (
                <tr key={invoice.id}>
                  <td>{dateDe(invoice.doc_date ?? invoice.created_at)}</td>
                  <td>{invoice.partner_name ?? "–"}</td>
                  <td>
                    <a className="pt-invoice-link" href={`/api/files/${invoice.id}`}>
                      <Download size={15} aria-hidden="true" /> {invoice.title}
                    </a>
                    <small>
                      {invoice.filename} · {size(invoice.size)}
                    </small>
                  </td>
                  <td>
                    <b>{euro(invoice.amount_cents)}</b>
                  </td>
                  <td>
                    <span className={invoice.paid_at ? "pt-paid is-paid" : "pt-paid is-open"}>{invoice.paid_at ? `bezahlt ${dateDe(invoice.paid_at)}` : "offen"}</span>
                  </td>
                  <td className="pt-invoice-actions">
                    <button className="text-link" onClick={() => act(() => api(`/api/admin/invoices/${invoice.id}/paid`, { paid: !invoice.paid_at }))}>
                      {invoice.paid_at ? "Wieder offen" : "Als bezahlt markieren"}
                    </button>
                    <button className="text-link pt-delete" onClick={() => remove(invoice)} aria-label={`${invoice.title} löschen`}>
                      <Trash2 size={14} aria-hidden="true" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="pt-empty">{invoices.length ? "Keine Rechnung passt zum Filter." : "Noch keine Rechnungen gespeichert."}</p>
      )}
    </section>
  );
}

/** Partner view of the shared downloads; preview mode passes the list in. */
export function PartnerDownloads({ preset }: { preset?: FileInfo[] }) {
  const [files, setFiles] = useState<FileInfo[] | null>(preset ?? null);
  useEffect(() => {
    if (preset) return;
    api<{ files: FileInfo[] }>("/api/partner/downloads")
      .then((result) => setFiles(result.files))
      .catch(() => setFiles([]));
  }, [preset]);
  if (!files || files.length === 0) return null;
  return (
    <section className="pt-card">
      <h2>Unterlagen zum Weitergeben</h2>
      <p className="pt-hint">Flyer, Logos und Texte, die Sie für Ihre Empfehlungen nutzen können.</p>
      <FileLinks files={files} />
    </section>
  );
}
