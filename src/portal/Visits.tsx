import { Download } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api } from "./api";

type Visit = {
  id: number;
  day: string;
  started_at: string;
  last_at: string;
  views: number;
  landing: string | null;
  exit_path: string | null;
  pages: string | null;
  source: string | null;
  referrer: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  device: string | null;
  browser: string | null;
  os: string | null;
};
type Data = { today: string; days: number; visits: Visit[]; totals: { visitors: number; views: number; since: string | null } };

const SITES = [
  ["tu", "tayyipuenal.de"],
  ["asc", "arbeitssicherheitscout.de"],
] as const;
const RANGES = [
  [1, "Heute"],
  [7, "7 Tage"],
  [30, "30 Tage"],
  [90, "90 Tage"],
  [365, "12 Monate"],
] as const;
const MONTHS = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
const COUNTRY = new Intl.DisplayNames(["de"], { type: "region" });

const nf = new Intl.NumberFormat("de-DE");
const short = (day: string) => `${day.slice(8, 10)}.${day.slice(5, 7)}.`;
const shift = (day: string, by: number) => new Date(Date.parse(`${day}T12:00:00Z`) + by * 86400000).toISOString().slice(0, 10);
const time = (iso: string) => new Date(iso).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const seconds = (v: Visit) => Math.max(0, (Date.parse(v.last_at) - Date.parse(v.started_at)) / 1000);
const duration = (s: number) => (s < 1 ? "–" : s < 60 ? `${Math.round(s)} s` : `${Math.floor(s / 60)} min ${String(Math.round(s % 60)).padStart(2, "0")} s`);
const pageName = (path: string | null) => (!path || path === "/" ? "Startseite" : decodeURIComponent(path).replace(/^\/|\/$/g, ""));
const country = (code: string | null) => {
  if (!code) return "Unbekannt";
  try {
    return COUNTRY.of(code) ?? code;
  } catch {
    return code;
  }
};
/** Cloudflare names German states in English. */
const STATES: Record<string, string> = {
  "North Rhine-Westphalia": "NRW",
  "Lower Saxony": "Niedersachsen",
  Bavaria: "Bayern",
  Hesse: "Hessen",
  "Baden-Wurttemberg": "Baden-Württemberg",
  "Baden-Württemberg": "Baden-Württemberg",
  "Rhineland-Palatinate": "Rheinland-Pfalz",
  Saxony: "Sachsen",
  "Saxony-Anhalt": "Sachsen-Anhalt",
  Thuringia: "Thüringen",
  "Mecklenburg-Vorpommern": "Mecklenburg-Vorpommern",
  "Schleswig-Holstein": "Schleswig-Holstein",
  Brandenburg: "Brandenburg",
  Berlin: "Berlin",
  Hamburg: "Hamburg",
  Bremen: "Bremen",
  Saarland: "Saarland",
};
const place = (v: Visit) => [v.city, v.region && v.region !== v.city ? STATES[v.region] ?? v.region : "", v.country && v.country !== "DE" ? country(v.country) : ""].filter(Boolean).join(", ") || "Unbekannt";
const pagesOf = (v: Visit): string[] => {
  try {
    return JSON.parse(v.pages || "[]");
  } catch {
    return [];
  }
};

/** Counts a key over the visits, biggest first. */
function rank(visits: Visit[], key: (v: Visit) => string | string[]) {
  const counts = new Map<string, number>();
  for (const v of visits) for (const k of ([] as string[]).concat(key(v))) counts.set(k, (counts.get(k) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

function Breakdown({ title, rows, total, limit = 8 }: { title: string; rows: [string, number][]; total: number; limit?: number }) {
  const [all, setAll] = useState(false);
  const shown = all ? rows : rows.slice(0, limit);
  return (
    <section className="pt-card vs-break">
      <h3>{title}</h3>
      {rows.length === 0 ? (
        <p className="pt-hint">Noch keine Daten.</p>
      ) : (
        <ol>
          {shown.map(([label, count]) => (
            <li key={label} style={{ "--share": `${(count / Math.max(1, rows[0][1])) * 100}%` } as React.CSSProperties}>
              <span>{label}</span>
              <b>{nf.format(count)}</b>
              <small>{total ? Math.round((count / total) * 100) : 0} %</small>
            </li>
          ))}
        </ol>
      )}
      {rows.length > limit && (
        <button type="button" className="text-link" onClick={() => setAll(!all)}>
          {all ? "Weniger anzeigen" : `Alle ${rows.length} anzeigen`}
        </button>
      )}
    </section>
  );
}

/** Website visitors for the superadmin: per site and period, with places, sources, devices, pages and every single visit. */
export function Visits() {
  const [site, setSite] = useState<"tu" | "asc">("tu");
  const [range, setRange] = useState(30);
  const [data, setData] = useState<Data | null>(null);
  const [failed, setFailed] = useState(false);
  const [hover, setHover] = useState<number | null>(null);
  const [filter, setFilter] = useState("");
  const [listSize, setListSize] = useState(50);

  useEffect(() => {
    setData(null);
    setFailed(false);
    api<Data>(`/api/admin/visits?site=${site}&days=${range}`)
      .then((d) => setData(d as unknown as Data))
      .catch(() => setFailed(true));
  }, [site, range]);

  const view = useMemo(() => {
    if (!data) return null;
    const visits = data.visits;
    const views = visits.reduce((s, v) => s + v.views, 0);
    const multi = visits.filter((v) => v.views > 1);
    const avg = multi.length ? multi.reduce((s, v) => s + seconds(v), 0) / multi.length : 0;
    const mobile = visits.filter((v) => v.device !== "Desktop").length;

    // Bars: days, or months for the twelve-month view.
    const monthly = data.days > 90;
    const buckets: { key: string; label: string; visitors: number; views: number }[] = [];
    if (monthly) {
      const [y, m] = data.today.split("-").map(Number);
      for (let back = 11; back >= 0; back -= 1) {
        const d = new Date(Date.UTC(y, m - 1 - back, 1));
        buckets.push({ key: d.toISOString().slice(0, 7), label: `${MONTHS[d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(2)}`, visitors: 0, views: 0 });
      }
    } else {
      const n = Math.max(7, data.days);
      for (let i = n - 1; i >= 0; i -= 1) {
        const day = shift(data.today, -i);
        buckets.push({ key: day, label: short(day), visitors: 0, views: 0 });
      }
    }
    const byKey = new Map(buckets.map((b) => [b.key, b]));
    for (const v of visits) {
      const b = byKey.get(monthly ? v.day.slice(0, 7) : v.day);
      if (b) {
        b.visitors += 1;
        b.views += v.views;
      }
    }

    return {
      visits,
      views,
      avg,
      perVisit: visits.length ? views / visits.length : 0,
      mobile: visits.length ? Math.round((mobile / visits.length) * 100) : 0,
      bounce: visits.length ? Math.round((visits.filter((v) => v.views === 1).length / visits.length) * 100) : 0,
      buckets,
      cities: rank(visits, (v) => place(v)),
      countries: rank(visits, (v) => country(v.country)),
      sources: rank(visits, (v) => v.source || "Direkt"),
      devices: rank(visits, (v) => v.device || "Unbekannt"),
      browsers: rank(visits, (v) => v.browser || "Unbekannt"),
      systems: rank(visits, (v) => v.os || "Unbekannt"),
      landings: rank(visits, (v) => pageName(v.landing)),
      pages: rank(visits, (v) => [...new Set(pagesOf(v).map(pageName))]),
      hours: Array.from({ length: 24 }, (_, h) => visits.filter((v) => new Date(v.started_at).getHours() === h).length),
    };
  }, [data]);

  const list = useMemo(() => {
    if (!view) return [];
    const q = filter.trim().toLowerCase();
    return q
      ? view.visits.filter((v) => [place(v), v.source, v.device, v.browser, v.os, pagesOf(v).map(pageName).join(" ")].join(" ").toLowerCase().includes(q))
      : view.visits;
  }, [view, filter]);

  function exportCsv() {
    const head = ["Datum", "Uhrzeit", "Stadt", "Region", "Land", "Herkunft", "Verweis", "Gerät", "Browser", "System", "Seitenaufrufe", "Dauer (s)", "Seiten"];
    const cell = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;
    const rows = list.map((v) =>
      [
        v.day,
        new Date(v.started_at).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }),
        v.city ?? "",
        v.region ?? "",
        country(v.country),
        v.source ?? "",
        v.referrer ?? "",
        v.device ?? "",
        v.browser ?? "",
        v.os ?? "",
        v.views,
        Math.round(seconds(v)),
        pagesOf(v).map(pageName).join(" > "),
      ]
        .map(cell)
        .join(";"),
    );
    const blob = new Blob([`﻿${[head.map(cell).join(";"), ...rows].join("\r\n")}`], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `besucher-${site === "tu" ? "tayyipuenal" : "arbeitssicherheitscout"}-${data?.today}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  const width = 1100;
  const height = 200;
  const top = 16;
  const bottom = 28;
  const plot = height - top - bottom;
  const max = Math.max(1, ...(view?.buckets.map((b) => b.visitors) ?? [1]));
  const ticks = [0, Math.ceil(max / 2), max].filter((v, i, all) => all.indexOf(v) === i);
  const slot = view ? width / view.buckets.length : 1;
  const bar = Math.min(22, slot * 0.55);
  const labelEvery = view ? Math.ceil(view.buckets.length / 12) : 1;
  const active = hover === null || !view ? null : view.buckets[hover];
  const hourMax = Math.max(1, ...(view?.hours ?? [1]));

  return (
    <>
      <div className="vs-bar">
        <div className="vs-switch" role="tablist" aria-label="Website">
          {SITES.map(([key, label]) => (
            <button key={key} type="button" role="tab" aria-selected={site === key} className={site === key ? "is-active" : ""} onClick={() => setSite(key)}>
              {label}
            </button>
          ))}
        </div>
        <div className="vs-switch" role="tablist" aria-label="Zeitraum">
          {RANGES.map(([days, label]) => (
            <button key={days} type="button" role="tab" aria-selected={range === days} className={range === days ? "is-active" : ""} onClick={() => setRange(days)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {failed && <p className="pt-empty">Die Besucherzahlen konnten nicht geladen werden.</p>}
      {!view && !failed && <p className="pt-empty">Wird geladen …</p>}

      {view && data && (
        <>
          <div className="pt-stats vs-stats">
            <div className="pt-card">
              <small>Besucher</small>
              <strong>{nf.format(view.visits.length)}</strong>
              <span>
                gesamt {nf.format(data.totals.visitors)}
                {data.totals.since ? ` seit ${short(data.totals.since)}${data.totals.since.slice(0, 4)}` : ""}
              </span>
            </div>
            <div className="pt-card">
              <small>Seitenaufrufe</small>
              <strong>{nf.format(view.views)}</strong>
              <span>{view.perVisit.toLocaleString("de-DE", { maximumFractionDigits: 1 })} Seiten pro Besuch</span>
            </div>
            <div className="pt-card">
              <small>Ø Verweildauer</small>
              <strong>{duration(view.avg)}</strong>
              <span>{view.bounce} % sehen nur eine Seite</span>
            </div>
            <div className="pt-card">
              <small>Mobil</small>
              <strong>{view.mobile} %</strong>
              <span>Handy und Tablet</span>
            </div>
          </div>

          <section className="pt-card">
            <h2>Besucher {data.days > 90 ? "pro Monat" : "pro Tag"}</h2>
            <p className="pt-hint">Jeder Besucher zählt pro Tag einmal. Bots, Ihre eigene Internetverbindung und angemeldete Portal-Nutzer zählen nicht.</p>
            <div className="kpi-chart">
              <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Besucher im gewählten Zeitraum">
                {ticks.map((tick) => {
                  const y = top + plot - (tick / max) * plot;
                  return (
                    <g key={tick}>
                      <line x1={0} x2={width} y1={y} y2={y} className="kpi-grid" />
                      <text x={0} y={y - 4} className="kpi-axis">
                        {tick}
                      </text>
                    </g>
                  );
                })}
                {view.buckets.map((b, index) => {
                  const h = (b.visitors / max) * plot;
                  const x = index * slot + (slot - bar) / 2;
                  const y = top + plot - h;
                  const r = Math.min(4, h / 2);
                  return (
                    <g key={b.key} onMouseEnter={() => setHover(index)} onMouseLeave={() => setHover(null)}>
                      <rect x={index * slot} y={top} width={slot} height={plot + bottom} fill="transparent" />
                      {h > 0 && (
                        <path
                          className={hover === index ? "kpi-bar is-hover" : "kpi-bar"}
                          d={`M${x},${top + plot} V${y + r} Q${x},${y} ${x + r},${y} H${x + bar - r} Q${x + bar},${y} ${x + bar},${y + r} V${top + plot} Z`}
                        />
                      )}
                      {(view.buckets.length - 1 - index) % labelEvery === 0 && (
                        <text x={index * slot + slot / 2} y={height - 8} textAnchor="middle" className="kpi-axis">
                          {b.label}
                        </text>
                      )}
                    </g>
                  );
                })}
              </svg>
              <p className="kpi-tooltip" aria-live="polite">
                {active ? (
                  <>
                    <b>{active.label}</b> · {nf.format(active.visitors)} Besucher · {nf.format(active.views)} Seitenaufrufe
                  </>
                ) : (
                  "Fahren Sie über einen Balken für Details."
                )}
              </p>
            </div>
          </section>

          <div className="vs-grid">
            <Breakdown title="Städte" rows={view.cities} total={view.visits.length} limit={10} />
            <Breakdown title="Herkunft" rows={view.sources} total={view.visits.length} />
            <Breakdown title="Einstiegsseiten" rows={view.landings} total={view.visits.length} />
            <Breakdown title="Besuchte Seiten" rows={view.pages} total={view.visits.length} />
            <Breakdown title="Geräte" rows={view.devices} total={view.visits.length} />
            <Breakdown title="Länder" rows={view.countries} total={view.visits.length} />
            <Breakdown title="Browser" rows={view.browsers} total={view.visits.length} />
            <Breakdown title="Betriebssysteme" rows={view.systems} total={view.visits.length} />
          </div>

          <section className="pt-card">
            <h2>Uhrzeit der Besuche</h2>
            <p className="pt-hint">Wann Besucher auf die Seite kommen, nach Stunde des Tages.</p>
            <div className="vs-hours" role="img" aria-label="Besuche nach Uhrzeit">
              {view.hours.map((count, hour) => (
                <div key={hour} title={`${hour}–${hour + 1} Uhr: ${count} Besuche`}>
                  <i style={{ height: `${(count / hourMax) * 100}%` }} />
                  <small>{hour % 3 === 0 ? hour : ""}</small>
                </div>
              ))}
            </div>
          </section>

          <section className="pt-card pt-table-card">
            <div className="pt-table-head vs-list-head">
              <h2>Alle Besuche</h2>
              <input type="search" placeholder="Filtern nach Stadt, Herkunft, Gerät, Seite …" value={filter} onChange={(e) => setFilter(e.target.value)} />
              <button type="button" className="button button-light" onClick={exportCsv} disabled={!list.length}>
                <Download size={16} aria-hidden="true" /> Excel (CSV)
              </button>
            </div>
            {list.length === 0 ? (
              <p className="pt-empty">Keine Besuche im gewählten Zeitraum.</p>
            ) : (
              <div className="vs-table-wrap">
                <table className="pt-table vs-table">
                  <thead>
                    <tr>
                      <th>Zeit</th>
                      <th>Ort</th>
                      <th>Herkunft</th>
                      <th>Gerät</th>
                      <th>Seiten</th>
                      <th>Dauer</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.slice(0, listSize).map((v) => (
                      <tr key={v.id}>
                        <td data-label="Zeit">{time(v.started_at)}</td>
                        <td data-label="Ort">{place(v)}</td>
                        <td data-label="Herkunft">{v.source || "Direkt"}</td>
                        <td data-label="Gerät">
                          {v.device} · {v.browser} · {v.os}
                        </td>
                        <td data-label="Seiten">
                          <span className="vs-path">{pagesOf(v).map(pageName).join(" → ")}</span>
                        </td>
                        <td data-label="Dauer">{duration(seconds(v))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {list.length > listSize && (
              <button type="button" className="text-link vs-more" onClick={() => setListSize(listSize + 100)}>
                Weitere {Math.min(100, list.length - listSize)} von {nf.format(list.length - listSize)} anzeigen
              </button>
            )}
          </section>
        </>
      )}
    </>
  );
}
