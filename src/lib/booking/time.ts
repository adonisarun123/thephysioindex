/**
 * Asia/Kolkata wall-clock helpers for the booking engine. IST has a fixed
 * +05:30 offset and no DST, so conversions are exact without a tz database.
 * Storage stays UTC timestamptz; these helpers only map local dates and times
 * (CAL-05 "all entry screens identify the timezone", CAL-08).
 */

export const BOOKING_TZ = "Asia/Kolkata";
const OFFSET = "+05:30";
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isLocalDate(s: string): boolean {
  return DATE.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00${OFFSET}`));
}

/** Local date + "HH:MM" or "HH:MM:SS" (24:00 allowed as end of day) → epoch ms. */
export function localToUtcMs(date: string, time: string): number {
  const t = time.length === 5 ? `${time}:00` : time.slice(0, 8);
  if (t.startsWith("24:")) return Date.parse(`${addDays(date, 1)}T00:00:00${OFFSET}`);
  const ms = Date.parse(`${date}T${t}${OFFSET}`);
  if (Number.isNaN(ms)) throw new Error(`invalid local time ${date} ${time}`);
  return ms;
}

/** 0 = Sunday … 6 = Saturday for a local calendar date. */
export function localWeekday(date: string): number {
  return new Date(`${date}T12:00:00${OFFSET}`).getUTCDay();
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

/** Local calendar date of an instant. */
export function localDateOf(ms: number): string {
  return new Date(ms + 330 * 60_000).toISOString().slice(0, 10);
}

/** Local "HH:MM" of an instant. */
export function localTimeOf(ms: number): string {
  return new Date(ms + 330 * 60_000).toISOString().slice(11, 16);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

export function formatLocal(ms: number | Date | string, opts: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }): string {
  return new Date(ms).toLocaleString("en-IN", { ...opts, timeZone: BOOKING_TZ });
}
