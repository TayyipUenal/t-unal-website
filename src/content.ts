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
  whatsappHref:
    'https://wa.me/4915563084795?text=Guten%20Tag%20Herr%20%C3%9Cnal%2C%20ich%20interessiere%20mich%20f%C3%BCr%20ein%20Erstgespr%C3%A4ch.',
  address: 'Antonio-Segni-Str. 4, 44263 Dortmund',
  mapsHref:
    'https://maps.google.com/?q=Antonio-Segni-Str.+4,+44263+Dortmund',
  linkedIn: 'https://www.linkedin.com/in/tayyip-%C3%BCnal-b06954288/',
  provenExpert: 'https://www.provenexpert.com/tayyip-uenal/',
}
