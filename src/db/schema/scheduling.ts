import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  customType,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { id, occurredAt, timestamps } from "./_common";
import {
  bookingSource,
  bookingStatus,
  exceptionKind,
  idempotencyState,
  paymentMode,
  paymentReported,
  reservationState,
  taskKind,
  taskState,
} from "./enums";
import { branches, offeringVersions, offerings } from "./clinics";
import { patients, users } from "./identity";
import { practitioners } from "./practitioners";

/** tstzrange column; the server derives it from the accepted offering version (DAT-15). */
export const tstzrange = customType<{ data: string; driverData: string }>({
  dataType() {
    return "tstzrange";
  },
});

/** One row per practitioner; row-locked for every capacity mutation (BKG-07). */
export const calendarResources = pgTable(
  "calendar_resources",
  {
    id: id(),
    practitionerId: uuid("practitioner_id").notNull().references(() => practitioners.id),
    scheduleVersion: bigint("schedule_version", { mode: "number" }).notNull().default(1),
    timezone: text("timezone").notNull().default("Asia/Kolkata"),
    ...timestamps,
  },
  (t) => [uniqueIndex("calendar_resources_practitioner_uq").on(t.practitionerId)],
);

/** One row per patient; locked to prevent overlapping appointments for the same patient (DAT-22). */
export const patientCalendars = pgTable(
  "patient_calendars",
  {
    id: id(),
    patientId: uuid("patient_id").notNull().references(() => patients.id),
    version: bigint("version", { mode: "number" }).notNull().default(1),
    ...timestamps,
  },
  (t) => [uniqueIndex("patient_calendars_patient_uq").on(t.patientId)],
);

/** Weekly recurring windows per branch and (optionally) offering, in local time (CAL-05). */
export const availabilityRules = pgTable(
  "availability_rules",
  {
    id: id(),
    resourceId: uuid("resource_id").notNull().references(() => calendarResources.id),
    branchId: uuid("branch_id").notNull().references(() => branches.id),
    offeringId: uuid("offering_id").references(() => offerings.id), // null = all offerings at this branch
    weekday: smallint("weekday").notNull(), // 0 = Sunday ... 6 = Saturday
    localStart: time("local_start").notNull(),
    localEnd: time("local_end").notNull(),
    timezone: text("timezone").notNull().default("Asia/Kolkata"),
    effectiveFrom: date("effective_from").notNull().defaultNow(),
    effectiveTo: date("effective_to"),
    scheduleVersion: bigint("schedule_version", { mode: "number" }).notNull(),
    createdByUserId: uuid("created_by_user_id").references(() => users.id),
    ...timestamps,
  },
  (t) => [
    index("availability_rules_resource_idx").on(t.resourceId, t.weekday),
    check("availability_rules_weekday", sql`${t.weekday} BETWEEN 0 AND 6`),
    check("availability_rules_window", sql`${t.localEnd} > ${t.localStart}`),
    check("availability_rules_effective", sql`${t.effectiveTo} IS NULL OR ${t.effectiveTo} >= ${t.effectiveFrom}`),
  ],
);

export type ReplacementWindow = { branchId: string; start: string; end: string };

/** Leave, manual blocks, date overrides, extra hours, external busy (CAL-05, CAL-06). */
export const scheduleExceptions = pgTable(
  "schedule_exceptions",
  {
    id: id(),
    resourceId: uuid("resource_id").notNull().references(() => calendarResources.id),
    branchId: uuid("branch_id").references(() => branches.id),
    kind: exceptionKind("kind").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    localDate: date("local_date"), // for date_override: the local calendar day replaced
    replacementWindows: jsonb("replacement_windows").$type<ReplacementWindow[]>(), // empty array = closed
    internalReason: text("internal_reason"),
    externalSource: text("external_source"),
    scheduleVersion: bigint("schedule_version", { mode: "number" }).notNull(),
    createdByUserId: uuid("created_by_user_id").references(() => users.id),
    ...timestamps,
  },
  (t) => [
    index("schedule_exceptions_resource_time_idx").on(t.resourceId, t.startsAt, t.endsAt),
    check("schedule_exceptions_window", sql`${t.endsAt} > ${t.startsAt}`),
  ],
);

/**
 * Capacity-blocking interval, held or committed (BKG-01). The exclusion
 * constraint on (resource_id, occupied_range) is added in the SQL migration.
 */
export const reservations = pgTable(
  "reservations",
  {
    id: id(),
    resourceId: uuid("resource_id").notNull().references(() => calendarResources.id),
    practitionerId: uuid("practitioner_id").notNull().references(() => practitioners.id),
    patientId: uuid("patient_id").references(() => patients.id),
    offeringId: uuid("offering_id").notNull().references(() => offerings.id),
    offeringVersionId: uuid("offering_version_id").notNull().references(() => offeringVersions.id),
    branchId: uuid("branch_id").notNull().references(() => branches.id),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    occupiedRange: tstzrange("occupied_range").notNull(),
    state: reservationState("state").notNull().default("held"),
    heldByUserId: uuid("held_by_user_id").references(() => users.id),
    holdTokenHash: text("hold_token_hash"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    scheduleVersion: bigint("schedule_version", { mode: "number" }).notNull(),
    quoteVersion: integer("quote_version").notNull().default(1),
    releasedReason: text("released_reason"),
    ...timestamps,
  },
  (t) => [
    index("reservations_resource_state_idx").on(t.resourceId, t.state, t.startsAt),
    index("reservations_patient_idx").on(t.patientId, t.startsAt),
    index("reservations_expiry_idx").on(t.expiresAt).where(sql`${t.state} = 'held'`),
    uniqueIndex("reservations_hold_token_uq").on(t.holdTokenHash).where(sql`${t.holdTokenHash} IS NOT NULL`),
    check("reservations_valid_time", sql`${t.endsAt} > ${t.startsAt}`),
    check("reservations_valid_hold", sql`${t.state} <> 'held' OR ${t.expiresAt} IS NOT NULL`),
    check("reservations_range_bounded", sql`NOT isempty(${t.occupiedRange}) AND lower_inf(${t.occupiedRange}) = false AND upper_inf(${t.occupiedRange}) = false`),
    check("reservations_range_covers_appointment", sql`${t.occupiedRange} @> tstzrange(${t.startsAt}, ${t.endsAt}, '[)')`),
  ],
);

/** Patient appointment; occupies capacity only through its reservation (Section 11). */
export const bookings = pgTable(
  "bookings",
  {
    id: id(),
    reference: text("reference").notNull(), // e.g. TPI-7K4M2Q, immutable
    reservationId: uuid("reservation_id").notNull().references(() => reservations.id),
    patientId: uuid("patient_id").notNull().references(() => patients.id),
    bookedByUserId: uuid("booked_by_user_id").references(() => users.id),
    practitionerId: uuid("practitioner_id").notNull().references(() => practitioners.id),
    branchId: uuid("branch_id").notNull().references(() => branches.id),
    offeringId: uuid("offering_id").notNull().references(() => offerings.id),
    offeringVersionId: uuid("offering_version_id").notNull().references(() => offeringVersions.id),
    status: bookingStatus("status").notNull().default("confirmed"),
    source: bookingSource("source").notNull().default("platform"),
    version: integer("version").notNull().default(1),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    timezone: text("timezone").notNull().default("Asia/Kolkata"),
    appointmentReason: text("appointment_reason"), // private, <= 500 chars (BKG-14)
    paymentMode: paymentMode("payment_mode").notNull().default("pay_at_clinic"),
    paymentReported: paymentReported("payment_reported").notNull().default("not_reported"),
    paymentReportedAt: timestamp("payment_reported_at", { withTimezone: true }),
    priceSnapshotId: uuid("price_snapshot_id"),
    policyVersion: text("policy_version").notNull(),
    notifyPatient: boolean("notify_patient").notNull().default(true),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancelledByUserId: uuid("cancelled_by_user_id").references(() => users.id),
    cancellationReason: text("cancellation_reason"),
    noShowRecordedAt: timestamp("no_show_recorded_at", { withTimezone: true }),
    correlationId: text("correlation_id"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("bookings_reference_uq").on(t.reference),
    uniqueIndex("bookings_reservation_uq").on(t.reservationId),
    index("bookings_patient_start_idx").on(t.patientId, t.startsAt),
    index("bookings_practitioner_status_start_idx").on(t.practitionerId, t.status, t.startsAt),
    index("bookings_branch_start_idx").on(t.branchId, t.startsAt),
    index("bookings_status_start_idx").on(t.status, t.startsAt),
    check("bookings_valid_time", sql`${t.endsAt} > ${t.startsAt}`),
    check("bookings_reason_len", sql`${t.appointmentReason} IS NULL OR char_length(${t.appointmentReason}) <= 500`),
    check("bookings_version_pos", sql`${t.version} >= 1`),
  ],
);

/** Append-only history of schedule, service and price changes (BKG-03). */
export const bookingRevisions = pgTable(
  "booking_revisions",
  {
    id: id(),
    bookingId: uuid("booking_id").notNull().references(() => bookings.id),
    revisionNo: integer("revision_no").notNull(),
    actorUserId: uuid("actor_user_id").references(() => users.id),
    previousSnapshot: jsonb("previous_snapshot").$type<Record<string, unknown>>().notNull(),
    newSnapshot: jsonb("new_snapshot").$type<Record<string, unknown>>().notNull(),
    reason: text("reason"),
    occurredAt: occurredAt(),
  },
  (t) => [uniqueIndex("booking_revisions_booking_rev_uq").on(t.bookingId, t.revisionNo)],
);

/** Append-only state transitions (BKG-04). */
export const bookingEvents = pgTable(
  "booking_events",
  {
    id: id(),
    bookingId: uuid("booking_id").notNull().references(() => bookings.id),
    eventType: text("event_type").notNull(),
    actorUserId: uuid("actor_user_id").references(() => users.id),
    actorRole: text("actor_role"),
    fromState: text("from_state"),
    toState: text("to_state"),
    reason: text("reason"),
    correlationId: text("correlation_id"),
    payload: jsonb("payload").$type<Record<string, unknown>>(),
    occurredAt: occurredAt(),
  },
  (t) => [index("booking_events_booking_idx").on(t.bookingId, t.occurredAt)],
);

export type LineItem = { kind: "base" | "discount" | "tax" | "extra"; label: string; amountPaise: number };

/** Frozen price at booking/revision time; later fee edits never change it (OFR-02). */
export const bookingPriceSnapshots = pgTable(
  "booking_price_snapshots",
  {
    id: id(),
    bookingId: uuid("booking_id").references(() => bookings.id),
    reservationId: uuid("reservation_id").references(() => reservations.id),
    revisionNo: integer("revision_no").notNull().default(0),
    quoteVersion: integer("quote_version").notNull().default(1),
    currency: text("currency").notNull().default("INR"),
    basePaise: bigint("base_paise", { mode: "number" }).notNull(),
    discountPaise: bigint("discount_paise", { mode: "number" }).notNull().default(0),
    taxPaise: bigint("tax_paise", { mode: "number" }).notNull().default(0),
    extraPaise: bigint("extra_paise", { mode: "number" }).notNull().default(0),
    totalPaise: bigint("total_paise", { mode: "number" }).notNull(),
    offerVersionId: uuid("offer_version_id"),
    offerExplanation: text("offer_explanation"),
    policyVersion: text("policy_version").notNull(),
    offeringVersionId: uuid("offering_version_id").references(() => offeringVersions.id),
    lineItems: jsonb("line_items").$type<LineItem[]>().notNull().default(sql`'[]'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("booking_price_snapshots_booking_idx").on(t.bookingId, t.revisionNo),
    index("booking_price_snapshots_reservation_idx").on(t.reservationId),
    check("price_snapshot_nonneg", sql`${t.basePaise} >= 0 AND ${t.discountPaise} >= 0 AND ${t.taxPaise} >= 0 AND ${t.extraPaise} >= 0 AND ${t.totalPaise} >= 0`),
    check("price_snapshot_reconciles", sql`${t.totalPaise} = ${t.basePaise} - ${t.discountPaise} + ${t.taxPaise} + ${t.extraPaise}`),
  ],
);

/** Administrative notes only; never a clinical record (PRO-16). */
export const bookingNotes = pgTable(
  "booking_notes",
  {
    id: id(),
    bookingId: uuid("booking_id").notNull().references(() => bookings.id),
    authorUserId: uuid("author_user_id").notNull().references(() => users.id),
    note: text("note").notNull(),
    ...timestamps,
  },
  (t) => [index("booking_notes_booking_idx").on(t.bookingId), check("booking_notes_len", sql`char_length(${t.note}) <= 1000`)],
);

/** Idempotency per actor and route, retained >= 24 h (BKG-10). */
export const idempotencyRecords = pgTable(
  "idempotency_records",
  {
    id: id(),
    actorId: text("actor_id").notNull(),
    route: text("route").notNull(),
    keyHash: text("key_hash").notNull(),
    requestHash: text("request_hash").notNull(),
    state: idempotencyState("state").notNull().default("in_progress"),
    statusCode: integer("status_code"),
    responseBody: jsonb("response_body").$type<unknown>(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("idempotency_actor_route_key_uq").on(t.actorId, t.route, t.keyHash),
    index("idempotency_expiry_idx").on(t.expiresAt),
  ],
);

/** Follow-up tasks when schedules, associations or eligibility change under existing bookings (CAL-09, VER-06, LOC-02). */
export const resolutionTasks = pgTable(
  "resolution_tasks",
  {
    id: id(),
    kind: taskKind("kind").notNull(),
    state: taskState("state").notNull().default("open"),
    bookingId: uuid("booking_id").references(() => bookings.id),
    practitionerId: uuid("practitioner_id").references(() => practitioners.id),
    branchId: uuid("branch_id").references(() => branches.id),
    assigneeUserId: uuid("assignee_user_id").references(() => users.id),
    dueAt: timestamp("due_at", { withTimezone: true }),
    details: jsonb("details").$type<Record<string, unknown>>(),
    resolution: text("resolution"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedByUserId: uuid("resolved_by_user_id").references(() => users.id),
    ...timestamps,
  },
  (t) => [
    index("resolution_tasks_state_idx").on(t.state, t.dueAt),
    index("resolution_tasks_practitioner_idx").on(t.practitionerId, t.state),
  ],
);
