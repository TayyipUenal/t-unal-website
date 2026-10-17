const top = [
  "ISO 9001 Qualität",
  "ISO 14001 Umwelt",
  "ISO 45001 Arbeitsschutz",
  "SCC Zertifizierung",
  "Internes Audit",
  "Lieferantenaudit",
  "Zertifizierungsreife",
  "Managementbewertung",
];
const bottom = [
  "Gefährdungsbeurteilung",
  "Unterweisungen",
  "Schulungen vor Ort",
  "Prozessdokumentation",
  "Maßnahmenplan",
  "Rechtssicherheit",
  "Auditbegleitung",
  "Persönlich in Dortmund",
];

function Track({ items, reverse = false }: { items: string[]; reverse?: boolean }) {
  // The list is doubled so the loop can slide by exactly half of its width.
  const loop = [...items, ...items];
  return (
    <div className={reverse ? "mq-track is-reverse" : "mq-track"}>
      {loop.map((label, index) => (
        <span className="mq-tag" key={`${label}-${index}`} aria-hidden={index >= items.length || undefined}>
          <i />
          {label}
        </span>
      ))}
    </div>
  );
}

/** Two slow tag lines under the hero; paused on hover. Decorative repetition of the services. */
export function Marquee() {
  return (
    <section className="marquee" aria-label="Themen und Normen">
      <Track items={top} />
      <Track items={bottom} reverse />
    </section>
  );
}
