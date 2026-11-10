import { sql } from "drizzle-orm";
import { boolean, date, index, integer, pgTable, smallint, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { id, timestamps } from "./_common";
import { users } from "./identity";
import { practitioners } from "./practitioners";

/**
 * Practice tools (addendum docs/srs/addenda/2026-11-practice-tools.md).
 * Free tools for listed physiotherapists; none of them affects ranking,
 * booking capacity or public listing data.
 */

/**
 * HEP-01: exercise library. practitioner_id NULL = platform starter library
 * (seeded, text only, written by the editorial team); otherwise the
 * practitioner's own exercise, visible only in their workspace.
 */
export const exercises = pgTable(
  "exercises",
  {
    id: id(),
    practitionerId: uuid("practitioner_id").references(() => practitioners.id),
    code: text("code"), // stable key for library rows (seed upsert); NULL for practitioner rows
    name: text("name").notNull(),
    bodyRegion: text("body_region").notNull(), // neck | shoulder | elbow_wrist | back | hip | knee | ankle_foot | core | balance | general
    instructions: text("instructions").notNull(),
    defaultSets: smallint("default_sets"),
    defaultReps: smallint("default_reps"),
    defaultHoldSeconds: smallint("default_hold_seconds"),
    defaultFrequency: text("default_frequency"),
    isActive: boolean("is_active").notNull().default(true),
    createdBy: uuid("created_by").references(() => users.id),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("exercises_code_uq").on(t.code).where(sql`${t.code} IS NOT NULL`),
    index("exercises_practitioner_idx").on(t.practitionerId, t.bodyRegion),
  ],
);

/**
 * HEP-02: a home exercise plan for one patient. The patient opens it through
 * an unguessable link (HEP-04): the token is an HMAC of (plan id, link
 * version) under a server secret, so no token is stored and a database copy
 * alone cannot open any plan. Bumping link_version revokes the old link.
 * patient_label is the minimum needed to tell plans apart (first name or
 * initials), not a patient record.
 */
export const exercisePlans = pgTable(
  "exercise_plans",
  {
    id: id(),
    practitionerId: uuid("practitioner_id").notNull().references(() => practitioners.id),
    patientLabel: text("patient_label").notNull(),
    title: text("title").notNull(),
    advice: text("advice"),
    state: text("state").notNull().default("active"), // active | archived
    linkVersion: smallint("link_version").notNull().default(1),
    endsOn: date("ends_on"),
    lastOpenedAt: timestamp("last_opened_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => users.id),
    ...timestamps,
  },
  (t) => [
    index("exercise_plans_practitioner_idx").on(t.practitionerId, t.state, t.createdAt),
  ],
);

/** HEP-02: ordered exercises in a plan with the dose the physio set. */
export const exercisePlanItems = pgTable(
  "exercise_plan_items",
  {
    id: id(),
    planId: uuid("plan_id").notNull().references(() => exercisePlans.id, { onDelete: "cascade" }),
    exerciseId: uuid("exercise_id").notNull().references(() => exercises.id),
    position: smallint("position").notNull(),
    sets: smallint("sets"),
    reps: smallint("reps"),
    holdSeconds: smallint("hold_seconds"),
    frequency: text("frequency"),
    note: text("note"),
    ...timestamps,
  },
  (t) => [uniqueIndex("exercise_plan_items_position_uq").on(t.planId, t.position)],
);

/** HEP-03: one row per plan per IST day the patient marked the session done. */
export const exercisePlanCheckins = pgTable(
  "exercise_plan_checkins",
  {
    planId: uuid("plan_id").notNull().references(() => exercisePlans.id, { onDelete: "cascade" }),
    day: date("day").notNull(), // YYYY-MM-DD in Asia/Kolkata
    painScore: integer("pain_score"), // optional 0–10
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("exercise_plan_checkins_uq").on(t.planId, t.day)],
);

/**
 * PKG-01: session package a practitioner sells at the practice (e.g. 10
 * sessions). Not shown publicly and not sold online: no price claim is
 * published and booking prices are unchanged (OFR-06 untouched).
 */
export const packageTemplates = pgTable(
  "package_templates",
  {
    id: id(),
    practitionerId: uuid("practitioner_id").notNull().references(() => practitioners.id),
    name: text("name").notNull(),
    sessions: smallint("sessions").notNull(),
    pricePaise: integer("price_paise").notNull(),
    validityDays: smallint("validity_days").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdBy: uuid("created_by").references(() => users.id),
    ...timestamps,
  },
  (t) => [index("package_templates_practitioner_idx").on(t.practitionerId, t.isActive)],
);

/** PKG-02: a package sold to one patient. Sessions and price are snapshots (OFR-02). */
export const patientPackages = pgTable(
  "patient_packages",
  {
    id: id(),
    practitionerId: uuid("practitioner_id").notNull().references(() => practitioners.id),
    templateId: uuid("template_id").references(() => packageTemplates.id),
    name: text("name").notNull(),
    patientLabel: text("patient_label").notNull(),
    sessionsTotal: smallint("sessions_total").notNull(),
    pricePaise: integer("price_paise").notNull(),
    paidPaise: integer("paid_paise").notNull().default(0),
    paymentMode: text("payment_mode"), // cash | upi | card | bank | other
    startsOn: date("starts_on").notNull(),
    expiresOn: date("expires_on").notNull(),
    state: text("state").notNull().default("active"), // active | closed
    note: text("note"),
    createdBy: uuid("created_by").references(() => users.id),
    ...timestamps,
  },
  (t) => [index("patient_packages_practitioner_idx").on(t.practitionerId, t.state, t.expiresOn)],
);

/** PKG-03: one row per session used. Undo deletes the latest row (audited). */
export const packageSessionUses = pgTable(
  "package_session_uses",
  {
    id: id(),
    packageId: uuid("package_id").notNull().references(() => patientPackages.id, { onDelete: "cascade" }),
    usedOn: date("used_on").notNull(),
    note: text("note"),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("package_session_uses_package_idx").on(t.packageId, t.usedOn)],
);

/** RCP-01: every payment against a package, with a receipt number unique per practitioner. */
export const packagePayments = pgTable(
  "package_payments",
  {
    id: id(),
    packageId: uuid("package_id").notNull().references(() => patientPackages.id, { onDelete: "cascade" }),
    practitionerId: uuid("practitioner_id").notNull().references(() => practitioners.id),
    receiptNo: text("receipt_no").notNull(),
    amountPaise: integer("amount_paise").notNull(),
    paymentMode: text("payment_mode"),
    receivedOn: date("received_on").notNull(),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("package_payments_receipt_uq").on(t.practitionerId, t.receiptNo),
    index("package_payments_package_idx").on(t.packageId, t.createdAt),
  ],
);

/** RCP-01: per-practitioner document counters (receipt numbers). Incremented under the row lock. */
export const practiceCounters = pgTable(
  "practice_counters",
  {
    practitionerId: uuid("practitioner_id").notNull().references(() => practitioners.id),
    kind: text("kind").notNull(), // receipt
    nextValue: integer("next_value").notNull().default(1),
  },
  (t) => [uniqueIndex("practice_counters_uq").on(t.practitionerId, t.kind)],
);
