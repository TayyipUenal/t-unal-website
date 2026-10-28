import { useEffect, useMemo, useState } from "react";
import { api } from "./api";

type Day = { day: string; visitors: number; views: number };
const nf = new Intl.NumberFormat("de-DE");
const short = (day: string) => `${day.slice(8, 10)}.${day.slice(5, 7)}.`;
const shift = (day: string, by: number) => new Date(Date.parse(`${day}T12:00:00Z`) + by * 86400000).toISOString().slice(0, 10);

/** Website visitors for the superadmin: headline numbers and the last 30 days as bars. */
export function Visits() {
  const [data, setData] = useState<{ today: string; days: Day[] } | null>(null);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    api<{ today: string; days: Day[] }>("/api/admin/visits").then(setData).catch(() => setData(null));
  }, []);

  const view = useMemo(() => {
    if (!data) return null;
    const byDay = new Map(data.days.map((d) => [d.day, d]));
    const last30 = Array.from({ length: 30 }, (_, i) => {
      const day = shift(data.today, i - 29);
      return byDay.get(day) ?? { day, visitors: 0, views: 0 };
    });
    const sum = (list: Day[], key: "visitors" | "views") => list.reduce((s, d) => s + d[key], 0);
    const month = data.today.slice(0, 7);
    return {
      last30,
      today: byDay.get(data.today) ?? { day: data.today, visitors: 0, views: 0 },
      week: sum(last30.slice(-7), "visitors"),
      month: sum(data.days.filter((d) => d.day.startsWith(month)), "visitors"),
      total: sum(data.days, "visitors"),
      totalViews: sum(data.days, "views"),
      since: data.days[0]?.day,
    };
  }, [data]);

  if (!view) return null;
  const max = Math.max(1, ...view.last30.map((d) => d.visitors));
  const width = 1100;
  const height = 200;
  const top = 16;
  const bottom = 28;
  const plot = height - top - bottom;
  const slot = width / view.last30.length;
  const bar = Math.min(22, slot * 0.55);
  const ticks = [0, Math.ceil(max / 2), max].filter((v, i, all) => all.indexOf(v) === i);
  const active = hover === null ? null : view.last30[hover];

  return (
    <>
      <div className="pt-stats">
        <div className="pt-card">
          <small>Besucher heute</small>
          <strong>{nf.format(view.today.visitors)}</strong>
          <span>{nf.format(view.today.views)} Seitenaufrufe</span>
        </div>
        <div className="pt-card">
          <small>Letzte 7 Tage</small>
          <strong>{nf.format(view.week)}</strong>
          <span>Besucher</span>
        </div>
        <div className="pt-card">
          <small>Dieser Monat</small>
          <strong>{nf.format(view.month)}</strong>
          <span>Besucher</span>
        </div>
        <div className="pt-card">
          <small>Gesamt</small>
          <strong>{nf.format(view.total)}</strong>
          <span>{view.since ? `seit ${short(view.since)}${view.since.slice(0, 4)}` : "Zählung läuft"} · {nf.format(view.totalViews)} Aufrufe</span>
        </div>
      </div>

      <section className="pt-card">
        <h2>Besucher der Website</h2>
        <p className="pt-hint">Letzte 30 Tage. Pro Tag zählt jeder Besucher einmal; Bots und angemeldete Portal-Nutzer zählen nicht.</p>
        <div className="kpi-chart">
          <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Besucher pro Tag in den letzten 30 Tagen">
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
            {view.last30.map((d, index) => {
              const h = (d.visitors / max) * plot;
              const x = index * slot + (slot - bar) / 2;
              const y = top + plot - h;
              const r = Math.min(4, h / 2);
              return (
                <g key={d.day} onMouseEnter={() => setHover(index)} onMouseLeave={() => setHover(null)}>
                  <rect x={index * slot} y={top} width={slot} height={plot + bottom} fill="transparent" />
                  {h > 0 && (
                    <path
                      className={hover === index ? "kpi-bar is-hover" : "kpi-bar"}
                      d={`M${x},${top + plot} V${y + r} Q${x},${y} ${x + r},${y} H${x + bar - r} Q${x + bar},${y} ${x + bar},${y + r} V${top + plot} Z`}
                    />
                  )}
                  {index % 5 === 4 && (
                    <text x={index * slot + slot / 2} y={height - 8} textAnchor="middle" className="kpi-axis">
                      {short(d.day)}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
          <p className="kpi-tooltip" aria-live="polite">
            {active ? (
              <>
                <b>{short(active.day)}</b> · {nf.format(active.visitors)} Besucher · {nf.format(active.views)} Seitenaufrufe
              </>
            ) : (
              "Fahren Sie über einen Tag für Details."
            )}
          </p>
        </div>
      </section>
    </>
  );
}
