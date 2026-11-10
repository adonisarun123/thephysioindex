import { sql } from "drizzle-orm";
import { z } from "zod";
import { db, withTransaction, type Db } from "@/db/client";
import { ApiError } from "@/lib/api";
import { audit } from "@/lib/audit";
import { getViewer, type Viewer } from "@/lib/auth/session";
import { normaliseIndianMobile } from "@/lib/messaging/sms";
import { resolveWorkspacePractitioner, type WorkspacePractitioner } from "@/lib/workspace/context";

/**
 * Patient records (addendum EMR-01..07). Health data held by the platform on
 * behalf of the practitioner (DPDP Act: the practice decides, we process).
 *
 * Access (EMR-06): the profile owner, or a coordinator granted
 * `patients.read` / `patients.manage` for that practitioner. Platform staff
 * (including super_admin) get no access through this path. Every read of a
 * patient record and every write is written to audit_events.
 */

export const RECORDS_TERMS_VERSION = "records-2026-11";

export type PatientAccess = { viewer: Viewer; practitioner: WorkspacePractitioner; canWrite: boolean };

function permissionsFor(v: Viewer, practitionerId: string): string[] {
  return v.grants.filter((g) => g.scopeType === "practitioner" && g.scopeId === practitionerId).flatMap((g) => g.permissions ?? []);
}

/** EMR-06 rule, pure: owner → read+write; coordinator with patients.manage → read+write; patients.read → read. No staff override. */
export function patientRights(v: Pick<Viewer, "grants">, practitionerId: string, isOwner: boolean): { canRead: boolean; canWrite: boolean } {
  const perms = permissionsFor(v as Viewer, practitionerId);
  const canWrite = isOwner || perms.includes("patients.manage");
  return { canWrite, canRead: canWrite || perms.includes("patients.read") };
}

/** Resolves the viewer's practice and their patient-records rights. Throws catalogue errors (IAM-01). */
export async function requirePatientAccess(mode: "read" | "write"): Promise<PatientAccess> {
  const viewer = await getViewer();
  if (!viewer) throw new ApiError("UNAUTHENTICATED", "Sign in to continue");
  const practitioner = await resolveWorkspacePractitioner(viewer);
  if (!practitioner) throw new ApiError("NOT_FOUND", "No practitioner profile is linked to this account");
  const { canRead, canWrite } = patientRights(viewer, practitioner.id, practitioner.isOwner);
  if (!canRead || (mode === "write" && !canWrite)) throw new ApiError("UNAUTHORISED", "You do not have access to patient records for this practice");
  return { viewer, practitioner, canWrite };
}

// ------------------------------------------------------------------ terms (EMR-01)

export async function recordsTermsAccepted(practitionerId: string): Promise<boolean> {
  const r = await db().execute<{ ok: boolean }>(sql`SELECT terms_version = ${RECORDS_TERMS_VERSION} AS ok FROM practice_records_terms WHERE practitioner_id = ${practitionerId}`);
  return Boolean(r.rows[0]?.ok);
}

export async function acceptRecordsTerms(practitionerId: string, userId: string): Promise<void> {
  await db().execute(sql`
    INSERT INTO practice_records_terms (practitioner_id, terms_version, accepted_by) VALUES (${practitionerId}, ${RECORDS_TERMS_VERSION}, ${userId})
    ON CONFLICT (practitioner_id) DO UPDATE SET terms_version = excluded.terms_version, accepted_at = now(), accepted_by = excluded.accepted_by`);
  await audit({ actorUserId: userId, action: "patient_records.terms_accept", objectType: "practitioner", objectId: practitionerId, changedFields: { version: RECORDS_TERMS_VERSION } });
}

async function assertTerms(tx: Db, practitionerId: string) {
  const r = await tx.execute<{ ok: boolean }>(sql`SELECT terms_version = ${RECORDS_TERMS_VERSION} AS ok FROM practice_records_terms WHERE practitioner_id = ${practitionerId}`);
  if (!r.rows[0]?.ok) throw new ApiError("CONFLICT", "Accept the patient-records terms first");
}

// ------------------------------------------------------------------ patients (EMR-02)

const opt = (max: number) => z.string().trim().max(max).optional().transform((v) => (v ? v : undefined));

export const PatientSchema = z.object({
  fullName: z.string().trim().min(2, "Enter the patient's name").max(100),
  mobile: z.string().trim().optional().transform((v, ctx) => {
    if (!v) return undefined;
    const m = normaliseIndianMobile(v);
    if (!m) {
      ctx.addIssue({ code: "custom", message: "Enter a valid Indian mobile number" });
      return z.NEVER;
    }
    return m;
  }),
  sex: z.enum(["female", "male", "other"]).optional(),
  birthYear: z.number().int().min(1900).max(new Date().getFullYear()).optional(),
  address: opt(300),
  emergencyContact: opt(200),
  referredBy: opt(120),
  medicalHistory: opt(3000),
  notes: opt(2000),
});
export type PatientInput = z.infer<typeof PatientSchema>;

async function nextRef(tx: Db, practitionerId: string): Promise<string> {
  const r = await tx.execute<{ n: number }>(sql`
    INSERT INTO practice_counters (practitioner_id, kind, next_value) VALUES (${practitionerId}, 'patient', 2)
    ON CONFLICT (practitioner_id, kind) DO UPDATE SET next_value = practice_counters.next_value + 1
    RETURNING next_value - 1 AS n`);
  return `P-${String(r.rows[0].n).padStart(5, "0")}`;
}

/** EMR-02: the practitioner confirms the patient agreed to their record being kept (consentConfirmed). */
export async function createPatient(practitionerId: string, actorUserId: string, input: PatientInput, consentConfirmed: boolean): Promise<string> {
  if (!consentConfirmed) throw new ApiError("INVALID_INPUT", "Confirm that the patient agreed to you keeping their record");
  return withTransaction(async (_c, tx) => {
    await assertTerms(tx, practitionerId);
    const refNo = await nextRef(tx, practitionerId);
    const r = await tx.execute<{ id: string }>(sql`
      INSERT INTO practice_patients (practitioner_id, ref_no, full_name, mobile, sex, birth_year, address, emergency_contact, referred_by, medical_history, notes, consent_recorded_at, created_by)
      VALUES (${practitionerId}, ${refNo}, ${input.fullName}, ${input.mobile ?? null}, ${input.sex ?? null}, ${input.birthYear ?? null}, ${input.address ?? null},
              ${input.emergencyContact ?? null}, ${input.referredBy ?? null}, ${input.medicalHistory ?? null}, ${input.notes ?? null}, now(), ${actorUserId})
      RETURNING id`);
    await audit({ actorUserId, action: "patient.create", objectType: "practice_patient", objectId: r.rows[0].id, changedFields: { refNo } }, tx);
    return r.rows[0].id;
  });
}

export async function updatePatient(practitionerId: string, actorUserId: string, patientId: string, input: PatientInput): Promise<void> {
  const r = await db().execute(sql`
    UPDATE practice_patients SET full_name = ${input.fullName}, mobile = ${input.mobile ?? null}, sex = ${input.sex ?? null}, birth_year = ${input.birthYear ?? null},
      address = ${input.address ?? null}, emergency_contact = ${input.emergencyContact ?? null}, referred_by = ${input.referredBy ?? null},
      medical_history = ${input.medicalHistory ?? null}, notes = ${input.notes ?? null}
    WHERE id = ${patientId} AND practitioner_id = ${practitionerId}`);
  if (r.rowCount === 0) throw new ApiError("NOT_FOUND", "Patient not found");
  // Field names only: never copy clinical text into the audit trail.
  await audit({ actorUserId, action: "patient.update", objectType: "practice_patient", objectId: patientId, changedFields: { fields: Object.keys(input) } });
}

export async function setPatientArchived(practitionerId: string, actorUserId: string, patientId: string, archived: boolean): Promise<void> {
  const r = await db().execute(sql`
    UPDATE practice_patients SET archived_at = ${archived ? sql`now()` : sql`NULL`} WHERE id = ${patientId} AND practitioner_id = ${practitionerId}`);
  if (r.rowCount === 0) throw new ApiError("NOT_FOUND", "Patient not found");
  await audit({ actorUserId, action: archived ? "patient.archive" : "patient.restore", objectType: "practice_patient", objectId: patientId });
}

export type PatientSummary = { id: string; refNo: string; fullName: string; mobile: string | null; sex: string | null; age: number | null; lastVisitOn: string | null; nextVisitOn: string | null; archived: boolean };

function age(birthYear: number | null): number | null {
  return birthYear ? new Date().getFullYear() - birthYear : null;
}

/** EMR-02: search by name, mobile digits or ref no. */
export async function listPatients(practitionerId: string, opts: { q?: string; archived?: boolean } = {}): Promise<PatientSummary[]> {
  const q = (opts.q ?? "").trim();
  const digits = q.replace(/\D/g, "");
  const search = q
    ? sql`AND (p.full_name ILIKE ${`%${q}%`} OR p.ref_no ILIKE ${`%${q}%`} ${digits.length >= 4 ? sql`OR p.mobile LIKE ${`%${digits}%`}` : sql``})`
    : sql``;
  const res = await db().execute<{ id: string; ref_no: string; full_name: string; mobile: string | null; sex: string | null; birth_year: number | null; last_visit_on: string | null; next_visit_on: string | null; archived: boolean }>(sql`
    SELECT p.id, p.ref_no, p.full_name, p.mobile, p.sex, p.birth_year, (p.archived_at IS NOT NULL) AS archived,
      (SELECT max(v.visit_on)::text FROM patient_visits v WHERE v.patient_id = p.id) AS last_visit_on,
      (SELECT v.next_visit_on::text FROM patient_visits v WHERE v.patient_id = p.id ORDER BY v.visit_on DESC, v.created_at DESC LIMIT 1) AS next_visit_on
    FROM practice_patients p
    WHERE p.practitioner_id = ${practitionerId} AND (p.archived_at IS NOT NULL) = ${Boolean(opts.archived)} ${search}
    ORDER BY p.updated_at DESC
    LIMIT 200`);
  return res.rows.map((r) => ({ id: r.id, refNo: r.ref_no, fullName: r.full_name, mobile: r.mobile, sex: r.sex, age: age(r.birth_year), lastVisitOn: r.last_visit_on, nextVisitOn: r.next_visit_on, archived: r.archived }));
}

export type PatientRecord = {
  id: string; refNo: string; fullName: string; mobile: string | null; sex: string | null; birthYear: number | null; age: number | null; address: string | null;
  emergencyContact: string | null; referredBy: string | null; medicalHistory: string | null; notes: string | null; consentRecordedAt: Date; archived: boolean; createdAt: Date;
};

/** EMR-02/06: loads one record and logs the read. Returns null outside the practice. */
export async function getPatient(practitionerId: string, viewerUserId: string, patientId: string): Promise<PatientRecord | null> {
  if (!z.uuid().safeParse(patientId).success) return null;
  const res = await db().execute<{
    id: string; ref_no: string; full_name: string; mobile: string | null; sex: string | null; birth_year: number | null; address: string | null; emergency_contact: string | null;
    referred_by: string | null; medical_history: string | null; notes: string | null; consent_recorded_at: string; archived: boolean; created_at: string;
  }>(sql`
    SELECT id, ref_no, full_name, mobile, sex, birth_year, address, emergency_contact, referred_by, medical_history, notes, consent_recorded_at,
           (archived_at IS NOT NULL) AS archived, created_at
    FROM practice_patients WHERE id = ${patientId} AND practitioner_id = ${practitionerId}`);
  const r = res.rows[0];
  if (!r) return null;
  await audit({ actorUserId: viewerUserId, action: "patient.view", objectType: "practice_patient", objectId: r.id });
  return {
    id: r.id, refNo: r.ref_no, fullName: r.full_name, mobile: r.mobile, sex: r.sex, birthYear: r.birth_year, age: age(r.birth_year), address: r.address,
    emergencyContact: r.emergency_contact, referredBy: r.referred_by, medicalHistory: r.medical_history, notes: r.notes, consentRecordedAt: new Date(r.consent_recorded_at),
    archived: r.archived, createdAt: new Date(r.created_at),
  };
}

/** Patient picker for plans and packages (EMR-05): active patients only, minimal fields. */
export async function patientOptions(practitionerId: string): Promise<{ id: string; label: string; firstName: string }[]> {
  const res = await db().execute<{ id: string; ref_no: string; full_name: string }>(sql`
    SELECT id, ref_no, full_name FROM practice_patients WHERE practitioner_id = ${practitionerId} AND archived_at IS NULL ORDER BY full_name LIMIT 500`);
  return res.rows.map((r) => ({ id: r.id, label: `${r.full_name} (${r.ref_no})`, firstName: r.full_name.split(/\s+/)[0] }));
}

/** EMR-05: a linked patient must belong to the same practice. */
export async function assertOwnPatient(tx: Db, practitionerId: string, patientId: string | undefined | null): Promise<void> {
  if (!patientId) return;
  const r = await tx.execute<{ id: string }>(sql`SELECT id FROM practice_patients WHERE id = ${patientId} AND practitioner_id = ${practitionerId}`);
  if (!r.rows[0]) throw new ApiError("INVALID_INPUT", "Choose one of your patients");
}

// ------------------------------------------------------------------ visits (EMR-03)

export const VISIT_KINDS = [
  { key: "assessment", label: "Initial assessment" },
  { key: "follow_up", label: "Follow-up / treatment" },
  { key: "review", label: "Review" },
  { key: "discharge", label: "Discharge" },
  { key: "addendum", label: "Addendum (correction)" },
] as const;
type VisitKind = (typeof VISIT_KINDS)[number]["key"];

export const VisitSchema = z
  .object({
    visitOn: z.iso.date(),
    kind: z.enum(VISIT_KINDS.map((k) => k.key) as [VisitKind, ...VisitKind[]]),
    chiefComplaint: opt(1000),
    history: opt(4000),
    painScore: z.number().int().min(0).max(10).optional(),
    findings: opt(4000),
    diagnosis: opt(1000),
    treatmentGiven: opt(3000),
    plan: opt(3000),
    nextVisitOn: z.iso.date().optional(),
  })
  .refine((v) => [v.chiefComplaint, v.history, v.findings, v.diagnosis, v.treatmentGiven, v.plan].some(Boolean) || v.painScore !== undefined, { message: "Write at least one part of the note" })
  .refine((v) => !v.nextVisitOn || v.nextVisitOn >= v.visitOn, { message: "Next visit must be on or after this visit", path: ["nextVisitOn"] });
export type VisitInput = z.infer<typeof VisitSchema>;

export const EDIT_WINDOW_HOURS = 24;

export async function addVisit(practitionerId: string, actorUserId: string, patientId: string, input: VisitInput): Promise<string> {
  return withTransaction(async (_c, tx) => {
    await assertTerms(tx, practitionerId);
    await assertOwnPatient(tx, practitionerId, patientId);
    const r = await tx.execute<{ id: string }>(sql`
      INSERT INTO patient_visits (patient_id, practitioner_id, visit_on, kind, chief_complaint, history, pain_score, findings, diagnosis, treatment_given, plan, next_visit_on, created_by)
      VALUES (${patientId}, ${practitionerId}, ${input.visitOn}::date, ${input.kind}, ${input.chiefComplaint ?? null}, ${input.history ?? null}, ${input.painScore ?? null},
              ${input.findings ?? null}, ${input.diagnosis ?? null}, ${input.treatmentGiven ?? null}, ${input.plan ?? null}, ${input.nextVisitOn ?? null}::date, ${actorUserId})
      RETURNING id`);
    await tx.execute(sql`UPDATE practice_patients SET updated_at = now() WHERE id = ${patientId}`);
    await audit({ actorUserId, action: "patient_visit.create", objectType: "patient_visit", objectId: r.rows[0].id, changedFields: { patientId, kind: input.kind } }, tx);
    return r.rows[0].id;
  });
}

/** EMR-03: only the author, only within the edit window; afterwards the note is locked and corrections are addenda. */
export async function updateVisit(practitionerId: string, actorUserId: string, visitId: string, input: VisitInput): Promise<void> {
  const r = await db().execute(sql`
    UPDATE patient_visits SET visit_on = ${input.visitOn}::date, kind = ${input.kind}, chief_complaint = ${input.chiefComplaint ?? null}, history = ${input.history ?? null},
      pain_score = ${input.painScore ?? null}, findings = ${input.findings ?? null}, diagnosis = ${input.diagnosis ?? null}, treatment_given = ${input.treatmentGiven ?? null},
      plan = ${input.plan ?? null}, next_visit_on = ${input.nextVisitOn ?? null}::date
    WHERE id = ${visitId} AND practitioner_id = ${practitionerId} AND created_by = ${actorUserId}
      AND created_at > now() - make_interval(hours => ${EDIT_WINDOW_HOURS})`);
  if (r.rowCount === 0) throw new ApiError("CONFLICT", `Notes can be edited only by their author within ${EDIT_WINDOW_HOURS} hours. Add an addendum instead.`);
  await audit({ actorUserId, action: "patient_visit.update", objectType: "patient_visit", objectId: visitId });
}

export type VisitRow = {
  id: string; visitOn: string; kind: VisitKind; chiefComplaint: string | null; history: string | null; painScore: number | null; findings: string | null; diagnosis: string | null;
  treatmentGiven: string | null; plan: string | null; nextVisitOn: string | null; authorName: string | null; createdAt: Date; editable: boolean;
};

export async function listVisits(practitionerId: string, viewerUserId: string, patientId: string): Promise<VisitRow[]> {
  const res = await db().execute<{
    id: string; visit_on: string; kind: VisitKind; chief_complaint: string | null; history: string | null; pain_score: number | null; findings: string | null; diagnosis: string | null;
    treatment_given: string | null; plan: string | null; next_visit_on: string | null; author_name: string | null; created_at: string; editable: boolean;
  }>(sql`
    SELECT v.id, v.visit_on::text AS visit_on, v.kind, v.chief_complaint, v.history, v.pain_score, v.findings, v.diagnosis, v.treatment_given, v.plan,
           v.next_visit_on::text AS next_visit_on, coalesce(nullif(u.display_name, ''), u.email) AS author_name, v.created_at,
           (v.created_by = ${viewerUserId} AND v.created_at > now() - make_interval(hours => ${EDIT_WINDOW_HOURS})) AS editable
    FROM patient_visits v LEFT JOIN users u ON u.id = v.created_by
    WHERE v.patient_id = ${patientId} AND v.practitioner_id = ${practitionerId}
    ORDER BY v.visit_on DESC, v.created_at DESC`);
  return res.rows.map((r) => ({
    id: r.id, visitOn: r.visit_on, kind: r.kind, chiefComplaint: r.chief_complaint, history: r.history, painScore: r.pain_score, findings: r.findings, diagnosis: r.diagnosis,
    treatmentGiven: r.treatment_given, plan: r.plan, nextVisitOn: r.next_visit_on, authorName: r.author_name, createdAt: new Date(r.created_at), editable: r.editable,
  }));
}

// ------------------------------------------------------------------ timeline (EMR-04)

export type TimelineEvent = { at: string; kind: "visit" | "plan" | "package" | "payment" | "session" | "document"; title: string; detail: string | null; href: string | null };

/** EMR-04: everything linked to the patient, newest first. Dates are IST calendar days. */
export async function patientTimeline(practitionerId: string, patientId: string): Promise<TimelineEvent[]> {
  const res = await db().execute<TimelineEvent>(sql`
    SELECT * FROM (
      SELECT v.visit_on::text AS at, 'visit' AS kind,
             CASE v.kind WHEN 'assessment' THEN 'Initial assessment' WHEN 'follow_up' THEN 'Treatment session' WHEN 'review' THEN 'Review' WHEN 'discharge' THEN 'Discharged' ELSE 'Addendum' END AS title,
             coalesce(v.diagnosis, v.chief_complaint) || CASE WHEN v.pain_score IS NOT NULL THEN ' · pain ' || v.pain_score || '/10' ELSE '' END AS detail,
             '#visit-' || v.id AS href
      FROM patient_visits v WHERE v.patient_id = ${patientId} AND v.practitioner_id = ${practitionerId}
      UNION ALL
      SELECT (ep.created_at AT TIME ZONE 'Asia/Kolkata')::date::text, 'plan', 'Exercise plan: ' || ep.title,
             (SELECT count(*) FROM exercise_plan_items i WHERE i.plan_id = ep.id) || ' exercises · done ' ||
             (SELECT count(*) FROM exercise_plan_checkins c WHERE c.plan_id = ep.id) || ' days', '/workspace/exercises/' || ep.id
      FROM exercise_plans ep WHERE ep.practice_patient_id = ${patientId} AND ep.practitioner_id = ${practitionerId}
      UNION ALL
      SELECT c.day::text, 'session', 'Home exercises done', CASE WHEN c.pain_score IS NOT NULL THEN 'pain ' || c.pain_score || '/10' END, NULL
      FROM exercise_plan_checkins c JOIN exercise_plans ep ON ep.id = c.plan_id WHERE ep.practice_patient_id = ${patientId} AND ep.practitioner_id = ${practitionerId}
      UNION ALL
      SELECT pp.starts_on::text, 'package', 'Package: ' || pp.name, pp.sessions_total || ' sessions', '/workspace/packages'
      FROM patient_packages pp WHERE pp.practice_patient_id = ${patientId} AND pp.practitioner_id = ${practitionerId}
      UNION ALL
      SELECT u.used_on::text, 'session', 'Package session used', pp.name, NULL
      FROM package_session_uses u JOIN patient_packages pp ON pp.id = u.package_id WHERE pp.practice_patient_id = ${patientId} AND pp.practitioner_id = ${practitionerId}
      UNION ALL
      SELECT pay.received_on::text, 'payment', 'Payment ' || pay.receipt_no, '₹' || (pay.amount_paise / 100), '/workspace/packages/receipts/' || pay.id
      FROM package_payments pay JOIN patient_packages pp ON pp.id = pay.package_id WHERE pp.practice_patient_id = ${patientId} AND pp.practitioner_id = ${practitionerId}
    ) t
    ORDER BY at DESC, kind
    LIMIT 300`);
  return res.rows;
}

/** Label used on plans/packages when a record is linked: the patient's first name (EMR-05). */
export async function patientFirstName(practitionerId: string, patientId: string): Promise<string | null> {
  if (!z.uuid().safeParse(patientId).success) return null;
  const r = await db().execute<{ full_name: string }>(sql`SELECT full_name FROM practice_patients WHERE id = ${patientId} AND practitioner_id = ${practitionerId}`);
  return r.rows[0]?.full_name.split(/\s+/)[0]?.slice(0, 40) ?? null;
}
