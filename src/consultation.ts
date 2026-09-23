/**
 * What the consultation dialog asks for. The topic must be one of the topics
 * the mail endpoint accepts (public/api/inquiry.php); the message is an
 * editable template that tells the owner what the visitor wants.
 */
export type ConsultationPreset = {
  kicker: string;
  title: string;
  topic: string;
  message?: string;
};

export const firstMeetingPreset: ConsultationPreset = {
  kicker: "Persönlich. Klar. Unverbindlich.",
  title: "Ihr Erstgespräch.",
  topic: "Erstgespräch",
};

export function sccQuotePreset(course?: "Dok. 017" | "Dok. 018"): ConsultationPreset {
  return {
    kicker: "Angebot für Ihr Team",
    title: "SCC-Schulung anfragen.",
    topic: "SCC-Schulung",
    message: `Schulung: ${course ? `SCC ${course}` : "SCC Dok. 017 / Dok. 018"}\nAnzahl Teilnehmende: \nGewünschter Zeitraum: `,
  };
}

export function appointmentPreset(subject = ""): ConsultationPreset {
  return {
    kicker: "Persönlich. Klar. Unverbindlich.",
    title: "Termin vereinbaren.",
    topic: "Terminanfrage",
    message: `Wunschtermin (Tag und Uhrzeit): \nThema: ${subject}`,
  };
}
