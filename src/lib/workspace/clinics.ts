import { sql } from "drizzle-orm";
import { z } from "zod";
import { db, withTransaction } from "@/db/client";
import { audit } from "@/lib/audit";
import { ApiError } from "@/lib/api";
import { newPublicId } from "@/lib/public-id";
import { slugify } from "@/lib/slug";
import { openCase } from "./cases";

/** Clinic, branch and association mutations (LOC-01, LOC-02, LOC-03). Associations start 'pending'; admin approval publishes them. */

export const NewClinicBranchSchema = z.object({
  clinicName: z.string().trim().min(2, "Clinic name is too short").max(160),
  branchName: z.string().trim().max(120).optional().or(z.literal("")),
  addressLine1: z.string().trim().min(3, "Address is required").max(200),
  addressLine2: z.string().trim().max(200).optional().or(z.literal("")),
  stateId: z.uuid("Choose a state"),
  cityId: z.uuid("Choose a city"),
  localityId: z.uuid().optional(),
  newLocalityName: z.string().trim().min(2).max(120).optional(),
  pinCode: z.string().regex(/^[1-9][0-9]{5}$/, "PIN code must be six digits"),
  phone: z.string().trim().max(20).optional().or(z.literal("")),
}).refine((v) => v.localityId || v.newLocalityName, { message: "Choose a locality or propose a new one", path: ["localityId"] });

export type NewClinicBranch = z.infer<typeof NewClinicBranchSchema>;

/** Creates clinic + branch (draft) and a pending association. A new locality enters review as 'proposed' (DIR-08). */
export async function createClinicBranch(practitionerId: string, actorUserId: string, input: NewClinicBranch): Promise<{ associationId: string; branchId: string }> {
  return withTransaction(async (_c, tx) => {
    const city = await tx.execute<{ id: string }>(sql`SELECT id FROM cities WHERE id = ${input.cityId} AND state_id = ${input.stateId} AND status = 'active'`);
    if (!city.rows[0]) throw new ApiError("INVALID_INPUT", "City does not belong to the selected state");
    let localityId = input.localityId ?? null;
    let proposalId: string | null = null;
    if (localityId) {
      const loc = await tx.execute<{ id: string }>(sql`SELECT id FROM localities WHERE id = ${localityId} AND city_id = ${input.cityId}`);
      if (!loc.rows[0]) throw new ApiError("INVALID_INPUT", "Locality does not belong to the selected city");
    } else {
      const name = input.newLocalityName!;
      const slug = slugify(name);
      const existing = await tx.execute<{ id: string }>(sql`SELECT id FROM localities WHERE city_id = ${input.cityId} AND slug = ${slug}`);
      if (existing.rows[0]) {
        localityId = existing.rows[0].id;
      } else {
        const ins = await tx.execute<{ id: string }>(sql`INSERT INTO localities (city_id, name, slug, status, pin_codes) VALUES (${input.cityId}, ${name}, ${slug}, 'proposed', ARRAY[${input.pinCode}]) RETURNING id`);
        localityId = ins.rows[0].id;
        const prop = await tx.execute<{ id: string }>(sql`
          INSERT INTO locality_proposals (city_id, proposed_name, proposed_pin_code, proposed_by_user_id, practitioner_id, resolved_locality_id)
          VALUES (${input.cityId}, ${name}, ${input.pinCode}, ${actorUserId}, ${practitionerId}, ${localityId}) RETURNING id`);
        proposalId = prop.rows[0].id;
      }
    }
    const clinic = await tx.execute<{ id: string }>(sql`
      INSERT INTO clinics (public_id, slug, name, owner_user_id, public_phone, status)
      VALUES (${newPublicId()}, ${slugify(input.clinicName)}, ${input.clinicName}, ${actorUserId}, ${input.phone || null}, 'draft') RETURNING id`);
    const branch = await tx.execute<{ id: string }>(sql`
      INSERT INTO branches (clinic_id, name, address_line1, address_line2, locality_id, city_id, state_id, pin_code, public_phone, status)
      VALUES (${clinic.rows[0].id}, ${input.branchName || input.clinicName}, ${input.addressLine1}, ${input.addressLine2 || null}, ${localityId}, ${input.cityId}, ${input.stateId}, ${input.pinCode}, ${input.phone || null}, 'draft') RETURNING id`);
    const branchId = branch.rows[0].id;
    if (proposalId) {
      await tx.execute(sql`UPDATE locality_proposals SET branch_id = ${branchId} WHERE id = ${proposalId}`);
      await openCase({ caseType: "locality_proposal", subjectType: "locality_proposal", subjectId: proposalId, practitionerId, submittedByUserId: actorUserId }, tx);
    }
    const assoc = await tx.execute<{ id: string }>(sql`
      INSERT INTO practitioner_branches (practitioner_id, branch_id, state, bookable, public_contact_rules)
      VALUES (${practitionerId}, ${branchId}, 'pending', true, '{"showBranchPhone": true}'::jsonb) RETURNING id`);
    await audit({ actorUserId, action: "clinic.create", objectType: "clinic", objectId: clinic.rows[0].id, changedFields: { branchId, practitionerId, proposalId } }, tx);
    await audit({ actorUserId, action: "association.request", objectType: "practitioner_branch", objectId: assoc.rows[0].id }, tx);
    return { associationId: assoc.rows[0].id, branchId };
  });
}

/** Joins an existing branch; the association waits for approval (LOC-02, LOC-03). */
export async function joinBranch(practitionerId: string, actorUserId: string, branchId: string): Promise<string> {
  return withTransaction(async (_c, tx) => {
    const b = await tx.execute<{ id: string }>(sql`SELECT b.id FROM branches b JOIN clinics c ON c.id = b.clinic_id WHERE b.id = ${branchId} AND b.status <> 'archived' AND c.status <> 'archived'`);
    if (!b.rows[0]) throw new ApiError("NOT_FOUND", "Clinic branch not found");
    const dup = await tx.execute<{ id: string }>(sql`SELECT id FROM practitioner_branches WHERE practitioner_id = ${practitionerId} AND branch_id = ${branchId} AND state IN ('pending', 'approved') AND active_to IS NULL`);
    if (dup.rows[0]) throw new ApiError("CONFLICT", "You are already associated with this branch");
    const ins = await tx.execute<{ id: string }>(sql`
      INSERT INTO practitioner_branches (practitioner_id, branch_id, state, bookable, public_contact_rules)
      VALUES (${practitionerId}, ${branchId}, 'pending', true, '{"showBranchPhone": true}'::jsonb) RETURNING id`);
    await audit({ actorUserId, action: "association.request", objectType: "practitioner_branch", objectId: ins.rows[0].id, changedFields: { branchId } }, tx);
    return ins.rows[0].id;
  });
}

/**
 * Ends an association: stops new bookings at the branch and creates a
 * resolution task when future confirmed bookings exist (LOC-02). Offerings at
 * the branch are deactivated; existing appointments are never cancelled silently.
 */
export async function endAssociation(practitionerId: string, actorUserId: string, associationId: string, reason: string | null): Promise<{ futureBookings: number }> {
  return withTransaction(async (_c, tx) => {
    const row = await tx.execute<{ id: string; branch_id: string }>(sql`
      SELECT id, branch_id FROM practitioner_branches WHERE id = ${associationId} AND practitioner_id = ${practitionerId} AND state IN ('pending', 'approved') FOR UPDATE`);
    const a = row.rows[0];
    if (!a) throw new ApiError("NOT_FOUND", "Association not found or already ended");
    await tx.execute(sql`UPDATE practitioner_branches SET state = 'ended', active_to = current_date, bookable = false, ended_reason = ${reason} WHERE id = ${a.id}`);
    await tx.execute(sql`UPDATE offerings SET active = false WHERE practitioner_branch_id = ${a.id}`);
    const future = await tx.execute<{ n: string | number }>(sql`SELECT count(*) AS n FROM bookings WHERE practitioner_id = ${practitionerId} AND branch_id = ${a.branch_id} AND status = 'confirmed' AND starts_at > now()`);
    const futureBookings = Number(future.rows[0]?.n ?? 0);
    if (futureBookings > 0) {
      await tx.execute(sql`
        INSERT INTO resolution_tasks (kind, practitioner_id, branch_id, details)
        VALUES ('association_ended', ${practitionerId}, ${a.branch_id}, ${JSON.stringify({ associationId: a.id, futureBookings, reason })}::jsonb)`);
    }
    await audit({ actorUserId, action: "association.end", objectType: "practitioner_branch", objectId: a.id, reason, changedFields: { futureBookings } }, tx);
    return { futureBookings };
  });
}

export async function updateContactRules(practitionerId: string, actorUserId: string, associationId: string, rules: { showBranchPhone: boolean }): Promise<void> {
  const res = await db().execute(sql`
    UPDATE practitioner_branches SET public_contact_rules = ${JSON.stringify(rules)}::jsonb
    WHERE id = ${associationId} AND practitioner_id = ${practitionerId} AND state <> 'ended'`);
  if (res.rowCount === 0) throw new ApiError("NOT_FOUND", "Association not found");
  await audit({ actorUserId, action: "association.contact_rules", objectType: "practitioner_branch", objectId: associationId, changedFields: rules });
}
