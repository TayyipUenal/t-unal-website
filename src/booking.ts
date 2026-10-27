/** Bookable times. Keep in sync with BOOKING_TIMES in worker/index.ts, which checks every booking again. */
export const BOOKING_TIMES = ["09:00", "09:30", "10:00", "10:30", "11:00", "11:30", "13:00", "13:30", "14:00", "14:30", "15:00", "15:30", "16:00", "16:30"];
export const BOOKING_FORMATS = ["Telefon", "Microsoft Teams", "Vor Ort"] as const;
export const BOOKING_TOPICS = ["ISO 9001", "ISO 14001", "ISO 45001", "SCC / SCP", "Arbeitsschutz", "Schulung", "Sonstiges"];

/** "YYYY-MM-DDTHH:MM" in Berlin time for a moment. */
export function berlinStamp(date: Date) {
  const part = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
  return `${part.year}-${part.month}-${part.day}T${part.hour}:${part.minute}`;
}

export type BookingDay = { date: string; slots: string[] };

/** Monday-to-Friday weeks from this week on, with the times still open on each day. */
export function bookingWeeks(taken: Set<string>, weeks = 5): BookingDay[][] {
  const earliest = berlinStamp(new Date(Date.now() + 18 * 3600000));
  const latest = berlinStamp(new Date(Date.now() + 29 * 86400000));
  const today = new Date(`${berlinStamp(new Date()).slice(0, 10)}T12:00:00Z`);
  const monday = new Date(today.getTime() - ((today.getUTCDay() + 6) % 7) * 86400000);
  return Array.from({ length: weeks }, (_, w) =>
    Array.from({ length: 5 }, (_, d) => {
      const date = new Date(monday.getTime() + (w * 7 + d) * 86400000).toISOString().slice(0, 10);
      const slots = BOOKING_TIMES.map((t) => `${date}T${t}`).filter((s) => s >= earliest && s <= latest && !taken.has(s));
      return { date, slots };
    }),
  );
}

const fmt = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("de-DE", { ...options, timeZone: "UTC" });
const noon = (date: string) => new Date(`${date}T12:00:00Z`);
export const weekdayShort = (date: string) => fmt({ weekday: "short" }).format(noon(date)).replace(".", "");
export const dayNumber = (date: string) => fmt({ day: "numeric" }).format(noon(date));
export const monthLabel = (date: string) => fmt({ month: "long", year: "numeric" }).format(noon(date));
export const dayLong = (date: string) => fmt({ weekday: "long", day: "numeric", month: "long" }).format(noon(date));
