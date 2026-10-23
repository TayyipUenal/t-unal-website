import { Download, Trash2, Upload } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { api, dateDe, type FileInfo } from "./api";

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
async function upload(kind: "offer" | "download", file: File, extra: { title?: string; leadId?: number }) {
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
