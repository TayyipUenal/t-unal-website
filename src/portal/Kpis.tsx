import { useMemo, useState } from "react";
import { euro, type AdminLead } from "./api";
import { areaLabel } from "./areas";

const MONTHS = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
const percent = (part: number, whole: number) => (whole ? `${Math.round((part / whole) * 100)} %` : "–");

export type Month = { key: string; label: string; total: number; won: number };

/** Last twelve months, oldest first, counted by the month a lead came in. */
export function monthly(leads: { created_at: string; status: string | null }[]): Month[] {
  const now = new Date();
  const months: Month[] = [];
  for (let back = 11; back >= 0; back -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - back, 1);
    months.push({
      key: `${date.getFullYear()}-${date.getMonth()}`,
      label: `${MONTHS[date.getMonth()]} ${String(date.getFullYear()).slice(2)}`,
      total: 0,
      won: 0,
    });
  }
  const byKey = new Map(months.map((month) => [month.key, month]));
  for (const lead of leads) {
    const created = new Date(lead.created_at);
    const month = byKey.get(`${created.getFullYear()}-${created.getMonth()}`);
    if (!month) continue;
    month.total += 1;
    if (lead.status === "won") month.won += 1;
  }
  return months;
}

/** Inquiries per month as thin bars with a hover tooltip; a table view sits underneath. */
export function MonthChart({ months, unit = ["Anfrage", "Anfragen"] }: { months: Month[]; unit?: [string, string] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...months.map((month) => month.total));
  const width = 1100;
  const height = 220;
  const top = 16;
  const bottom = 28;
  const plot = height - top - bottom;
  const slot = width / months.length;
  const bar = Math.min(28, slot * 0.5);
  const ticks = [0, Math.ceil(max / 2), max].filter((value, index, all) => all.indexOf(value) === index);
  const active = hover === null ? null : months[hover];

  return (
    <div className="kpi-chart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${unit[1]} pro Monat in den letzten zwölf Monaten`}>
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
        {months.map((month, index) => {
          const h = (month.total / max) * plot;
          const x = index * slot + (slot - bar) / 2;
          const y = top + plot - h;
          const r = Math.min(4, h / 2);
          return (
            <g key={month.key} onMouseEnter={() => setHover(index)} onMouseLeave={() => setHover(null)}>
              <rect x={index * slot} y={top} width={slot} height={plot + bottom} fill="transparent" />
              {h > 0 && (
                <path
                  className={hover === index ? "kpi-bar is-hover" : "kpi-bar"}
                  d={`M${x},${top + plot} V${y + r} Q${x},${y} ${x + r},${y} H${x + bar - r} Q${x + bar},${y} ${x + bar},${y + r} V${top + plot} Z`}
                />
              )}
              <text x={index * slot + slot / 2} y={height - 8} textAnchor="middle" className="kpi-axis">
                {month.label}
              </text>
            </g>
          );
        })}
      </svg>
      <p className="kpi-tooltip" aria-live="polite">
        {active ? (
          <>
            <b>{active.label}</b> · {active.total} {active.total === 1 ? unit[0] : unit[1]} · {active.won} beauftragt
          </>
        ) : (
          "Fahren Sie über einen Monat für Details."
        )}
      </p>
      <details className="kpi-table-toggle">
        <summary>Als Tabelle anzeigen</summary>
        <table className="pt-table">
          <thead>
            <tr>
              <th>Monat</th>
              <th>{unit[1]}</th>
              <th>Beauftragt</th>
            </tr>
          </thead>
          <tbody>
            {months.map((month) => (
              <tr key={month.key}>
                <td>{month.label}</td>
                <td>{month.total}</td>
                <td>{month.won}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

/** Admin key figures: headline numbers, inquiries per month, partner ranking and areas. */
export function Kpis({ leads }: { leads: AdminLead[] }) {
  const stats = useMemo(() => {
    const won = leads.filter((lead) => lead.status === "won");
    const closed = leads.filter((lead) => lead.status === "won" || lead.status === "lost");
    const volume = won.reduce((sum, lead) => sum + (lead.deal_cents ?? 0), 0);
    const commission = leads.reduce((sum, lead) => sum + (lead.commission_cents ?? 0), 0);

    const partners = new Map<string, { name: string; total: number; won: number; volume: number; commission: number }>();
    for (const lead of leads) {
      const name = lead.partner_name ?? "Direkt über die Website";
      const row = partners.get(name) ?? { name, total: 0, won: 0, volume: 0, commission: 0 };
      row.total += 1;
      if (lead.status === "won") {
        row.won += 1;
        row.volume += lead.deal_cents ?? 0;
      }
      row.commission += lead.commission_cents ?? 0;
      partners.set(name, row);
    }

    const areas = new Map<string, { area: string; total: number; open: number; won: number; volume: number }>();
    for (const lead of leads) {
      const area = lead.category ?? "";
      const row = areas.get(area) ?? { area, total: 0, open: 0, won: 0, volume: 0 };
      row.total += 1;
      if (lead.status === "offer") row.open += 1;
      if (lead.status === "won") {
        row.won += 1;
        row.volume += lead.deal_cents ?? 0;
      }
      areas.set(area, row);
    }

    return {
      total: leads.length,
      won: won.length,
      closed: closed.length,
      openOffers: leads.filter((lead) => lead.status === "offer").length,
      volume,
      commission,
      months: monthly(leads),
      partners: [...partners.values()].sort((a, b) => b.volume - a.volume || b.won - a.won || b.total - a.total),
      areas: [...areas.values()].sort((a, b) => b.volume - a.volume || b.total - a.total),
    };
  }, [leads]);

  return (
    <>
      <div className="pt-stats">
        <div className="pt-card">
          <small>Anfragen</small>
          <strong>{stats.total}</strong>
          <span>{stats.openOffers === 1 ? "1 Angebot läuft" : `${stats.openOffers} Angebote laufen`}</span>
        </div>
        <div className="pt-card">
          <small>Abschlussquote</small>
          <strong>{percent(stats.won, stats.closed)}</strong>
          <span>
            {stats.won} von {stats.closed} entschiedenen Anfragen
          </span>
        </div>
        <div className="pt-card">
          <small>Auftragsvolumen</small>
          <strong>{euro(stats.volume)}</strong>
          <span>netto aus erhaltenen Aufträgen</span>
        </div>
        <div className="pt-card">
          <small>Provisionen</small>
          <strong>{euro(stats.commission)}</strong>
          <span>an Partner, offen und ausgezahlt</span>
        </div>
      </div>

      <section className="pt-card">
        <h2>Anfragen pro Monat</h2>
        <p className="pt-hint">Letzte zwölf Monate, nach Eingangsdatum.</p>
        <MonthChart months={stats.months} />
      </section>

      <section className="pt-card pt-table-card">
        <div className="pt-table-head">
          <h2>Partner im Vergleich</h2>
        </div>
        <div className="pt-scroll">
          <table className="pt-table">
            <thead>
              <tr>
                <th>Partner</th>
                <th>Kunden</th>
                <th>Beauftragt</th>
                <th>Quote</th>
                <th>Volumen netto</th>
                <th>Provision</th>
              </tr>
            </thead>
            <tbody>
              {stats.partners.map((row) => (
                <tr key={row.name}>
                  <td>
                    <b>{row.name}</b>
                  </td>
                  <td>{row.total}</td>
                  <td>{row.won}</td>
                  <td>{percent(row.won, row.total)}</td>
                  <td>{euro(row.volume)}</td>
                  <td>{euro(row.commission)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {stats.partners.length === 0 && <p className="pt-empty">Noch keine Daten.</p>}
        </div>
      </section>

      <section className="pt-card pt-table-card">
        <div className="pt-table-head">
          <h2>Bereiche</h2>
        </div>
        <div className="pt-scroll">
          <table className="pt-table">
            <thead>
              <tr>
                <th>Bereich</th>
                <th>Kunden</th>
                <th>Angebote offen</th>
                <th>Beauftragt</th>
                <th>Volumen netto</th>
              </tr>
            </thead>
            <tbody>
              {stats.areas.map((row) => (
                <tr key={row.area || "none"}>
                  <td>
                    <b>{row.area ? areaLabel(row.area) : "Nicht zugeordnet"}</b>
                  </td>
                  <td>{row.total}</td>
                  <td>{row.open}</td>
                  <td>{row.won}</td>
                  <td>{euro(row.volume)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
