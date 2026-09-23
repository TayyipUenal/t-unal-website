export type AuditPackage = {
  standard: string
  title: string
  eyebrow: string
  description: string
  outcomes: string[]
}

export const auditPackages: AuditPackage[] = [
  {
    standard: 'ISO 9001',
    title: 'Qualität, die funktioniert.',
    eyebrow: 'Qualitätsmanagement',
    description:
      'Klare Prozesse, belastbare Dokumentation und eine strukturierte Vorbereitung auf Ihr Zertifizierungsaudit.',
    outcomes: ['Ist-Analyse', 'Systemaufbau', 'Auditbegleitung'],
  },
  {
    standard: 'ISO 14001',
    title: 'Umweltziele mit System.',
    eyebrow: 'Umweltmanagement',
    description:
      'Von relevanten Umweltaspekten bis zur wirksamen Umsetzung — nachvollziehbar für Team und Zertifizierer.',
    outcomes: ['Umweltanalyse', 'Maßnahmenplan', 'Zertifizierungsreife'],
  },
  {
    standard: 'ISO 45001',
    title: 'Sicherheit, die ankommt.',
    eyebrow: 'Arbeitsschutzmanagement',
    description:
      'Rechtssichere Strukturen, gelebte Verantwortung und ein Arbeitsschutzsystem, das im Alltag trägt.',
    outcomes: ['Gefährdungsbild', 'Schutzkonzept', 'Auditvorbereitung'],
  },
]

export const contact = {
  phoneLabel: '0155 63084795',
  phoneHref: 'tel:+4915563084795',
  email: 'info@tayyipuenal.de',
  address: 'Antonio-Segni-Str. 4, 44263 Dortmund',
  mapsHref:
    'https://maps.google.com/?q=Antonio-Segni-Str.+4,+44263+Dortmund',
  linkedIn: 'https://www.linkedin.com/in/tayyip-%C3%BCnal-b06954288/',
  provenExpert: 'https://www.provenexpert.com/tayyip-uenal/',
}
