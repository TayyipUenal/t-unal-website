import { useMemo } from "react";
import type { PartnerLead } from "./api";
import { MonthChart, monthly } from "./Kpis";

/** How many customers the partner brought in per month over the last year, with this month, last month and the best month. */
export function PartnerMonths({ leads }: { leads: PartnerLead[] }) {
  const months = useMemo(() => monthly(leads), [leads]);
  const current = months[months.length - 1];
  const previous = months[months.length - 2];
  const best = months.reduce((top, month) => (month.total > top.total ? month : top), months[0]);
  const year = months.reduce((sum, month) => sum + month.total, 0);

  return (
    <section className="pt-card">
      <div className="pt-table-head pt-months-head">
        <div>
          <h2>Ihre Entwicklung</h2>
          <p className="pt-hint">Wie viele Kunden Sie pro Monat zu uns gebracht haben, letzte zwölf Monate.</p>
        </div>
      </div>
      <div className="pt-months-stats">
        <div>
          <small>Dieser Monat</small>
          <strong>{current.total}</strong>
        </div>
        <div>
          <small>Letzter Monat</small>
          <strong>{previous.total}</strong>
        </div>
        <div>
          <small>Bester Monat</small>
          <strong>{best.total ? best.total : "–"}</strong>
          {best.total > 0 && <span>{best.label}</span>}
        </div>
        <div>
          <small>Letzte zwölf Monate</small>
          <strong>{year}</strong>
        </div>
      </div>
      <MonthChart months={months} unit={["Kunde", "Kunden"]} />
    </section>
  );
}
