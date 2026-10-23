import type { CSSProperties } from "react";
import { STATUS_LABEL, type PartnerLead } from "./api";
import { AREAS, areaLabel } from "./areas";

/**
 * The partner's network as a family tree: the partner at the top, the areas below,
 * and every company or person they brought in as a leaf with its current stage.
 */
export function PartnerTree({ name, leads, showStatus }: { name: string; leads: PartnerLead[]; showStatus: boolean }) {
  const groups = [...AREAS.map((area) => area.key as string), ""]
    .map((key) => ({ key, leads: leads.filter((lead) => (lead.category ?? "") === key) }))
    .filter((group) => group.leads.length > 0);
  if (!groups.length) return null;

  const delay = (step: number): CSSProperties => ({ ["--d" as string]: `${step * 90}ms` });

  return (
    <section className="pt-card pt-tree-card" aria-label="Ihr Netzwerk">
      <div className="pt-table-head">
        <div>
          <h2>Ihr Netzwerk</h2>
          <p className="pt-hint">Alle Firmen und Personen, die Sie zu uns gebracht haben, nach Bereich.</p>
        </div>
        <p className="pt-group-count">
          {leads.length} {leads.length === 1 ? "Kunde" : "Kunden"} · {groups.length} {groups.length === 1 ? "Bereich" : "Bereiche"}
        </p>
      </div>
      <div className="pt-tree-scroll">
        <div className="pt-tree">
          <ul>
            <li>
              <span className="pt-node is-root" style={delay(0)}>
                <small>Partner</small>
                <b>{name}</b>
              </span>
              <ul>
                {groups.map((group, g) => (
                  <li key={group.key || "other"}>
                    <span className="pt-node is-area" style={delay(1 + g)}>
                      <b>{group.key ? areaLabel(group.key) : "Weitere Kunden"}</b>
                      <small>{group.leads.length}</small>
                    </span>
                    <ul>
                      {group.leads.map((lead, i) => (
                        <li key={lead.id}>
                          <span className={`pt-node is-leaf${lead.status ? ` is-${lead.status}` : ""}`} style={delay(2 + g + i)}>
                            <b>{lead.company || lead.contact_name}</b>
                            {lead.company && lead.contact_name !== lead.company && <small>{lead.contact_name}</small>}
                            {showStatus && lead.status && (
                              <em>
                                <i aria-hidden="true" /> {STATUS_LABEL[lead.status]}
                              </em>
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </li>
          </ul>
        </div>
      </div>
    </section>
  );
}
