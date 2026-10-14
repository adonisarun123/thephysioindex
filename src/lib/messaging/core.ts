/**
 * Pure helpers for notification delivery (MSG-01, MSG-02). No database or
 * network access here, so the rules are unit-testable.
 */

/** Provider failure with a retry classification (MSG-01). */
export class SendError extends Error {
  constructor(
    message: string,
    readonly permanent: boolean,
    readonly status?: number,
  ) {
    super(message);
    this.name = "SendError";
  }
}

/** HTTP status → permanent? 4xx are permanent except timeout and rate limiting. */
export function isPermanentStatus(status: number): boolean {
  return status >= 400 && status < 500 && status !== 408 && status !== 429;
}

/** Normalise anything thrown by a provider into a SendError. Network errors and timeouts are temporary. */
export function classify(err: unknown): SendError {
  if (err instanceof SendError) return err;
  const message = err instanceof Error ? err.message : String(err);
  return new SendError(message.slice(0, 500), false);
}

/** Retry schedule after attempt n (1-based): 1, 5, 15, 60, 180 minutes. */
const BACKOFF_MINUTES = [1, 5, 15, 60, 180];
export const MAX_ATTEMPTS = BACKOFF_MINUTES.length + 1;

export function backoffMinutes(attempt: number): number {
  return BACKOFF_MINUTES[Math.min(Math.max(attempt, 1), BACKOFF_MINUTES.length) - 1];
}

/** After a failed attempt: retry later, or give up into the operations queue. */
export function nextStateAfterFailure(attempt: number, permanent: boolean): { state: "failed" | "dead"; retryInMinutes: number | null } {
  if (permanent || attempt >= MAX_ATTEMPTS) return { state: "dead", retryInMinutes: null };
  return { state: "failed", retryInMinutes: backoffMinutes(attempt) };
}

/**
 * Render a `{{name}}` template. A placeholder with no value is a template
 * defect, so it fails permanently instead of sending a broken message.
 */
export function render(template: string, vars: Record<string, string | number | null | undefined>): string {
  return template.replace(/\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}/g, (_m, key: string) => {
    const v = vars[key];
    if (v === undefined || v === null || v === "") throw new SendError(`template variable "${key}" has no value`, true);
    return String(v);
  });
}

/** Placeholders a template uses, in order of first appearance. */
export function placeholders(template: string): string[] {
  const out: string[] = [];
  for (const m of template.matchAll(/\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}/g)) if (!out.includes(m[1])) out.push(m[1]);
  return out;
}

const dt = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true });

/** Appointment time as patients read it, always in IST (DAT-14). */
export function localDateTime(at: Date | string): string {
  return `${dt.format(new Date(at))} IST`;
}

/**
 * Reminder send times for an appointment (Section 13): one per offset,
 * skipping windows that have already passed (or fall within the lead time).
 */
export function reminderTimes(startsAt: Date, offsetsMinutes: number[], now: Date, minLeadMinutes = 5): { offset: number; at: Date }[] {
  return offsetsMinutes
    .filter((o) => Number.isFinite(o) && o > 0)
    .map((offset) => ({ offset, at: new Date(startsAt.getTime() - offset * 60_000) }))
    .filter((r) => r.at.getTime() > now.getTime() + minLeadMinutes * 60_000);
}

/** Deduplication key (MSG-02): event, recipient, channel and template version. */
export function dedupeKey(parts: { eventId: string; recipientType: string; recipientId: string; channel: string; templateVersion: number }): string {
  return `${parts.eventId}:${parts.recipientType}:${parts.recipientId}:${parts.channel}:v${parts.templateVersion}`;
}

/** Reminder key: one per booking version, offset and channel, so a reschedule creates fresh ones. */
export function reminderKey(bookingId: string, bookingVersion: number, offset: number, channel: string): string {
  return `reminder:${bookingId}:v${bookingVersion}:${offset}:${channel}`;
}
