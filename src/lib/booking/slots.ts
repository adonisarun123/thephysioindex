import { sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { addDays, BOOKING_TZ, localDateOf, localTimeOf, localToUtcMs, localWeekday } from "./time";

/**
 * Slot construction (CAL-05..CAL-08, CAL-11). `buildSlots` is pure so the
 * same rules serve the public calendar, the hold transaction (which reloads
 * inputs under the calendar row lock) and the tests.
 *
 * Precedence (CAL-06): suspension or offering closure (checked by the caller)
 * → leave and manual blocks → existing reservations including buffers →
 * date-specific overrides → recurring windows. An override with no windows
 * means closed for that date.
 */

export type Interval = { start: number; end: number }; // epoch ms, half-open [start, end)

export type SlotRule = {
  branchId: string;
  offeringId: string | null; // null = every offering at the branch
  weekday: number; // 0 = Sunday
  localStart: string; // HH:MM[:SS]
  localEnd: string;
  effectiveFrom: string; // YYYY-MM-DD
  effectiveTo: string | null;
};

export type SlotException = {
  kind: "leave" | "manual_block" | "date_override" | "extra_hours" | "external_busy";
  branchId: string | null;
  startsAt: number;
  endsAt: number;
  localDate: string | null;
  replacementWindows: { branchId: string; start: string; end: string }[] | null;
};

export type SlotTerms = {
  offeringVersionId: string;
  durationMin: number;
  intervalMin: number;
  bufferBeforeMin: number;
  bufferAfterMin: number;
  minNoticeMin: number;
  horizonDays: number;
  activeFrom: string;
  activeTo: string | null;
};

export type SlotInput = {
  offeringId: string;
  branchId: string;
  terms: SlotTerms;
  rules: SlotRule[];
  exceptions: SlotException[];
  /** Occupied ranges of held (unexpired) and committed reservations across every branch (CAL-07). */
  busy: Interval[];
  now: number;
  fromDate: string;
  toDate: string; // inclusive
};

export type Slot = {
  startsAt: number;
  endsAt: number; // patient-facing appointment end; buffers are internal (CAL-08)
  occupied: Interval;
  localDate: string;
  localTime: string;
};

const MIN = 60_000;
const BLOCKING: SlotException["kind"][] = ["leave", "manual_block", "external_busy"];

export function occupiedInterval(startsAt: number, t: Pick<SlotTerms, "durationMin" | "bufferBeforeMin" | "bufferAfterMin">): Interval {
  return { start: startsAt - t.bufferBeforeMin * MIN, end: startsAt + (t.durationMin + t.bufferAfterMin) * MIN };
}

function overlaps(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end; // touching half-open intervals coexist (CAL-07)
}

/** Service windows for one local date at the offering's branch, before blocks and reservations. */
export function windowsForDate(input: Pick<SlotInput, "offeringId" | "branchId" | "rules" | "exceptions">, date: string): Interval[] {
  const { branchId, offeringId } = input;
  const overrides = input.exceptions.filter((e) => e.kind === "date_override" && e.localDate === date && (e.branchId === null || e.branchId === branchId));
  const out: Interval[] = [];
  if (overrides.length) {
    for (const o of overrides) {
      for (const w of o.replacementWindows ?? []) {
        if (w.branchId === branchId) out.push({ start: localToUtcMs(date, w.start), end: localToUtcMs(date, w.end) });
      }
    }
  } else {
    const wd = localWeekday(date);
    for (const r of input.rules) {
      if (r.branchId !== branchId || r.weekday !== wd) continue;
      if (r.offeringId !== null && r.offeringId !== offeringId) continue;
      if (r.effectiveFrom > date || (r.effectiveTo !== null && r.effectiveTo < date)) continue;
      out.push({ start: localToUtcMs(date, r.localStart), end: localToUtcMs(date, r.localEnd) });
    }
  }
  for (const e of input.exceptions) {
    if (e.kind !== "extra_hours" || (e.branchId !== null && e.branchId !== branchId)) continue;
    if (localDateOf(e.startsAt) === date) out.push({ start: e.startsAt, end: e.endsAt });
  }
  return out.filter((w) => w.end > w.start);
}

export function buildSlots(input: SlotInput): Slot[] {
  const t = input.terms;
  const step = Math.max(1, t.intervalMin) * MIN;
  const earliest = input.now + t.minNoticeMin * MIN; // measured from server time (CAL-08)
  const latest = input.now + t.horizonDays * 1440 * MIN;
  const blocking: Interval[] = [
    ...input.exceptions.filter((e) => BLOCKING.includes(e.kind)).map((e) => ({ start: e.startsAt, end: e.endsAt })),
    ...input.busy,
  ];
  const seen = new Set<number>();
  const slots: Slot[] = [];
  for (let date = input.fromDate; date <= input.toDate; date = addDays(date, 1)) {
    if (date < t.activeFrom || (t.activeTo !== null && date > t.activeTo)) continue;
    for (const w of windowsForDate(input, date)) {
      for (let start = w.start; ; start += step) {
        const occ = occupiedInterval(start, t);
        if (occ.end > w.end) break;
        if (occ.start < w.start) continue; // buffers must fit inside the window (CAL-07)
        if (start < earliest || start > latest || seen.has(start)) continue;
        if (blocking.some((b) => overlaps(occ, b))) continue;
        seen.add(start);
        slots.push({ startsAt: start, endsAt: start + t.durationMin * MIN, occupied: occ, localDate: date, localTime: localTimeOf(start) });
      }
    }
  }
  return slots.sort((a, b) => a.startsAt - b.startsAt);
}

// ---------------------------------------------------------------------------
// Database loaders. Callers inside a booking transaction pass the tx so the
// inputs are read after the calendar row lock (BKG-07 step 3).
// ---------------------------------------------------------------------------

export type OfferingContext = {
  offeringId: string;
  offeringName: string;
  mode: "clinic" | "home_visit" | "online";
  bookingMode: "instant" | "request";
  offeringActive: boolean;
  practitionerId: string;
  practitionerName: string;
  practitionerPublicId: string;
  practitionerSlug: string;
  isTestAccount: boolean;
  listingStatus: string;
  bookingEligible: boolean;
  bookingPaused: boolean;
  suspended: boolean;
  practitionerBranchId: string;
  associationState: string;
  associationBookable: boolean;
  associationEnded: boolean;
  branchId: string;
  branchName: string;
  branchStatus: string;
  clinicId: string;
  clinicName: string;
  clinicStatus: string;
  serviceId: string;
  resourceId: string | null;
  scheduleVersion: number;
  terms: SlotTerms;
  basePricePaise: number;
  taxPaise: number;
  extraChargesPaise: number;
  priceNote: string | null;
  policyId: string | null;
  policyVersion: string;
  selfServiceCutoffHours: number;
};

type ContextRow = {
  offering_id: string; offering_name: string; mode: OfferingContext["mode"]; booking_mode: OfferingContext["bookingMode"]; offering_active: boolean;
  practitioner_id: string; practitioner_name: string; public_id: string; slug: string; is_test_account: boolean; listing_status: string;
  booking_eligible: boolean; booking_paused: boolean; suspended: boolean; practitioner_branch_id: string; association_state: string;
  association_bookable: boolean; association_ended: boolean; branch_id: string; branch_name: string; branch_status: string; clinic_id: string;
  clinic_name: string; clinic_status: string; service_id: string; resource_id: string | null; schedule_version: string | number | null;
  offering_version_id: string; duration_min: number; interval_min: number; buffer_before_min: number; buffer_after_min: number;
  min_notice_min: number; booking_horizon_days: number; active_from: string; active_to: string | null; base_price_paise: string | number;
  tax_paise: string | number; extra_charges_paise: string | number; price_note: string | null; policy_id: string | null; policy_version: string | null;
  cutoff_hours: number | null;
};

export async function loadOfferingContext(d: Db, offeringId: string): Promise<OfferingContext | null> {
  const res = await d.execute<ContextRow>(sql`
    SELECT o.id AS offering_id, o.display_name AS offering_name, o.mode::text AS mode, ov.booking_mode::text AS booking_mode, o.active AS offering_active,
      p.id AS practitioner_id, p.display_name AS practitioner_name, p.public_id, p.slug, p.is_test_account, p.listing_status::text AS listing_status,
      p.booking_eligible, p.booking_paused, (p.suspended_at IS NOT NULL) AS suspended,
      pb.id AS practitioner_branch_id, pb.state::text AS association_state, pb.bookable AS association_bookable,
      (pb.active_to IS NOT NULL AND pb.active_to <= current_date) AS association_ended,
      b.id AS branch_id, b.name AS branch_name, b.status::text AS branch_status, c.id AS clinic_id, c.name AS clinic_name, c.status::text AS clinic_status,
      o.service_id, cr.id AS resource_id, cr.schedule_version,
      ov.id AS offering_version_id, ov.duration_min, ov.interval_min, ov.buffer_before_min, ov.buffer_after_min, ov.min_notice_min, ov.booking_horizon_days,
      ov.active_from::text AS active_from, ov.active_to::text AS active_to, ov.base_price_paise, ov.tax_paise, ov.extra_charges_paise, ov.price_note,
      pol.id AS policy_id, pol.version AS policy_version,
      coalesce((pol.content ->> 'selfServiceCutoffHours')::int, (SELECT (value #>> '{}')::int FROM platform_config WHERE key = 'booking.self_service_cutoff_hours')) AS cutoff_hours
    FROM offerings o
    JOIN offering_versions ov ON ov.id = o.current_version_id
    JOIN practitioners p ON p.id = o.practitioner_id
    JOIN practitioner_branches pb ON pb.id = o.practitioner_branch_id
    JOIN branches b ON b.id = o.branch_id
    JOIN clinics c ON c.id = b.clinic_id
    LEFT JOIN calendar_resources cr ON cr.practitioner_id = o.practitioner_id
    LEFT JOIN LATERAL (
      SELECT id, version, content FROM policies
      WHERE (ov.cancellation_policy_id IS NOT NULL AND id = ov.cancellation_policy_id)
         OR (ov.cancellation_policy_id IS NULL AND type = 'cancellation' AND key = 'default' AND superseded_at IS NULL)
      ORDER BY effective_at DESC LIMIT 1
    ) pol ON true
    WHERE o.id = ${offeringId}`);
  const r = res.rows[0];
  if (!r) return null;
  return {
    offeringId: r.offering_id,
    offeringName: r.offering_name,
    mode: r.mode,
    bookingMode: r.booking_mode,
    offeringActive: r.offering_active,
    practitionerId: r.practitioner_id,
    practitionerName: r.practitioner_name,
    practitionerPublicId: r.public_id,
    practitionerSlug: r.slug,
    isTestAccount: r.is_test_account,
    listingStatus: r.listing_status,
    bookingEligible: r.booking_eligible,
    bookingPaused: r.booking_paused,
    suspended: r.suspended,
    practitionerBranchId: r.practitioner_branch_id,
    associationState: r.association_state,
    associationBookable: r.association_bookable,
    associationEnded: r.association_ended,
    branchId: r.branch_id,
    branchName: r.branch_name,
    branchStatus: r.branch_status,
    clinicId: r.clinic_id,
    clinicName: r.clinic_name,
    clinicStatus: r.clinic_status,
    serviceId: r.service_id,
    resourceId: r.resource_id,
    scheduleVersion: Number(r.schedule_version ?? 0),
    terms: {
      offeringVersionId: r.offering_version_id,
      durationMin: Number(r.duration_min),
      intervalMin: Number(r.interval_min),
      bufferBeforeMin: Number(r.buffer_before_min),
      bufferAfterMin: Number(r.buffer_after_min),
      minNoticeMin: Number(r.min_notice_min),
      horizonDays: Number(r.booking_horizon_days),
      activeFrom: r.active_from,
      activeTo: r.active_to,
    },
    basePricePaise: Number(r.base_price_paise),
    taxPaise: Number(r.tax_paise),
    extraChargesPaise: Number(r.extra_charges_paise),
    priceNote: r.price_note,
    policyId: r.policy_id,
    policyVersion: r.policy_version ?? "cancel-default",
    selfServiceCutoffHours: Number(r.cutoff_hours ?? 12),
  };
}

export type Unbookable =
  | "not_published"
  | "not_eligible"
  | "paused"
  | "suspended"
  | "offering_closed"
  | "mode_not_supported"
  | "request_mode"
  | "location_unavailable"
  | "no_calendar"
  | "hidden";

/** Why an offering cannot take an online booking right now, or null (BKG-07 step 2). */
export function unbookableReason(c: OfferingContext, opts: { showTestAccounts: boolean }): Unbookable | null {
  if (c.isTestAccount && !opts.showTestAccounts) return "hidden";
  if (c.listingStatus !== "published") return "not_published";
  if (c.suspended) return "suspended";
  if (!c.bookingEligible) return "not_eligible";
  if (c.bookingPaused) return "paused";
  if (!c.offeringActive) return "offering_closed";
  // Home visits and online sessions are R1 (LOC-04, CAL-04); request-to-book is R1 (BKG-06).
  if (c.mode !== "clinic") return "mode_not_supported";
  if (c.bookingMode !== "instant") return "request_mode";
  if (c.associationState !== "approved" || !c.associationBookable || c.associationEnded) return "location_unavailable";
  if (c.branchStatus !== "published" || c.clinicStatus !== "published") return "location_unavailable";
  if (!c.resourceId) return "no_calendar";
  return null;
}

export const UNBOOKABLE_MESSAGES: Record<Unbookable, string> = {
  not_published: "This profile is not published.",
  not_eligible: "Online booking is not available for this practitioner.",
  paused: "Online booking is paused for this practitioner.",
  suspended: "Online booking is not available for this practitioner.",
  offering_closed: "This service is no longer offered.",
  mode_not_supported: "Home visits and online sessions cannot be booked online yet. Contact the clinic.",
  request_mode: "This service is booked on request. Send an enquiry or contact the clinic.",
  location_unavailable: "This clinic location is not taking online bookings.",
  no_calendar: "This practitioner has not published a calendar yet.",
  hidden: "Profile not found.",
};

type RuleRow = { branch_id: string; offering_id: string | null; weekday: number; local_start: string; local_end: string; effective_from: string; effective_to: string | null };
type ExceptionRow = { kind: SlotException["kind"]; branch_id: string | null; starts_at: string; ends_at: string; local_date: string | null; replacement_windows: SlotException["replacementWindows"] };
type BusyRow = { lo: string; hi: string };

/** Schedule inputs for one calendar between two instants. Busy ranges cover every branch (CAL-07). */
export async function loadScheduleInputs(
  d: Db,
  resourceId: string,
  fromMs: number,
  toMs: number,
  opts: { excludeReservationId?: string } = {},
): Promise<Pick<SlotInput, "rules" | "exceptions" | "busy">> {
  const from = new Date(fromMs).toISOString();
  const to = new Date(toMs).toISOString();
  // Sequential: inside a booking transaction all three share one pinned connection.
  const rules = await d.execute<RuleRow>(sql`
      SELECT branch_id, offering_id, weekday, local_start::text AS local_start, local_end::text AS local_end,
             effective_from::text AS effective_from, effective_to::text AS effective_to
      FROM availability_rules WHERE resource_id = ${resourceId}`);
  const exceptions = await d.execute<ExceptionRow>(sql`
      SELECT kind::text AS kind, branch_id, starts_at::text AS starts_at, ends_at::text AS ends_at, local_date::text AS local_date, replacement_windows
      FROM schedule_exceptions
      WHERE resource_id = ${resourceId} AND starts_at < ${to}::timestamptz AND ends_at > ${from}::timestamptz`);
  // Elapsed holds are not busy for display; the hold transaction expires them under lock (BKG-09).
  const busy = await d.execute<BusyRow>(sql`
      SELECT lower(occupied_range)::text AS lo, upper(occupied_range)::text AS hi FROM reservations
      WHERE resource_id = ${resourceId}
        AND (state = 'committed' OR (state = 'held' AND expires_at > now()))
        AND occupied_range && tstzrange(${from}::timestamptz, ${to}::timestamptz, '[)')
        ${opts.excludeReservationId ? sql`AND id <> ${opts.excludeReservationId}` : sql``}`);
  return {
    rules: rules.rows.map((r) => ({
      branchId: r.branch_id,
      offeringId: r.offering_id,
      weekday: Number(r.weekday),
      localStart: r.local_start,
      localEnd: r.local_end,
      effectiveFrom: r.effective_from,
      effectiveTo: r.effective_to,
    })),
    exceptions: exceptions.rows.map((e) => ({
      kind: e.kind,
      branchId: e.branch_id,
      startsAt: Date.parse(e.starts_at),
      endsAt: Date.parse(e.ends_at),
      localDate: e.local_date,
      replacementWindows: e.replacement_windows,
    })),
    busy: busy.rows.map((b) => ({ start: Date.parse(b.lo), end: Date.parse(b.hi) })),
  };
}

export type PublicSlot = {
  offeringId: string;
  offeringVersionId: string;
  branchId: string;
  startsAt: string; // UTC ISO
  endsAt: string;
  timezone: string;
  localDate: string;
  localTime: string;
  priceReference: { offeringVersionId: string; basePricePaise: number; taxPaise: number; extraChargesPaise: number };
  scheduleVersion: number;
};

/** Advisory slots for display (CAL-11). Never authorises a booking. */
export async function computeSlots(d: Db, ctx: OfferingContext, fromDate: string, toDate: string, now = Date.now()): Promise<PublicSlot[]> {
  if (!ctx.resourceId) return [];
  const fromMs = localToUtcMs(fromDate, "00:00") - 1440 * MIN;
  const toMs = localToUtcMs(addDays(toDate, 1), "00:00") + 1440 * MIN;
  const inputs = await loadScheduleInputs(d, ctx.resourceId, fromMs, toMs);
  const slots = buildSlots({ offeringId: ctx.offeringId, branchId: ctx.branchId, terms: ctx.terms, ...inputs, now, fromDate, toDate });
  return slots.map((s) => ({
    offeringId: ctx.offeringId,
    offeringVersionId: ctx.terms.offeringVersionId,
    branchId: ctx.branchId,
    startsAt: new Date(s.startsAt).toISOString(),
    endsAt: new Date(s.endsAt).toISOString(),
    timezone: BOOKING_TZ,
    localDate: s.localDate,
    localTime: s.localTime,
    priceReference: { offeringVersionId: ctx.terms.offeringVersionId, basePricePaise: ctx.basePricePaise, taxPaise: ctx.taxPaise, extraChargesPaise: ctx.extraChargesPaise },
    scheduleVersion: ctx.scheduleVersion,
  }));
}
