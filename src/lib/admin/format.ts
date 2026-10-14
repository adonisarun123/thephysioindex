/**
 * Display helpers for the admin area. Timestamps are stored in UTC and shown
 * in Asia/Kolkata (DAT-14). Patient identifiers are masked by default (ADM-04).
 */

export const TZ = "Asia/Kolkata";

const dt = new Intl.DateTimeFormat("en-IN", { timeZone: TZ, day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
const d = new Intl.DateTimeFormat("en-IN", { timeZone: TZ, day: "2-digit", month: "short", year: "numeric" });

export function toDate(v: Date | string | number | null | undefined): Date | null {
  if (v == null || v === "") return null;
  const x = v instanceof Date ? v : new Date(v);
  return Number.isNaN(x.getTime()) ? null : x;
}

export function fmtDateTime(v: Date | string | null | undefined): string {
  const x = toDate(v);
  return x ? dt.format(x) : "—";
}

export function fmtDate(v: Date | string | null | undefined): string {
  const x = toDate(v);
  return x ? d.format(x) : "—";
}

/** Today's date in Asia/Kolkata as YYYY-MM-DD. */
export function todayIst(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export function isoDateShift(days: number, from = todayIst()): string {
  const x = new Date(`${from}T00:00:00Z`);
  x.setUTCDate(x.getUTCDate() + days);
  return x.toISOString().slice(0, 10);
}

/** Elapsed time as "3d 4h" / "5h 12m" / "8m". */
export function fmtAge(from: Date | string | null | undefined, to: Date = new Date()): string {
  const x = toDate(from);
  if (!x) return "—";
  const mins = Math.max(0, Math.floor((to.getTime() - x.getTime()) / 60_000));
  const days = Math.floor(mins / 1440);
  const hours = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${m}m`;
  return `${m}m`;
}

/** Adds N business days (Mon–Fri) to a date; used for first-response targets (ADM-02). */
export function addBusinessDays(from: Date, days: number): Date {
  const x = new Date(from.getTime());
  let left = Math.max(0, Math.floor(days));
  while (left > 0) {
    x.setUTCDate(x.getUTCDate() + 1);
    const dow = x.getUTCDay();
    if (dow !== 0 && dow !== 6) left -= 1;
  }
  return x;
}

export function isOverdue(submittedAt: Date | string, firstResponseAt: Date | string | null | undefined, targetBusinessDays: number, now = new Date()): boolean {
  if (firstResponseAt) return false;
  const s = toDate(submittedAt);
  if (!s) return false;
  return addBusinessDays(s, targetBusinessDays).getTime() < now.getTime();
}

/** +91 •••••123 — last three digits only (ADM-04). */
export function maskMobile(m: string | null | undefined): string {
  if (!m) return "—";
  const digits = m.replace(/\D/g, "");
  const last = digits.slice(-3);
  const cc = digits.length > 10 ? `+${digits.slice(0, digits.length - 10)} ` : "";
  return `${cc}•••••${last}`;
}

export function maskEmail(e: string | null | undefined): string {
  if (!e) return "—";
  const [local, domain] = e.split("@");
  if (!domain) return "•••";
  return `${local.slice(0, 1)}•••@${domain}`;
}

export function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function pct(numerator: number, denominator: number): string {
  if (!denominator) return "—";
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

export function titleCase(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Tone for status pills. */
export function tone(status: string | null | undefined): "ok" | "warn" | "bad" | "muted" | "info" {
  switch (status) {
    case "published":
    case "approved":
    case "active":
    case "completed":
    case "confirmed":
    case "registration_checked":
    case "resolved":
    case "claimed":
    case "verified":
    case "valid":
    case "decided":
      return "ok";
    case "submitted":
    case "pending":
    case "open":
    case "in_review":
    case "in_progress":
    case "requested":
    case "received":
    case "awaiting_evidence":
    case "changes_requested":
    case "evidence_requested":
    case "under_review":
    case "staged":
    case "validated":
    case "document_reviewed":
    case "waiting_on_requester":
    case "new":
    case "forwarded":
      return "warn";
    case "rejected":
    case "suspended":
    case "revoked":
    case "expired":
    case "invalid":
    case "duplicate":
    case "failed":
    case "no_show":
    case "patient_cancelled":
    case "provider_cancelled":
    case "declined":
    case "unverifiable":
    case "urgent":
      return "bad";
    case "draft":
    case "archived":
    case "closed":
    case "merged":
    case "superseded":
    case "self_declared":
    case "unclaimed":
    case "inactive":
    case "reverted":
    case "withdrawn":
    case "dismissed":
    case "skipped":
      return "muted";
    default:
      return "info";
  }
}

export const CASE_TYPE_LABELS: Record<string, string> = {
  listing_review: "New listing",
  profile_change: "Profile change",
  claim: "Claim",
  credential_check: "Credential check",
  duplicate_candidate: "Duplicate candidate",
  offer_review: "Offer review",
  review_moderation: "Review moderation",
  complaint: "Complaint",
  correction_request: "Correction request",
  locality_proposal: "Locality proposal",
  credential_fraud: "Suspected credential fraud",
  ownership_transfer: "Ownership transfer",
  role_escalation: "Role escalation",
};

export const CASE_TYPES = Object.keys(CASE_TYPE_LABELS);

export function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = Number.parseInt(String(v ?? ""), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function qs(params: Record<string, string | number | boolean | null | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "" || v === false) continue;
    sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export type SP = Record<string, string | string[] | undefined>;
