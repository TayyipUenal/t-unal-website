/** Reads a commission invoice PDF in the browser and guesses number, date, amount and partner. Nothing is sent anywhere. */

export type InvoiceGuess = { number?: string; date?: string; amount?: string; partnerId?: number };

export type Item = { text: string; x: number; y: number };

const MONEY = /(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})(?!\d)/g;
const DATE = /\b(\d{1,2})\.(\d{1,2})\.(\d{4})\b/;
const NUMBER = /^[A-Z0-9][A-Z0-9\-_/.]{2,}$/i;

const toIso = (match: RegExpMatchArray) => `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
const toCents = (money: string) => Math.round(Number(money.replace(/\./g, "").replace(",", ".")) * 100);

async function pdfItems(file: File): Promise<Item[]> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const items: Item[] = [];
  for (let page = 1; page <= Math.min(doc.numPages, 3); page++) {
    const content = await (await doc.getPage(page)).getTextContent();
    for (const item of content.items) {
      if (!("str" in item) || !item.str.trim()) continue;
      // Later pages sit below earlier ones so "the next line" keeps working across pages.
      items.push({ text: item.str.trim(), x: item.transform[4], y: item.transform[5] - (page - 1) * 10000 });
    }
  }
  return items;
}

/** The value printed after a label: on the same line to the right, or in the line just below near the same column. */
function valueAfter(items: Item[], label: RegExp, accept: (text: string) => boolean): string | undefined {
  for (const item of items) {
    const hit = item.text.match(label);
    if (!hit) continue;
    const rest = item.text.slice((hit.index ?? 0) + hit[0].length).replace(/^[\s.:#-]+/, "");
    if (rest && accept(rest.split(/\s+/)[0])) return rest.split(/\s+/)[0];
    const sameLine = items.filter((o) => Math.abs(o.y - item.y) < 3 && o.x > item.x).sort((a, b) => a.x - b.x);
    if (sameLine[0] && accept(sameLine[0].text)) return sameLine[0].text;
    const below = items
      .filter((o) => o.y < item.y && item.y - o.y < 30 && Math.abs(o.x - item.x) < 60)
      .sort((a, b) => b.y - a.y || Math.abs(a.x - item.x) - Math.abs(b.x - item.x));
    if (below[0] && accept(below[0].text)) return below[0].text;
  }
  return undefined;
}

export async function readInvoice(file: File, partners: { id: number; name: string }[]): Promise<InvoiceGuess> {
  const items = file.type === "application/pdf" || /\.pdf$/i.test(file.name) ? await pdfItems(file).catch(() => []) : [];
  return guessInvoice(items, file.name, partners);
}

/** The guessing part, separate from PDF reading so it can be checked with any text items. */
export function guessInvoice(items: Item[], fileName: string, partners: { id: number; name: string }[]): InvoiceGuess {
  const guess: InvoiceGuess = {};
  const text = items.map((item) => item.text).join(" ");

  guess.number =
    valueAfter(items, /Rechnungs-?\s?(nr|nummer|no)\.?/i, (t) => NUMBER.test(t) && /\d/.test(t)) ??
    fileName.match(/\b(RE|R|RG|INV)[-_ ]?\d{3,}\b/i)?.[0];

  const dateText = valueAfter(items, /(Rechnungsdatum|Datum)/i, (t) => DATE.test(t));
  const date = (dateText ?? text).match(DATE) ?? fileName.match(DATE);
  if (date) guess.date = toIso(date);

  // The total: a money value next to a total label, otherwise the largest amount on the invoice.
  const total = valueAfter(items, /(Gesamtbetrag|Rechnungsbetrag|Endbetrag|Gesamtsumme|Zahlbetrag|zu zahlen|Summe brutto|Bruttobetrag)/i, (t) =>
    new RegExp(MONEY.source).test(t),
  );
  const all = [...text.matchAll(MONEY)].map((m) => m[1]);
  const best = total?.match(new RegExp(MONEY.source))?.[1] ?? all.sort((a, b) => toCents(b) - toCents(a))[0];
  if (best) guess.amount = best;

  // Partner: full name in the PDF or the file name; the longest match wins (Seyfiali Dogan over Dogan).
  const haystack = `${text} ${fileName}`.toLowerCase();
  const found = partners.filter((p) => haystack.includes(p.name.toLowerCase())).sort((a, b) => b.name.length - a.name.length)[0];
  if (found) guess.partnerId = found.id;
  return guess;
}
