import { createHmac, timingSafeEqual } from "node:crypto";
import { sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db, withTransaction, type Db } from "@/db/client";
import { ApiError } from "@/lib/api";
import { audit } from "@/lib/audit";
import { uuidArray } from "@/lib/sql";

/**
 * Home exercise plans (addendum HEP-01..05). A practitioner builds a plan from
 * the starter library or their own exercises and shares a private link with
 * the patient. Every query is scoped by practitioner id resolved server-side
 * (IAM-01); the patient side is reachable only with a valid link token.
 */

export const BODY_REGIONS = [
  { key: "neck", label: "Neck" },
  { key: "shoulder", label: "Shoulder" },
  { key: "elbow_wrist", label: "Elbow and wrist" },
  { key: "back", label: "Back" },
  { key: "core", label: "Core" },
  { key: "hip", label: "Hip" },
  { key: "knee", label: "Knee" },
  { key: "ankle_foot", label: "Ankle and foot" },
  { key: "balance", label: "Balance" },
  { key: "general", label: "General" },
] as const;
export type BodyRegion = (typeof BODY_REGIONS)[number]["key"];
const REGION_KEYS = BODY_REGIONS.map((r) => r.key) as [BodyRegion, ...BodyRegion[]];

export const MAX_PLAN_ITEMS = 20;

// ------------------------------------------------------------------ link tokens (HEP-04)

function linkSecret(): string {
  const s = process.env.PLAN_LINK_SECRET ?? process.env.BETTER_AUTH_SECRET;
  if (!s) throw new ApiError("INTERNAL", "Plan links are not configured");
  return s;
}

function mac(planId: string, version: number): Buffer {
  return createHmac("sha256", linkSecret()).update(`tpi-plan-link:${planId}:${version}`).digest().subarray(0, 18);
}

/** Token = base64url(plan uuid bytes) + "." + base64url(18-byte HMAC). Nothing is stored. */
export function planToken(planId: string, version: number): string {
  const idBytes = Buffer.from(planId.replace(/-/g, ""), "hex");
  return `${idBytes.toString("base64url")}.${mac(planId, version).toString("base64url")}`;
}

/** Parses a token to its plan id; the MAC is verified against the stored version by the caller. */
export function parsePlanToken(token: string): { planId: string; tag: Buffer } | null {
  const m = /^([A-Za-z0-9_-]{22})\.([A-Za-z0-9_-]{24})$/.exec(token);
  if (!m) return null;
  const hex = Buffer.from(m[1], "base64url").toString("hex");
  if (hex.length !== 32) return null;
  const planId = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  return { planId, tag: Buffer.from(m[2], "base64url") };
}

function tokenMatches(planId: string, version: number, tag: Buffer): boolean {
  const expected = mac(planId, version);
  return tag.length === expected.length && timingSafeEqual(tag, expected);
}

// ------------------------------------------------------------------ inputs

const dose = {
  sets: z.number().int().min(1).max(20).optional(),
  reps: z.number().int().min(1).max(200).optional(),
  holdSeconds: z.number().int().min(1).max(600).optional(),
  frequency: z.string().trim().max(80).optional(),
};

export const CustomExerciseSchema = z.object({
  name: z.string().trim().min(3, "Name is too short").max(80),
  bodyRegion: z.enum(REGION_KEYS),
  instructions: z.string().trim().min(20, "Write the instructions in at least 20 characters").max(1500),
  ...dose,
});
export type CustomExerciseInput = z.infer<typeof CustomExerciseSchema>;

export const PlanItemSchema = z.object({ exerciseId: z.uuid(), ...dose, note: z.string().trim().max(300).optional() });

export const PlanInputSchema = z.object({
  patientLabel: z.string().trim().min(1, "Enter the patient's first name or initials").max(40, "Use a first name or initials only"),
  title: z.string().trim().min(3, "Give the plan a title").max(80),
  advice: z.string().trim().max(1500).optional(),
  endsOn: z.iso.date().optional(),
  items: z.array(PlanItemSchema).min(1, "Add at least one exercise").max(MAX_PLAN_ITEMS, `A plan can hold up to ${MAX_PLAN_ITEMS} exercises`),
});
export type PlanInput = z.infer<typeof PlanInputSchema>;

// ------------------------------------------------------------------ library

export type ExerciseRow = {
  id: string;
  name: string;
  bodyRegion: BodyRegion;
  instructions: string;
  defaultSets: number | null;
  defaultReps: number | null;
  defaultHoldSeconds: number | null;
  defaultFrequency: string | null;
  custom: boolean;
};

/** Starter library plus the practitioner's own active exercises (HEP-01). */
export async function listExercises(practitionerId: string): Promise<ExerciseRow[]> {
  const res = await db().execute<{
    id: string; name: string; body_region: BodyRegion; instructions: string; default_sets: number | null; default_reps: number | null;
    default_hold_seconds: number | null; default_frequency: string | null; custom: boolean;
  }>(sql`
    SELECT id, name, body_region, instructions, default_sets, default_reps, default_hold_seconds, default_frequency, (practitioner_id IS NOT NULL) AS custom
    FROM exercises
    WHERE is_active AND (practitioner_id IS NULL OR practitioner_id = ${practitionerId})
    ORDER BY body_region, (practitioner_id IS NULL), name`);
  return res.rows.map((r) => ({
    id: r.id, name: r.name, bodyRegion: r.body_region, instructions: r.instructions, defaultSets: r.default_sets, defaultReps: r.default_reps,
    defaultHoldSeconds: r.default_hold_seconds, defaultFrequency: r.default_frequency, custom: r.custom,
  }));
}

export async function createCustomExercise(practitionerId: string, actorUserId: string, input: CustomExerciseInput): Promise<string> {
  const res = await db().execute<{ id: string }>(sql`
    INSERT INTO exercises (practitioner_id, name, body_region, instructions, default_sets, default_reps, default_hold_seconds, default_frequency, created_by)
    VALUES (${practitionerId}, ${input.name}, ${input.bodyRegion}, ${input.instructions}, ${input.sets ?? null}, ${input.reps ?? null},
            ${input.holdSeconds ?? null}, ${input.frequency ?? null}, ${actorUserId})
    RETURNING id`);
  const id = res.rows[0].id;
  await audit({ actorUserId, action: "exercise.create", objectType: "exercise", objectId: id });
  return id;
}

/** Retiring hides an own exercise from the picker; plans that use it keep showing it. */
export async function retireCustomExercise(practitionerId: string, actorUserId: string, exerciseId: string): Promise<void> {
  const res = await db().execute(sql`UPDATE exercises SET is_active = false WHERE id = ${exerciseId} AND practitioner_id = ${practitionerId} AND is_active`);
  if (res.rowCount === 0) throw new ApiError("NOT_FOUND", "Exercise not found");
  await audit({ actorUserId, action: "exercise.retire", objectType: "exercise", objectId: exerciseId });
}

// ------------------------------------------------------------------ plans (practitioner side)

export type PlanSummary = {
  id: string;
  patientLabel: string;
  title: string;
  state: "active" | "archived";
  itemCount: number;
  endsOn: string | null;
  createdAt: Date;
  lastOpenedAt: Date | null;
  doneLast7: number;
  lastPain: number | null;
};

export async function listPlans(practitionerId: string): Promise<PlanSummary[]> {
  const res = await db().execute<{
    id: string; patient_label: string; title: string; state: "active" | "archived"; item_count: number; ends_on: string | null;
    created_at: string; last_opened_at: string | null; done_last7: number; last_pain: number | null;
  }>(sql`
    SELECT p.id, p.patient_label, p.title, p.state, p.ends_on::text AS ends_on, p.created_at, p.last_opened_at,
      (SELECT count(*)::int FROM exercise_plan_items i WHERE i.plan_id = p.id) AS item_count,
      (SELECT count(*)::int FROM exercise_plan_checkins c WHERE c.plan_id = p.id AND c.day > (now() AT TIME ZONE 'Asia/Kolkata')::date - 7) AS done_last7,
      (SELECT c.pain_score FROM exercise_plan_checkins c WHERE c.plan_id = p.id AND c.pain_score IS NOT NULL ORDER BY c.day DESC LIMIT 1) AS last_pain
    FROM exercise_plans p
    WHERE p.practitioner_id = ${practitionerId}
    ORDER BY (p.state = 'active') DESC, p.created_at DESC
    LIMIT 200`);
  return res.rows.map((r) => ({
    id: r.id, patientLabel: r.patient_label, title: r.title, state: r.state, itemCount: r.item_count, endsOn: r.ends_on,
    createdAt: new Date(r.created_at), lastOpenedAt: r.last_opened_at ? new Date(r.last_opened_at) : null, doneLast7: r.done_last7, lastPain: r.last_pain,
  }));
}

export type PlanItemView = {
  exerciseId: string;
  name: string;
  bodyRegion: BodyRegion;
  instructions: string;
  sets: number | null;
  reps: number | null;
  holdSeconds: number | null;
  frequency: string | null;
  note: string | null;
};

export type PlanDetail = {
  id: string;
  practitionerId: string;
  patientLabel: string;
  title: string;
  advice: string | null;
  state: "active" | "archived";
  endsOn: string | null;
  linkVersion: number;
  createdAt: Date;
  lastOpenedAt: Date | null;
  items: PlanItemView[];
  checkins: { day: string; painScore: number | null }[];
};

async function loadPlan(where: SQL): Promise<PlanDetail | null> {
  const p = await db().execute<{
    id: string; practitioner_id: string; patient_label: string; title: string; advice: string | null; state: "active" | "archived";
    ends_on: string | null; link_version: number; created_at: string; last_opened_at: string | null;
  }>(sql`SELECT id, practitioner_id, patient_label, title, advice, state, ends_on::text AS ends_on, link_version, created_at, last_opened_at
         FROM exercise_plans WHERE ${where}`);
  const row = p.rows[0];
  if (!row) return null;
  const [items, checkins] = await Promise.all([
    db().execute<{
      exercise_id: string; name: string; body_region: BodyRegion; instructions: string; sets: number | null; reps: number | null;
      hold_seconds: number | null; frequency: string | null; note: string | null;
    }>(sql`
      SELECT i.exercise_id, e.name, e.body_region, e.instructions, i.sets, i.reps, i.hold_seconds, i.frequency, i.note
      FROM exercise_plan_items i JOIN exercises e ON e.id = i.exercise_id
      WHERE i.plan_id = ${row.id} ORDER BY i.position`),
    db().execute<{ day: string; pain_score: number | null }>(sql`
      SELECT day::text AS day, pain_score FROM exercise_plan_checkins WHERE plan_id = ${row.id} ORDER BY day DESC LIMIT 60`),
  ]);
  return {
    id: row.id, practitionerId: row.practitioner_id, patientLabel: row.patient_label, title: row.title, advice: row.advice, state: row.state,
    endsOn: row.ends_on, linkVersion: row.link_version, createdAt: new Date(row.created_at), lastOpenedAt: row.last_opened_at ? new Date(row.last_opened_at) : null,
    items: items.rows.map((i) => ({
      exerciseId: i.exercise_id, name: i.name, bodyRegion: i.body_region, instructions: i.instructions, sets: i.sets, reps: i.reps,
      holdSeconds: i.hold_seconds, frequency: i.frequency, note: i.note,
    })),
    checkins: checkins.rows.map((c) => ({ day: c.day, painScore: c.pain_score })),
  };
}

export async function getPlan(practitionerId: string, planId: string): Promise<PlanDetail | null> {
  if (!z.uuid().safeParse(planId).success) return null;
  return loadPlan(sql`id = ${planId} AND practitioner_id = ${practitionerId}`);
}

async function assertUsableExercises(tx: Db, practitionerId: string, ids: string[], allowRetired: string[]) {
  const unique = [...new Set(ids)];
  const res = await tx.execute<{ id: string }>(sql`
    SELECT id FROM exercises
    WHERE id = ANY(${uuidArray(unique)})
      AND (practitioner_id IS NULL OR practitioner_id = ${practitionerId})
      AND (is_active OR id = ANY(${uuidArray(allowRetired)}))`);
  if (res.rows.length !== unique.length) throw new ApiError("INVALID_INPUT", "Choose exercises from the library or your own list");
}

async function writeItems(tx: Db, planId: string, items: PlanInput["items"]) {
  await tx.execute(sql`DELETE FROM exercise_plan_items WHERE plan_id = ${planId}`);
  for (const [position, it] of items.entries()) {
    await tx.execute(sql`
      INSERT INTO exercise_plan_items (plan_id, exercise_id, position, sets, reps, hold_seconds, frequency, note)
      VALUES (${planId}, ${it.exerciseId}, ${position}, ${it.sets ?? null}, ${it.reps ?? null}, ${it.holdSeconds ?? null}, ${it.frequency ?? null}, ${it.note ?? null})`);
  }
}

/** HEP-02: create a plan; returns the id and the patient link token. */
export async function createPlan(practitionerId: string, actorUserId: string, input: PlanInput): Promise<{ planId: string; token: string }> {
  const createdId = await withTransaction(async (_c, tx) => {
    await assertUsableExercises(tx, practitionerId, input.items.map((i) => i.exerciseId), []);
    const res = await tx.execute<{ id: string }>(sql`
      INSERT INTO exercise_plans (practitioner_id, patient_label, title, advice, ends_on, created_by)
      VALUES (${practitionerId}, ${input.patientLabel}, ${input.title}, ${input.advice ?? null}, ${input.endsOn ?? null}::date, ${actorUserId})
      RETURNING id`);
    const id = res.rows[0].id;
    await writeItems(tx, id, input.items);
    await audit({ actorUserId, action: "exercise_plan.create", objectType: "exercise_plan", objectId: id, changedFields: { items: input.items.length } }, tx);
    return id;
  });
  return { planId: createdId, token: planToken(createdId, 1) };
}

/** HEP-02: edit replaces the item list; the patient link stays the same. Exercises retired since stay allowed. */
export async function updatePlan(practitionerId: string, actorUserId: string, planId: string, input: PlanInput): Promise<void> {
  await withTransaction(async (_c, tx) => {
    const cur = await tx.execute<{ id: string }>(sql`SELECT id FROM exercise_plans WHERE id = ${planId} AND practitioner_id = ${practitionerId} FOR UPDATE`);
    if (!cur.rows[0]) throw new ApiError("NOT_FOUND", "Plan not found");
    const existing = await tx.execute<{ exercise_id: string }>(sql`SELECT exercise_id FROM exercise_plan_items WHERE plan_id = ${planId}`);
    await assertUsableExercises(tx, practitionerId, input.items.map((i) => i.exerciseId), existing.rows.map((r) => r.exercise_id));
    await tx.execute(sql`
      UPDATE exercise_plans SET patient_label = ${input.patientLabel}, title = ${input.title}, advice = ${input.advice ?? null}, ends_on = ${input.endsOn ?? null}::date
      WHERE id = ${planId}`);
    await writeItems(tx, planId, input.items);
    await audit({ actorUserId, action: "exercise_plan.update", objectType: "exercise_plan", objectId: planId, changedFields: { items: input.items.length } }, tx);
  });
}

/** HEP-04: the current patient link, rebuilt from the server secret. */
export async function currentPlanToken(practitionerId: string, planId: string): Promise<string | null> {
  const res = await db().execute<{ link_version: number }>(sql`SELECT link_version FROM exercise_plans WHERE id = ${planId} AND practitioner_id = ${practitionerId}`);
  const v = res.rows[0]?.link_version;
  return v ? planToken(planId, v) : null;
}

/** HEP-04: revoke the old link and issue a new one. */
export async function rotatePlanLink(practitionerId: string, actorUserId: string, planId: string): Promise<string> {
  const res = await db().execute<{ link_version: number }>(sql`
    UPDATE exercise_plans SET link_version = link_version + 1 WHERE id = ${planId} AND practitioner_id = ${practitionerId} RETURNING link_version`);
  const v = res.rows[0]?.link_version;
  if (!v) throw new ApiError("NOT_FOUND", "Plan not found");
  await audit({ actorUserId, action: "exercise_plan.rotate_link", objectType: "exercise_plan", objectId: planId });
  return planToken(planId, v);
}

export async function setPlanArchived(practitionerId: string, actorUserId: string, planId: string, archived: boolean): Promise<void> {
  const res = await db().execute(sql`
    UPDATE exercise_plans SET state = ${archived ? "archived" : "active"} WHERE id = ${planId} AND practitioner_id = ${practitionerId}`);
  if (res.rowCount === 0) throw new ApiError("NOT_FOUND", "Plan not found");
  await audit({ actorUserId, action: archived ? "exercise_plan.archive" : "exercise_plan.restore", objectType: "exercise_plan", objectId: planId });
}

// ------------------------------------------------------------------ patient side (HEP-03, HEP-04)

export type PatientPlanView = PlanDetail & { practitionerName: string; practitionerSlug: string; practitionerPublished: boolean; ended: boolean; doneToday: boolean };

export function istToday(now = new Date()): string {
  return now.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

/** Resolves a link token. Archived plans and stale links resolve to null (same response, no oracle). */
export async function getPlanByToken(token: string): Promise<PatientPlanView | null> {
  const parsed = parsePlanToken(token);
  if (!parsed) return null;
  const plan = await loadPlan(sql`id = ${parsed.planId} AND state = 'active'`);
  if (!plan || !tokenMatches(plan.id, plan.linkVersion, parsed.tag)) return null;
  const pr = await db().execute<{ display_name: string; slug: string; published: boolean }>(sql`
    SELECT display_name, slug, (listing_status = 'published') AS published FROM practitioners WHERE id = ${plan.practitionerId}`);
  const today = istToday();
  return {
    ...plan,
    practitionerName: pr.rows[0]?.display_name ?? "Your physiotherapist",
    practitionerSlug: pr.rows[0]?.slug ?? "",
    practitionerPublished: Boolean(pr.rows[0]?.published),
    ended: plan.endsOn !== null && plan.endsOn < today,
    doneToday: plan.checkins.some((c) => c.day === today),
  };
}

/** Records that the patient opened the plan; at most once an hour per plan. Callers skip bots. */
export async function markPlanOpened(planId: string): Promise<void> {
  await db().execute(sql`
    UPDATE exercise_plans SET last_opened_at = now()
    WHERE id = ${planId} AND (last_opened_at IS NULL OR last_opened_at < now() - interval '1 hour')`);
}

/** HEP-03: "done today", idempotent per IST day; a second submit updates the pain score. */
export async function recordCheckin(token: string, painScore: number | null): Promise<void> {
  const plan = await getPlanByToken(token);
  if (!plan) throw new ApiError("NOT_FOUND", "This plan link is no longer active");
  if (plan.ended) throw new ApiError("CONFLICT", "This plan has ended. Ask your physiotherapist for an updated plan.");
  if (painScore !== null && !(Number.isInteger(painScore) && painScore >= 0 && painScore <= 10)) throw new ApiError("INVALID_INPUT", "Pain score must be 0 to 10");
  await db().execute(sql`
    INSERT INTO exercise_plan_checkins (plan_id, day, pain_score) VALUES (${plan.id}, ${istToday()}::date, ${painScore})
    ON CONFLICT (plan_id, day) DO UPDATE SET pain_score = coalesce(excluded.pain_score, exercise_plan_checkins.pain_score)`);
}

// ------------------------------------------------------------------ formatting

export function doseLine(i: { sets: number | null; reps: number | null; holdSeconds: number | null; frequency: string | null }): string {
  const parts: string[] = [];
  if (i.sets && i.reps) parts.push(`${i.sets} × ${i.reps}`);
  else if (i.reps) parts.push(`${i.reps} reps`);
  else if (i.sets) parts.push(`${i.sets} sets`);
  if (i.holdSeconds) parts.push(`hold ${i.holdSeconds} s`);
  if (i.frequency) parts.push(i.frequency.toLowerCase());
  return parts.join(" · ");
}

/** WhatsApp click-to-chat with the plan link pre-filled. No provider, no stored phone number. */
export function whatsappShareUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
