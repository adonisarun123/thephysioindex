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
