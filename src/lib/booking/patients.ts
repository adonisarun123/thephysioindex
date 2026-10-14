import { sql } from "drizzle-orm";
import { db, type Db } from "@/db/client";
import { ApiError } from "@/lib/api";
import { audit } from "@/lib/audit";
import { getConfig } from "@/lib/config";

/**
 * Patient records the signed-in user may book for (BKG-07 step 1, BKG-16).
 * A login session never chooses a patient by ID alone: authority is the
 * account's own record or an active guardian link.
 */

export type BookablePatient = { id: string; displayName: string; relationship: "self" | string; ageBand: string | null };

export async function listBookablePatients(userId: string, d: Db = db()): Promise<BookablePatient[]> {
  const res = await d.execute<{ id: string; display_name: string; relationship: string; age_band: string | null }>(sql`
    SELECT * FROM (
    SELECT p.id, p.display_name, 'self' AS relationship, p.age_band::text AS age_band
    FROM patients p WHERE p.account_user_id = ${userId} AND p.status = 'active'
    UNION ALL
    SELECT p.id, p.display_name, g.relationship, p.age_band::text AS age_band
    FROM guardian_links g JOIN patients p ON p.id = g.patient_id
    WHERE g.guardian_user_id = ${userId} AND g.revoked_at IS NULL AND g.verification_state <> 'revoked' AND p.status = 'active'
    ) x ORDER BY (relationship = 'self') DESC, display_name`);
  return res.rows.map((r) => ({ id: r.id, displayName: r.display_name, relationship: r.relationship, ageBand: r.age_band }));
}

/** The account holder's own patient record, created on first booking. */
export async function ensureSelfPatient(user: { userId: string; name: string | null; mobile: string | null; mobileVerified: boolean }, d: Db = db()): Promise<string> {
  const existing = await d.execute<{ id: string }>(sql`SELECT id FROM patients WHERE account_user_id = ${user.userId} AND status = 'active' ORDER BY created_at LIMIT 1`);
  if (existing.rows[0]) return existing.rows[0].id;
  const name = (user.name ?? "").trim() || "Patient";
  const res = await d.execute<{ id: string }>(sql`
    INSERT INTO patients (account_user_id, display_name, mobile, mobile_verified_at, age_band, created_by_user_id)
    VALUES (${user.userId}, ${name}, ${user.mobile}, ${user.mobileVerified ? sql`now()` : null}, 'adult', ${user.userId}) RETURNING id`);
  await audit({ actorUserId: user.userId, action: "patient.create_self", objectType: "patient", objectId: res.rows[0].id }, d);
  return res.rows[0].id;
}

/**
 * Another adult the user is authorised to book for (BKG-16). The confirmation
 * is recorded as consent; it is self-declared, never shown as verified.
 * Minors stay disabled unless the guardian process is approved and enabled.
 */
export async function addAdultDependant(userId: string, input: { displayName: string; relationship: string; confirmedAuthority: boolean }, d: Db = db()): Promise<string> {
  if (!input.confirmedAuthority) throw new ApiError("INVALID_INPUT", "Confirm that you are authorised to book for this person");
  const res = await d.execute<{ id: string }>(sql`
    INSERT INTO patients (account_user_id, display_name, age_band, created_by_user_id)
    VALUES (NULL, ${input.displayName}, 'adult', ${userId}) RETURNING id`);
  const patientId = res.rows[0].id;
  await d.execute(sql`
    INSERT INTO guardian_links (guardian_user_id, patient_id, relationship, verification_state)
    VALUES (${userId}, ${patientId}, ${input.relationship}, 'self_declared')`);
  await d.execute(sql`
    INSERT INTO consent_records (subject_type, subject_id, purpose, notice_version, action, source, actor_user_id)
    VALUES ('patient', ${patientId}, 'dependant_booking', 'dependant-2026-10', 'granted', 'web', ${userId})`);
  await audit({ actorUserId: userId, action: "patient.add_dependant", objectType: "patient", objectId: patientId, changedFields: { relationship: input.relationship } }, d);
  return patientId;
}

/** Throws unless `userId` may book for `patientId`. Returns the patient row. */
export async function assertPatientAuthority(d: Db, userId: string, patientId: string): Promise<{ id: string; ageBand: string | null; displayName: string }> {
  const res = await d.execute<{ id: string; age_band: string | null; status: string; display_name: string; authorised: boolean }>(sql`
    SELECT p.id, p.age_band::text AS age_band, p.status::text AS status, p.display_name,
      (p.account_user_id = ${userId} OR EXISTS (
        SELECT 1 FROM guardian_links g WHERE g.patient_id = p.id AND g.guardian_user_id = ${userId}
          AND g.revoked_at IS NULL AND g.verification_state <> 'revoked')) AS authorised
    FROM patients p WHERE p.id = ${patientId}`);
  const p = res.rows[0];
  if (!p || !p.authorised) throw new ApiError("UNAUTHORISED", "You cannot book for this patient");
  if (p.status !== "active") throw new ApiError("CONFLICT", "This patient record is not active");
  if (p.age_band === "minor" && !(await getConfig<boolean>("booking.minor_bookings_enabled", false))) {
    throw new ApiError("FEATURE_DISABLED", "Booking for children is not available yet (guardian verification is not enabled).");
  }
  return { id: p.id, ageBand: p.age_band, displayName: p.display_name };
}
