import { sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { ApiError } from "@/lib/api";
import { audit } from "@/lib/audit";
import type { Viewer } from "@/lib/auth/session";
import { applyStructuredContent, type StructuredContent } from "./profile-content";

/**
 * Practitioner state transitions shared by case decisions and the
 * practitioner detail page. Every function runs inside the caller's
 * transaction and writes its own audit row (ADM-03, ADM-05).
 */

function role(v: Viewer) {
  return v.grants.find((g) => g.role === "super_admin")?.role ?? v.grants.find((g) => ["verification_reviewer", "support_agent", "analyst"].includes(g.role))?.role ?? null;
}

export async function lockPractitioner(tx: Db, id: string) {
  const res = await tx.execute<{ id: string; listing_status: string; booking_eligible: boolean; owner_user_id: string | null; display_name: string; slug: string; published_version_id: string | null; published_at: Date | null }>(
    sql`SELECT id, listing_status, booking_eligible, owner_user_id, display_name, slug, published_version_id, published_at FROM practitioners WHERE id = ${id} FOR UPDATE`,
  );
  const row = res.rows[0];
  if (!row) throw new ApiError("NOT_FOUND", "Practitioner not found");
  // Capacity row, locked after the practitioner (stable order, BKG-07). Absent for never-bookable profiles.
  await tx.execute(sql`SELECT id FROM calendar_resources WHERE practitioner_id = ${id} FOR UPDATE`);
  return row;
}

export async function emitOutbox(tx: Db, aggregateType: string, aggregateId: string, eventType: string, payload: Record<string, unknown>, correlationId?: string | null) {
  await tx.execute(sql`INSERT INTO outbox_events (aggregate_type, aggregate_id, event_type, payload, correlation_id)
    VALUES (${aggregateType}, ${aggregateId}, ${eventType}, ${JSON.stringify(payload)}::jsonb, ${correlationId ?? null})`);
}

/** Resolution tasks for every future confirmed booking (VER-06, CAL-09). */
export async function openTasksForFutureBookings(tx: Db, practitionerId: string, kind: string, details: Record<string, unknown>): Promise<number> {
  const res = await tx.execute<{ id: string }>(sql`
    INSERT INTO resolution_tasks (kind, booking_id, practitioner_id, branch_id, due_at, details)
    SELECT ${kind}::resolution_task_kind, b.id, b.practitioner_id, b.branch_id, b.starts_at, ${JSON.stringify(details)}::jsonb
    FROM bookings b
    WHERE b.practitioner_id = ${practitionerId} AND b.status IN ('confirmed','requested') AND b.starts_at > now()
      AND NOT EXISTS (SELECT 1 FROM resolution_tasks t WHERE t.booking_id = b.id AND t.kind = ${kind}::resolution_task_kind AND t.state IN ('open','in_progress'))
    RETURNING id`);
  return res.rows.length;
}

export async function suspendPractitioner(tx: Db, v: Viewer, practitionerId: string, reason: string, correlationId?: string | null) {
  const p = await lockPractitioner(tx, practitionerId);
  await tx.execute(sql`UPDATE practitioners SET suspended_at = now(), suspension_reason = ${reason}, listing_status = 'suspended', booking_eligible = false WHERE id = ${practitionerId}`);
  // Release any live holds so no new reservation can commit (VER-06). Committed bookings are handled through tasks.
  await tx.execute(sql`UPDATE reservations SET state = 'released', released_reason = 'practitioner suspended' WHERE practitioner_id = ${practitionerId} AND state = 'held'`);
  const tasks = await openTasksForFutureBookings(tx, practitionerId, "future_booking_after_suspension", { reason });
  await emitOutbox(tx, "practitioner", practitionerId, "profile.suspended", { practitionerId, reason, futureBookings: tasks }, correlationId);
  await audit({ actorUserId: v.userId, actorRole: role(v), action: "practitioner.suspend", objectType: "practitioner", objectId: practitionerId, reason, changedFields: { from: p.listing_status, to: "suspended", bookingEligible: { from: p.booking_eligible, to: false }, resolutionTasks: tasks }, correlationId }, tx);
  return { tasks };
}

export async function reinstatePractitioner(tx: Db, v: Viewer, practitionerId: string, reason: string) {
  const p = await lockPractitioner(tx, practitionerId);
  const to = p.published_version_id ? "published" : "draft";
  await tx.execute(sql`UPDATE practitioners SET suspended_at = NULL, suspension_reason = NULL, listing_status = ${to}::listing_status WHERE id = ${practitionerId}`);
  await emitOutbox(tx, "practitioner", practitionerId, "profile.reinstated", { practitionerId, reason });
  await audit({ actorUserId: v.userId, actorRole: role(v), action: "practitioner.reinstate", objectType: "practitioner", objectId: practitionerId, reason, changedFields: { from: p.listing_status, to } }, tx);
}

export async function archivePractitioner(tx: Db, v: Viewer, practitionerId: string, reason: string) {
  const p = await lockPractitioner(tx, practitionerId);
  await tx.execute(sql`UPDATE practitioners SET listing_status = 'archived', booking_eligible = false WHERE id = ${practitionerId}`);
  await tx.execute(sql`UPDATE reservations SET state = 'released', released_reason = 'practitioner archived' WHERE practitioner_id = ${practitionerId} AND state = 'held'`);
  const tasks = await openTasksForFutureBookings(tx, practitionerId, "future_booking_after_suspension", { reason, archived: true });
  await emitOutbox(tx, "practitioner", practitionerId, "profile.archived", { practitionerId, reason });
  await audit({ actorUserId: v.userId, actorRole: role(v), action: "practitioner.archive", objectType: "practitioner", objectId: practitionerId, reason, changedFields: { from: p.listing_status, to: "archived", resolutionTasks: tasks } }, tx);
}

/** Approves a profile version and publishes it (PRO-03, VER-05). The previous approved version is superseded only now. */
export async function publishVersion(tx: Db, v: Viewer, versionId: string, caseId: string, reason: string) {
  const res = await tx.execute<{ id: string; practitioner_id: string; version: number; state: string; structured_content: StructuredContent }>(
    sql`SELECT id, practitioner_id, version, state, structured_content FROM profile_versions WHERE id = ${versionId} FOR UPDATE`,
  );
  const pv = res.rows[0];
  if (!pv) throw new ApiError("NOT_FOUND", "Profile version not found");
  if (pv.state === "approved" || pv.state === "superseded") throw new ApiError("CONFLICT", "This version was already decided");
  const p = await lockPractitioner(tx, pv.practitioner_id);
  if (p.listing_status === "suspended" || p.listing_status === "archived") throw new ApiError("CONFLICT", `Listing is ${p.listing_status}; reinstate it before publishing`);
  const applied = await applyStructuredContent(tx, pv.practitioner_id, pv.structured_content ?? {});
  await tx.execute(sql`UPDATE profile_versions SET state = 'superseded' WHERE practitioner_id = ${pv.practitioner_id} AND state = 'approved' AND id <> ${versionId}`);
  await tx.execute(sql`UPDATE profile_versions SET state = 'approved', decided_at = now(), decided_by_user_id = ${v.userId}, decision_reason = ${reason}, case_id = ${caseId} WHERE id = ${versionId}`);
  await tx.execute(sql`UPDATE practitioners SET published_version_id = ${versionId}, listing_status = 'published', published_at = coalesce(published_at, now()) WHERE id = ${pv.practitioner_id}`);
  await emitOutbox(tx, "practitioner", pv.practitioner_id, "profile.published", { practitionerId: pv.practitioner_id, versionId, version: pv.version, applied });
  await audit({ actorUserId: v.userId, actorRole: role(v), action: "profile.publish", objectType: "practitioner", objectId: pv.practitioner_id, reason, changedFields: { versionId, version: pv.version, applied, listingStatus: { from: p.listing_status, to: "published" } }, correlationId: caseId }, tx);
  return pv;
}

export async function rejectVersion(tx: Db, v: Viewer, versionId: string, caseId: string, decision: "rejected" | "changes_requested", reason: string, isListingReview: boolean) {
  const res = await tx.execute<{ practitioner_id: string; version: number }>(sql`SELECT practitioner_id, version FROM profile_versions WHERE id = ${versionId} FOR UPDATE`);
  const pv = res.rows[0];
  if (!pv) throw new ApiError("NOT_FOUND", "Profile version not found");
  await lockPractitioner(tx, pv.practitioner_id);
  const pvState = decision === "rejected" ? "rejected" : "draft";
  await tx.execute(sql`UPDATE profile_versions SET state = ${pvState}::profile_version_state, decided_at = now(), decided_by_user_id = ${v.userId}, decision_reason = ${reason}, case_id = ${caseId} WHERE id = ${versionId}`);
  if (isListingReview) {
    await tx.execute(sql`UPDATE practitioners SET listing_status = ${decision}::listing_status WHERE id = ${pv.practitioner_id} AND listing_status IN ('draft','submitted','changes_requested','rejected')`);
  }
  await audit({ actorUserId: v.userId, actorRole: role(v), action: `profile.${decision}`, objectType: "practitioner", objectId: pv.practitioner_id, reason, changedFields: { versionId, version: pv.version }, correlationId: caseId }, tx);
}

/** REV-03: averages from published reviews only. */
export async function recalcReviews(tx: Db, practitionerId: string) {
  await tx.execute(sql`UPDATE practitioners p SET
      review_count = s.n, rating_avg_x100 = s.avg
    FROM (SELECT count(*)::int AS n, CASE WHEN count(*) = 0 THEN NULL ELSE round(avg(rating) * 100)::int END AS avg FROM reviews WHERE practitioner_id = ${practitionerId} AND state = 'published') s
    WHERE p.id = ${practitionerId}`);
}

export type EligibilityCheck = { key: string; label: string; ok: boolean; detail?: string };

/** VER-04 checklist. Computed from authoritative rows; never from a cache. */
export async function bookingEligibilityChecklist(d: Db, practitionerId: string): Promise<EligibilityCheck[]> {
  const res = await d.execute<{
    claimed: boolean;
    contact_verified: boolean;
    published: boolean;
    active_offerings: string;
    accepted_credentials: string;
    suspended: boolean;
  }>(sql`
    SELECT
      (p.claim_state = 'claimed' AND p.owner_user_id IS NOT NULL) AS claimed,
      EXISTS (SELECT 1 FROM users u WHERE u.id = p.owner_user_id AND (u.mobile_verified_at IS NOT NULL OR u.email_verified_at IS NOT NULL)) AS contact_verified,
      (p.listing_status = 'published' AND p.published_version_id IS NOT NULL) AS published,
      (SELECT count(*) FROM offerings o JOIN practitioner_branches pb ON pb.id = o.practitioner_branch_id JOIN branches b ON b.id = o.branch_id WHERE o.practitioner_id = p.id AND o.active AND pb.state = 'approved' AND pb.active_to IS NULL AND b.status = 'published') AS active_offerings,
      (SELECT count(*) FROM credentials c JOIN credential_authorities a ON a.id = c.authority_id
         WHERE c.practitioner_id = p.id AND c.status IN ('registration_checked','document_reviewed') AND a.accepted_for_booking AND a.active
           AND (c.expires_on IS NULL OR c.expires_on >= current_date)
           AND EXISTS (
             SELECT 1 FROM policies pol WHERE pol.type = 'jurisdiction' AND pol.superseded_at IS NULL AND pol.effective_at <= now()
               AND (pol.state_id = a.jurisdiction_state_id OR (pol.state_id IS NULL AND a.jurisdiction_state_id IS NULL) OR (pol.state_id IS NULL AND NOT EXISTS (SELECT 1 FROM policies p2 WHERE p2.type = 'jurisdiction' AND p2.state_id = a.jurisdiction_state_id AND p2.superseded_at IS NULL)))
               AND (pol.content ->> 'bookingEnabled')::boolean = true
               AND (pol.content -> 'acceptedCredentialKinds') ? a.kind::text
           )) AS accepted_credentials,
      (p.suspended_at IS NOT NULL) AS suspended
    FROM practitioners p WHERE p.id = ${practitionerId}`);
  const r = res.rows[0];
  if (!r) throw new ApiError("NOT_FOUND", "Practitioner not found");
  return [
    { key: "claimed", label: "Claimed by an account", ok: r.claimed },
    { key: "contact", label: "Owner contact verified", ok: r.contact_verified },
    { key: "published", label: "Profile approved and published", ok: r.published },
    { key: "offering", label: "At least one active offering at a published branch", ok: Number(r.active_offerings) > 0, detail: `${r.active_offerings} active` },
    { key: "credential", label: "Credential accepted for booking under an enabled jurisdiction policy", ok: Number(r.accepted_credentials) > 0, detail: `${r.accepted_credentials} accepted` },
    { key: "not_suspended", label: "Not suspended", ok: !r.suspended },
  ];
}

export async function setBookingEligible(tx: Db, v: Viewer, practitionerId: string, enabled: boolean, reason: string) {
  const p = await lockPractitioner(tx, practitionerId);
  if (enabled) {
    const checks = await bookingEligibilityChecklist(tx, practitionerId);
    const failing = checks.filter((c) => !c.ok);
    if (failing.length) throw new ApiError("PROFILE_NOT_BOOKABLE", `Eligibility checks failing: ${failing.map((c) => c.label).join("; ")}`);
    await tx.execute(sql`INSERT INTO calendar_resources (practitioner_id) VALUES (${practitionerId}) ON CONFLICT (practitioner_id) DO NOTHING`);
  }
  await tx.execute(sql`UPDATE practitioners SET booking_eligible = ${enabled} WHERE id = ${practitionerId}`);
  if (!enabled) {
    await tx.execute(sql`UPDATE reservations SET state = 'released', released_reason = 'booking eligibility removed' WHERE practitioner_id = ${practitionerId} AND state = 'held'`);
  }
  await emitOutbox(tx, "practitioner", practitionerId, enabled ? "profile.booking_enabled" : "profile.booking_disabled", { practitionerId, reason });
  await audit({ actorUserId: v.userId, actorRole: role(v), action: "practitioner.booking_eligible", objectType: "practitioner", objectId: practitionerId, reason, changedFields: { from: p.booking_eligible, to: enabled } }, tx);
}

/** DIR-15 / ADM-06: keep A, fold B into it. Aliases, sources and booking references are retained. */
export async function mergePractitioners(tx: Db, v: Viewer, keepId: string, mergeId: string, reason: string, caseId?: string | null) {
  if (keepId === mergeId) throw new ApiError("INVALID_INPUT", "Cannot merge a practitioner into itself");
  // Stable lock order by id to avoid deadlocks between concurrent merges.
  const [firstId, secondId] = [keepId, mergeId].sort();
  await lockPractitioner(tx, firstId);
  await lockPractitioner(tx, secondId);
  const bRes = await tx.execute<{ slug: string; public_id: string; display_name: string; listing_status: string }>(sql`SELECT slug, public_id, display_name, listing_status FROM practitioners WHERE id = ${mergeId}`);
  const b = bRes.rows[0];
  if (b.listing_status === "archived") throw new ApiError("CONFLICT", "Practitioner B is already archived");
  const moved: Record<string, number> = {};
  const count = async (label: string, q: ReturnType<typeof sql>) => {
    const r = await tx.execute(q);
    moved[label] = r.rowCount ?? 0;
  };
  await count("branches", sql`UPDATE practitioner_branches pb SET practitioner_id = ${keepId} WHERE pb.practitioner_id = ${mergeId}
      AND NOT EXISTS (SELECT 1 FROM practitioner_branches k WHERE k.practitioner_id = ${keepId} AND k.branch_id = pb.branch_id AND k.state IN ('pending','approved') AND k.active_to IS NULL)`);
  await count("offerings", sql`UPDATE offerings o SET practitioner_id = ${keepId} WHERE o.practitioner_id = ${mergeId} AND EXISTS (SELECT 1 FROM practitioner_branches pb WHERE pb.id = o.practitioner_branch_id AND pb.practitioner_id = ${keepId})`);
  await count("credentials", sql`UPDATE credentials c SET practitioner_id = ${keepId} WHERE c.practitioner_id = ${mergeId}
      AND NOT EXISTS (SELECT 1 FROM credentials k WHERE k.practitioner_id = ${keepId} AND k.authority_id = c.authority_id AND k.type = c.type AND k.number_normalised IS NOT DISTINCT FROM c.number_normalised)`);
  await count("reservations", sql`UPDATE reservations SET practitioner_id = ${keepId} WHERE practitioner_id = ${mergeId}`);
  await count("bookings", sql`UPDATE bookings SET practitioner_id = ${keepId} WHERE practitioner_id = ${mergeId}`);
  await count("reviews", sql`UPDATE reviews SET practitioner_id = ${keepId} WHERE practitioner_id = ${mergeId}`);
  await count("enquiries", sql`UPDATE enquiries SET practitioner_id = ${keepId} WHERE practitioner_id = ${mergeId}`);
  await tx.execute(sql`INSERT INTO practitioner_slug_history (practitioner_id, slug) VALUES (${keepId}, ${b.slug})`);
  await tx.execute(sql`INSERT INTO practitioner_slug_history (practitioner_id, slug) SELECT ${keepId}, slug FROM practitioner_slug_history WHERE practitioner_id = ${mergeId}`);
  await tx.execute(sql`UPDATE practitioners SET listing_status = 'archived', booking_eligible = false WHERE id = ${mergeId}`);
  await tx.execute(sql`UPDATE duplicate_candidates SET resolved = true WHERE (practitioner_a_id = ${keepId} AND practitioner_b_id = ${mergeId}) OR (practitioner_a_id = ${mergeId} AND practitioner_b_id = ${keepId})`);
  await recalcReviews(tx, keepId);
  await emitOutbox(tx, "practitioner", keepId, "profile.merged", { keepId, mergedId: mergeId, mergedPublicId: b.public_id, moved }, caseId);
  await audit({ actorUserId: v.userId, actorRole: role(v), action: "practitioner.merge", objectType: "practitioner", objectId: keepId, reason, changedFields: { keepId, mergedId: mergeId, mergedPublicId: b.public_id, mergedSlug: b.slug, moved }, correlationId: caseId }, tx);
  await audit({ actorUserId: v.userId, actorRole: role(v), action: "practitioner.merged_into", objectType: "practitioner", objectId: mergeId, reason, changedFields: { keepId, mergedId: mergeId }, correlationId: caseId }, tx);
  return moved;
}

export { role as actorRole };
