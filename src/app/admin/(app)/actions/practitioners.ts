"use server";

import { revalidatePath } from "next/cache";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { withTransaction } from "@/db/client";
import { ApiError } from "@/lib/api";
import { audit } from "@/lib/audit";
import { requireStaff } from "@/lib/auth/session";
import { openCase } from "@/lib/admin/cases";
import { decideCase } from "@/lib/admin/decisions";
import { act, parseForm, requireRecent, zBool, zOpt, zOptDate, zReason, zReq, zUuid } from "@/lib/admin/forms";
import { findUserByContact } from "@/lib/admin/practitioners";
import { actorRole, archivePractitioner, lockPractitioner, reinstatePractitioner, setBookingEligible, suspendPractitioner } from "@/lib/admin/practitioner-ops";
import { newPublicId } from "@/lib/public-id";
import { normaliseRegistrationNumber, slugify } from "@/lib/slug";

const idReason = z.object({ practitionerId: zUuid, reason: zReason });

function revalidate(id: string) {
  revalidatePath(`/admin/practitioners/${id}`);
  revalidatePath("/admin/practitioners");
  revalidatePath("/admin", "layout");
}

/** ADM-03 / VER-06. Suspension takes effect on the authoritative write path. */
export async function suspendAction(fd: FormData) {
  const v = await requireStaff("super_admin");
  const { practitionerId, reason } = parseForm(idReason, fd);
  requireRecent(v, `/admin/practitioners/${practitionerId}`);
  await act(`/admin/practitioners/${practitionerId}`, async () => {
    const { tasks } = await withTransaction((_c, tx) => suspendPractitioner(tx, v, practitionerId, reason));
    revalidate(practitionerId);
    return { notice: `Suspended. ${tasks} resolution task(s) opened for future bookings.` };
  });
}

export async function reinstateAction(fd: FormData) {
  const v = await requireStaff("super_admin");
  const { practitionerId, reason } = parseForm(idReason, fd);
  requireRecent(v, `/admin/practitioners/${practitionerId}`);
  await act(`/admin/practitioners/${practitionerId}`, async () => {
    await withTransaction((_c, tx) => reinstatePractitioner(tx, v, practitionerId, reason));
    revalidate(practitionerId);
    return { notice: "Reinstated. Booking eligibility must be re-enabled separately (VER-04)." };
  });
}

export async function archiveAction(fd: FormData) {
  const v = await requireStaff("super_admin");
  const { practitionerId, reason } = parseForm(idReason, fd);
  requireRecent(v, `/admin/practitioners/${practitionerId}`);
  await act(`/admin/practitioners/${practitionerId}`, async () => {
    await withTransaction((_c, tx) => archivePractitioner(tx, v, practitionerId, reason));
    revalidate(practitionerId);
    return { notice: "Archived" };
  });
}

/** VER-04: booking eligibility is a separate decision with a server-checked list. */
export async function bookingEligibleAction(fd: FormData) {
  const v = await requireStaff("verification_reviewer");
  const { practitionerId, reason, enabled } = parseForm(idReason.extend({ enabled: zBool }), fd);
  await act(`/admin/practitioners/${practitionerId}`, async () => {
    await withTransaction((_c, tx) => setBookingEligible(tx, v, practitionerId, enabled, reason));
    revalidate(practitionerId);
    return { notice: enabled ? "Booking enabled" : "Booking eligibility removed" };
  });
}

/** PRO-18: pause keeps the profile visible with online booking marked unavailable. */
export async function pauseBookingsAction(fd: FormData) {
  const v = await requireStaff("support_agent");
  const { practitionerId, reason, paused } = parseForm(idReason.extend({ paused: zBool }), fd);
  await act(`/admin/practitioners/${practitionerId}`, async () => {
    await withTransaction(async (_c, tx) => {
      const p = await lockPractitioner(tx, practitionerId);
      await tx.execute(sql`UPDATE practitioners SET booking_paused = ${paused} WHERE id = ${practitionerId}`);
      if (paused) await tx.execute(sql`UPDATE reservations SET state = 'released', released_reason = 'bookings paused by staff' WHERE practitioner_id = ${practitionerId} AND state = 'held'`);
      await audit({ actorUserId: v.userId, actorRole: actorRole(v), action: paused ? "practitioner.pause_bookings" : "practitioner.resume_bookings", objectType: "practitioner", objectId: practitionerId, reason, changedFields: { bookingPaused: { to: paused }, listing: p.listing_status } }, tx);
    });
    revalidate(practitionerId);
    return { notice: paused ? "New bookings paused" : "Bookings resumed" };
  });
}

/** IAM-03: ownership transfer is requested here and applied only when a different super admin approves. */
export async function requestOwnershipTransferAction(fd: FormData) {
  const v = await requireStaff("super_admin");
  const { practitionerId, reason, newOwner } = parseForm(idReason.extend({ newOwner: zReq(200) }), fd);
  requireRecent(v, `/admin/practitioners/${practitionerId}`);
  await act(`/admin/practitioners/${practitionerId}`, async () => {
    const user = await findUserByContact(newOwner);
    if (!user) throw new ApiError("NOT_FOUND", "No account matches that email, mobile or id");
    const { id, created } = await withTransaction(async (_c, tx) => {
      const r = await openCase(tx, { caseType: "ownership_transfer", subjectType: "practitioner", subjectId: practitionerId, practitionerId, submittedByUserId: v.userId, priority: "high", evidence: { newOwnerUserId: user.id, newOwnerName: user.name, reason } });
      if (r.created) await audit({ actorUserId: v.userId, actorRole: actorRole(v), action: "practitioner.transfer_requested", objectType: "practitioner", objectId: practitionerId, reason, changedFields: { newOwnerUserId: user.id, caseId: r.id } }, tx);
      return r;
    });
    revalidate(practitionerId);
    return { path: `/admin/cases/${id}`, notice: created ? "Transfer requested. A second super administrator must approve it." : "A transfer request is already open." };
  });
}

/** Inline credential status edit: opens a credential_check case if none is open, then records the decision through it (VER-02). */
const credentialSchema = z.object({
  practitionerId: zUuid,
  credentialId: zUuid,
  status: z.enum(["registration_checked", "document_reviewed", "unverifiable", "expired", "suspended", "revoked"]),
  method: zReq(200),
  scopeOfCheck: zOpt(500),
  nextReviewAt: zOptDate,
  publicNumberApproved: zBool,
  reason: zReason,
});

export async function credentialStatusAction(fd: FormData) {
  const v = await requireStaff("verification_reviewer");
  const input = parseForm(credentialSchema, fd);
  await act(`/admin/practitioners/${input.practitionerId}#credentials`, async () => {
    const { id } = await withTransaction((_c, tx) => openCase(tx, { caseType: "credential_check", subjectType: "credential", subjectId: input.credentialId, practitionerId: input.practitionerId, submittedByUserId: v.userId }));
    const decision = ["registration_checked", "document_reviewed"].includes(input.status) ? "approved" : input.status === "unverifiable" ? "rejected" : "suspended";
    const msg = await decideCase(v, { caseId: id, decision, reason: input.reason, credentialStatus: input.status, method: input.method, scopeOfCheck: input.scopeOfCheck, nextReviewAt: input.nextReviewAt ? `${input.nextReviewAt}T00:00:00+05:30` : undefined, publicNumberApproved: input.publicNumberApproved });
    revalidate(input.practitionerId);
    return { notice: msg };
  });
}

/** LOC-03: affiliation approval is separate from clinic ownership. */
export async function associationAction(fd: FormData) {
  const v = await requireStaff("verification_reviewer");
  const { practitionerId, associationId, op, reason } = parseForm(z.object({ practitionerId: zUuid, associationId: zUuid, op: z.enum(["approve", "reject", "end"]), reason: zReason }), fd);
  await act(`/admin/practitioners/${practitionerId}#associations`, async () => {
    await withTransaction(async (_c, tx) => {
      await lockPractitioner(tx, practitionerId);
      const cur = await tx.execute<{ state: string; branch_id: string }>(sql`SELECT state, branch_id FROM practitioner_branches WHERE id = ${associationId} AND practitioner_id = ${practitionerId} FOR UPDATE`);
      if (!cur.rows[0]) throw new ApiError("NOT_FOUND", "Association not found");
      if (op === "approve") await tx.execute(sql`UPDATE practitioner_branches SET state = 'approved', approved_by_user_id = ${v.userId} WHERE id = ${associationId} AND state = 'pending'`);
      if (op === "reject") await tx.execute(sql`UPDATE practitioner_branches SET state = 'rejected', ended_reason = ${reason} WHERE id = ${associationId} AND state = 'pending'`);
      if (op === "end") {
        await tx.execute(sql`UPDATE practitioner_branches SET state = 'ended', active_to = current_date, ended_reason = ${reason} WHERE id = ${associationId} AND state = 'approved'`);
        await tx.execute(sql`UPDATE offerings SET active = false WHERE practitioner_branch_id = ${associationId}`);
        await tx.execute(sql`UPDATE reservations SET state = 'released', released_reason = 'association ended' WHERE practitioner_id = ${practitionerId} AND branch_id = ${cur.rows[0].branch_id} AND state = 'held'`);
        await tx.execute(sql`INSERT INTO resolution_tasks (kind, booking_id, practitioner_id, branch_id, due_at, details)
          SELECT 'association_ended', b.id, b.practitioner_id, b.branch_id, b.starts_at, ${JSON.stringify({ reason, associationId })}::jsonb FROM bookings b
          WHERE b.practitioner_id = ${practitionerId} AND b.branch_id = ${cur.rows[0].branch_id} AND b.status IN ('confirmed','requested') AND b.starts_at > now()`);
      }
      await audit({ actorUserId: v.userId, actorRole: actorRole(v), action: `association.${op}`, objectType: "practitioner_branch", objectId: associationId, reason, changedFields: { practitionerId, from: cur.rows[0].state } }, tx);
    });
    revalidate(practitionerId);
    return { notice: `Association ${op === "end" ? "ended" : op + "d"}` };
  });
}

/** Staff-created profile: unclaimed, draft, never published without a listing_review case (PRO-07, ADM-06). */
const newSchema = z.object({
  displayName: zReq(120, 2),
  designation: zOpt(80),
  headline: zOpt(160),
  gender: z.enum(["female", "male", "non_binary", "unset"]).default("unset"),
  practiceStartDate: zOptDate,
  authorityId: zOpt(40),
  registrationNumber: zOpt(60),
  credentialType: z.enum(["statutory_registration", "enrolment", "degree", "association_membership", "certification"]).default("statutory_registration"),
  clinicName: zReq(160),
  branchName: zReq(120),
  addressLine1: zReq(200),
  addressLine2: zOpt(200),
  stateId: zUuid,
  cityId: zUuid,
  localityName: zReq(120),
  pinCode: z.string().regex(/^[1-9][0-9]{5}$/, "PIN must be six digits"),
  publicPhone: zOpt(20),
  sourceUrl: zOpt(500),
  submitForReview: zBool,
});

export async function createPractitionerAction(fd: FormData) {
  const v = await requireStaff("verification_reviewer");
  const i = parseForm(newSchema, fd);
  await act("/admin/practitioners/new", async () => {
    const id = await withTransaction(async (_c, tx) => {
      const loc = await tx.execute<{ id: string }>(sql`SELECT l.id FROM localities l LEFT JOIN geo_aliases ga ON ga.target_type = 'locality' AND ga.target_id = l.id
        WHERE l.city_id = ${i.cityId} AND l.status = 'active' AND (lower(l.name) = lower(${i.localityName}) OR l.slug = ${slugify(i.localityName)} OR ga.alias_normalised = ${i.localityName.toLowerCase().replace(/[^a-z0-9]+/g, "")}) LIMIT 1`);
      if (!loc.rows[0]) throw new ApiError("INVALID_INPUT", `Locality "${i.localityName}" is not in the master data for that city. Add it under Geography, or raise a locality proposal.`);
      const city = await tx.execute<{ state_id: string }>(sql`SELECT state_id FROM cities WHERE id = ${i.cityId}`);
      if (city.rows[0]?.state_id !== i.stateId) throw new ApiError("INVALID_INPUT", "City does not belong to the chosen state");
      let clinicId: string;
      const existingClinic = await tx.execute<{ id: string }>(sql`SELECT c.id FROM clinics c WHERE lower(c.name) = lower(${i.clinicName}) AND EXISTS (SELECT 1 FROM branches b WHERE b.clinic_id = c.id AND b.city_id = ${i.cityId}) LIMIT 1`);
      if (existingClinic.rows[0]) clinicId = existingClinic.rows[0].id;
      else {
        const c = await tx.execute<{ id: string }>(sql`INSERT INTO clinics (public_id, slug, name, public_phone, status) VALUES (${newPublicId()}, ${slugify(i.clinicName)}, ${i.clinicName}, ${i.publicPhone ?? null}, 'draft') RETURNING id`);
        clinicId = c.rows[0].id;
      }
      const branch = await tx.execute<{ id: string }>(sql`INSERT INTO branches (clinic_id, name, address_line1, address_line2, locality_id, city_id, state_id, pin_code, public_phone, status)
        VALUES (${clinicId}, ${i.branchName}, ${i.addressLine1}, ${i.addressLine2 ?? null}, ${loc.rows[0].id}, ${i.cityId}, ${i.stateId}, ${i.pinCode}, ${i.publicPhone ?? null}, 'draft') RETURNING id`);
      const pr = await tx.execute<{ id: string }>(sql`INSERT INTO practitioners (public_id, slug, claim_state, listing_status, source, display_name, designation, headline, gender, practice_start_date)
        VALUES (${newPublicId()}, ${slugify(i.displayName)}, 'unclaimed', 'draft', 'staff_created', ${i.displayName}, ${i.designation ?? "Physiotherapist"}, ${i.headline ?? null}, ${i.gender}::gender_pref, ${i.practiceStartDate ?? null}::date) RETURNING id`);
      const pid = pr.rows[0].id;
      const content = { displayName: i.displayName, designation: i.designation ?? "Physiotherapist", headline: i.headline ?? null, gender: i.gender, practiceStartDate: i.practiceStartDate ?? null, sourceUrl: i.sourceUrl ?? null };
      const pv = await tx.execute<{ id: string }>(sql`INSERT INTO profile_versions (practitioner_id, version, state, structured_content, created_by_user_id, submitted_at)
        VALUES (${pid}, 1, ${i.submitForReview ? "submitted" : "draft"}::profile_version_state, ${JSON.stringify(content)}::jsonb, ${v.userId}, ${i.submitForReview ? sql`now()` : null}) RETURNING id`);
      await tx.execute(sql`INSERT INTO practitioner_branches (practitioner_id, branch_id, state, approved_by_user_id) VALUES (${pid}, ${branch.rows[0].id}, 'approved', ${v.userId})`);
      if (i.authorityId && i.registrationNumber) {
        await tx.execute(sql`INSERT INTO credentials (practitioner_id, authority_id, type, number_original, number_normalised, status, source)
          VALUES (${pid}, ${i.authorityId}, ${i.credentialType}::credential_type, ${i.registrationNumber}, ${normaliseRegistrationNumber(i.registrationNumber)}, 'self_declared', ${i.sourceUrl ?? "staff entry"})`);
      }
      if (i.submitForReview) {
        await tx.execute(sql`UPDATE practitioners SET listing_status = 'submitted' WHERE id = ${pid}`);
        await openCase(tx, { caseType: "listing_review", subjectType: "profile_version", subjectId: pv.rows[0].id, practitionerId: pid, submittedByUserId: v.userId });
      }
      await audit({ actorUserId: v.userId, actorRole: actorRole(v), action: "practitioner.create", objectType: "practitioner", objectId: pid, reason: "staff created", changedFields: { source: "staff_created", clinicId, branchId: branch.rows[0].id, submitted: i.submitForReview } }, tx);
      return pid;
    });
    revalidatePath("/admin", "layout");
    return { path: `/admin/practitioners/${id}`, notice: i.submitForReview ? "Profile created and sent for listing review" : "Draft profile created. Submit it for review to publish." };
  });
}

/** Sends the latest draft version into listing review (staff-created or imported profiles). */
export async function submitForReviewAction(fd: FormData) {
  const v = await requireStaff("verification_reviewer");
  const { practitionerId } = parseForm(z.object({ practitionerId: zUuid }), fd);
  await act(`/admin/practitioners/${practitionerId}`, async () => {
    const caseId = await withTransaction(async (_c, tx) => {
      const p = await lockPractitioner(tx, practitionerId);
      const pv = await tx.execute<{ id: string }>(sql`SELECT id FROM profile_versions WHERE practitioner_id = ${practitionerId} AND state IN ('draft','submitted') ORDER BY version DESC LIMIT 1`);
      if (!pv.rows[0]) throw new ApiError("CONFLICT", "No draft version to submit");
      await tx.execute(sql`UPDATE profile_versions SET state = 'submitted', submitted_at = coalesce(submitted_at, now()) WHERE id = ${pv.rows[0].id}`);
      if (!p.published_version_id) await tx.execute(sql`UPDATE practitioners SET listing_status = 'submitted' WHERE id = ${practitionerId} AND listing_status IN ('draft','changes_requested','rejected')`);
      const { id } = await openCase(tx, { caseType: p.published_version_id ? "profile_change" : "listing_review", subjectType: "profile_version", subjectId: pv.rows[0].id, practitionerId, submittedByUserId: v.userId });
      return id;
    });
    revalidate(practitionerId);
    return { path: `/admin/cases/${caseId}`, notice: "Submitted for review" };
  });
}
