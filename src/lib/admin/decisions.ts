import { sql } from "drizzle-orm";
import { withTransaction, type Db } from "@/db/client";
import { ApiError } from "@/lib/api";
import { audit } from "@/lib/audit";
import { hasRole, type Viewer } from "@/lib/auth/session";
import { kickDispatch } from "@/lib/messaging/kick";
import { slugify, normaliseAlias } from "@/lib/slug";
import { textArray } from "@/lib/sql";
import {
  actorRole,
  emitOutbox,
  lockPractitioner,
  mergePractitioners,
  openTasksForFutureBookings,
  publishVersion,
  recalcReviews,
  rejectVersion,
  suspendPractitioner,
} from "./practitioner-ops";

/**
 * Case decisions and their side effects (ADM-02, ADM-03). One transaction
 * per decision: lock the case, apply the subject change, record the decision,
 * append a case event and an audit row. Prior evidence and actor are never
 * overwritten (ADM-03): a decided case cannot be decided again.
 */

export type Decision = "approved" | "rejected" | "changes_requested" | "suspended" | "dismissed" | "merged" | "reinstated";

export type DecisionInput = {
  caseId: string;
  decision: Decision;
  reason: string;
  evidenceRef?: string;
  /** credential_check extras (VER-02). */
  credentialStatus?: string;
  method?: string;
  scopeOfCheck?: string;
  nextReviewAt?: string;
  publicNumberApproved?: boolean;
  /** locality_proposal: reuse an existing locality instead of creating one. */
  resolvedLocalityId?: string;
  /** duplicate_candidate: which record to keep. */
  keep?: "a" | "b";
};

type CaseRow = {
  id: string;
  case_type: string;
  subject_type: string;
  subject_id: string;
  practitioner_id: string | null;
  state: string;
  submitted_by_user_id: string | null;
  evidence: Record<string, unknown>;
  first_response_at: Date | null;
};

const REVIEWER_TYPES = new Set(["listing_review", "profile_change", "claim", "credential_check", "offer_review", "review_moderation", "locality_proposal", "duplicate_candidate"]);
const SUPPORT_TYPES = new Set(["complaint", "correction_request", "credential_fraud"]);

export function canDecide(v: Viewer, caseType: string, decision: Decision): boolean {
  if (hasRole(v, "super_admin")) return true;
  if (decision === "suspended" || decision === "merged") return false; // super_admin only
  if (caseType === "ownership_transfer" || caseType === "role_escalation") return false;
  if (REVIEWER_TYPES.has(caseType)) return hasRole(v, "verification_reviewer");
  if (SUPPORT_TYPES.has(caseType)) return hasRole(v, "support_agent") || hasRole(v, "verification_reviewer");
  return false;
}

/** Case types whose outcome the submitting practitioner is told about (Section 13, verification decision). */
const APPLICANT_NOTICE: Record<string, string> = {
  listing_review: "your new listing",
  profile_change: "your profile change",
  claim: "your profile claim",
  credential_check: "your registration check",
  offer_review: "your offer",
};

async function notifyApplicant(tx: Db, c: CaseRow, input: DecisionInput) {
  const subjectLabel = APPLICANT_NOTICE[c.case_type];
  if (!subjectLabel || !["approved", "rejected", "changes_requested"].includes(input.decision)) return;
  const owner = c.practitioner_id ? (await tx.execute<{ owner_user_id: string | null }>(sql`SELECT owner_user_id FROM practitioners WHERE id = ${c.practitioner_id}`)).rows[0]?.owner_user_id : null;
  const recipientUserId = c.submitted_by_user_id ?? owner ?? null;
  if (!recipientUserId) return;
  await emitOutbox(tx, "verification_case", c.id, "verification.decided", { caseId: c.id, caseType: c.case_type, decision: input.decision, reason: input.reason, subjectLabel, recipientUserId }, c.id);
  kickDispatch();
}

export async function decideCase(v: Viewer, input: DecisionInput): Promise<string> {
  return withTransaction(async (_client, tx) => {
    const res = await tx.execute<CaseRow>(sql`SELECT id, case_type, subject_type, subject_id, practitioner_id, state, submitted_by_user_id, evidence, first_response_at FROM verification_cases WHERE id = ${input.caseId} FOR UPDATE`);
    const c = res.rows[0];
    if (!c) throw new ApiError("NOT_FOUND", "Case not found");
    if (c.state === "decided" || c.state === "closed") throw new ApiError("CONFLICT", "This case has already been decided; open a new case to change the outcome");
    if (!canDecide(v, c.case_type, input.decision)) throw new ApiError("UNAUTHORISED", "Your role cannot record this decision");

    let message = "";
    const extra: Record<string, unknown> = {};
    switch (c.case_type) {
      case "listing_review":
      case "profile_change":
        message = await decideProfile(tx, v, c, input);
        break;
      case "claim":
        message = await decideClaim(tx, v, c, input);
        break;
      case "credential_check":
        message = await decideCredential(tx, v, c, input, extra);
        break;
      case "duplicate_candidate":
        message = await decideDuplicate(tx, v, c, input);
        break;
      case "offer_review":
        message = await decideOffer(tx, v, c, input);
        break;
      case "review_moderation":
        message = await decideReview(tx, v, c, input);
        break;
      case "complaint":
      case "correction_request":
      case "credential_fraud":
        message = await decideComplaint(tx, v, c, input);
        break;
      case "locality_proposal":
        message = await decideLocality(tx, v, c, input);
        break;
      case "ownership_transfer":
        message = await decideOwnership(tx, v, c, input);
        break;
      case "role_escalation":
        message = await decideRoleEscalation(tx, v, c, input);
        break;
      default:
        throw new ApiError("INVALID_INPUT", `Unsupported case type ${c.case_type}`);
    }

    const newState = input.decision === "changes_requested" ? "awaiting_evidence" : "decided";
    const evidencePatch: Record<string, unknown> = { ...(input.evidenceRef ? { decisionEvidenceRef: input.evidenceRef } : {}), ...extra };
    await tx.execute(sql`UPDATE verification_cases SET
        state = ${newState}::case_state, decision = ${input.decision}::case_decision, decision_reason = ${input.reason}, decided_at = now(), decided_by_user_id = ${v.userId},
        first_response_at = coalesce(first_response_at, now()), method = coalesce(${input.method ?? null}, method), checked_at = CASE WHEN ${Boolean(input.credentialStatus)} THEN now() ELSE checked_at END,
        next_review_at = coalesce(${input.nextReviewAt ?? null}::timestamptz, next_review_at), evidence = evidence || ${JSON.stringify(evidencePatch)}::jsonb,
        second_approver_user_id = CASE WHEN case_type IN ('ownership_transfer','role_escalation') THEN ${v.userId} ELSE second_approver_user_id END
      WHERE id = ${c.id}`);
    await tx.execute(sql`INSERT INTO case_events (case_id, actor_user_id, event_type, payload) VALUES (${c.id}, ${v.userId}, 'decision', ${JSON.stringify({ decision: input.decision, reason: input.reason, evidenceRef: input.evidenceRef ?? null, message })}::jsonb)`);
    await audit({ actorUserId: v.userId, actorRole: actorRole(v), action: `case.${input.decision}`, objectType: "verification_case", objectId: c.id, reason: input.reason, changedFields: { caseType: c.case_type, subjectType: c.subject_type, subjectId: c.subject_id, evidenceRef: input.evidenceRef ?? null }, correlationId: c.id }, tx);
    await notifyApplicant(tx, c, input);
    return message || `Decision recorded: ${input.decision.replace("_", " ")}`;
  });
}

async function resolveVersionId(tx: Db, c: CaseRow): Promise<string> {
  if (c.subject_type === "profile_version") return c.subject_id;
  // Older cases may point at the practitioner; take the latest submitted draft.
  const res = await tx.execute<{ id: string }>(sql`SELECT id FROM profile_versions WHERE practitioner_id = ${c.practitioner_id ?? c.subject_id} AND state IN ('submitted','draft') ORDER BY version DESC LIMIT 1`);
  if (!res.rows[0]) throw new ApiError("NOT_FOUND", "No submitted profile version for this case");
  return res.rows[0].id;
}

async function decideProfile(tx: Db, v: Viewer, c: CaseRow, input: DecisionInput): Promise<string> {
  const versionId = await resolveVersionId(tx, c);
  const isListing = c.case_type === "listing_review";
  switch (input.decision) {
    case "approved": {
      const pv = await publishVersion(tx, v, versionId, c.id, input.reason);
      if (isListing) {
        // The clinics shown in the case are part of what the reviewer approved: a first
        // publication with every association still pending would list nowhere (LOC-02).
        const assoc = await tx.execute(sql`UPDATE practitioner_branches SET state = 'approved', approved_by_user_id = ${v.userId}
          WHERE practitioner_id = ${pv.practitioner_id} AND state = 'pending' AND active_to IS NULL RETURNING id`);
        if (assoc.rowCount) {
          await audit({ actorUserId: v.userId, actorRole: actorRole(v), action: "practitioner.branch.approve", objectType: "practitioner", objectId: pv.practitioner_id, reason: input.reason, changedFields: { associations: assoc.rows.map((r) => (r as { id: string }).id), via: "listing_review" }, correlationId: c.id }, tx);
          return `Version ${pv.version} approved and published; ${assoc.rowCount} clinic association(s) approved`;
        }
      }
      return `Version ${pv.version} approved and published`;
    }
    case "rejected":
    case "changes_requested":
      await rejectVersion(tx, v, versionId, c.id, input.decision, input.reason, isListing);
      return input.decision === "rejected" ? "Submission rejected" : "Changes requested; the practitioner can edit and resubmit";
    case "suspended": {
      const pid = c.practitioner_id ?? (await tx.execute<{ practitioner_id: string }>(sql`SELECT practitioner_id FROM profile_versions WHERE id = ${versionId}`)).rows[0].practitioner_id;
      await suspendPractitioner(tx, v, pid, input.reason, c.id);
      return "Listing suspended";
    }
    default:
      throw new ApiError("INVALID_INPUT", "Choose approve, reject, request changes or suspend");
  }
}

async function decideClaim(tx: Db, v: Viewer, c: CaseRow, input: DecisionInput): Promise<string> {
  const res = await tx.execute<{ id: string; practitioner_id: string; claimant_user_id: string; state: string }>(sql`SELECT id, practitioner_id, claimant_user_id, state FROM claim_requests WHERE id = ${c.subject_id} FOR UPDATE`);
  const cr = res.rows[0];
  if (!cr) throw new ApiError("NOT_FOUND", "Claim request not found");
  if (["approved", "rejected", "withdrawn"].includes(cr.state)) throw new ApiError("CONFLICT", `Claim already ${cr.state}`);
  const p = await lockPractitioner(tx, cr.practitioner_id);
  switch (input.decision) {
    case "approved": {
      if (p.owner_user_id && p.owner_user_id !== cr.claimant_user_id) throw new ApiError("CONFLICT", "Listing is already claimed; use an ownership transfer instead (PRO-06)");
      await tx.execute(sql`UPDATE claim_requests SET state = 'approved', reviewer_user_id = ${v.userId}, decision_reason = ${input.reason}, decided_at = now(), case_id = ${c.id} WHERE id = ${cr.id}`);
      await tx.execute(sql`UPDATE practitioners SET owner_user_id = ${cr.claimant_user_id}, claim_state = 'claimed' WHERE id = ${cr.practitioner_id}`);
      await tx.execute(sql`INSERT INTO role_assignments (user_id, role, scope_type, scope_id, granted_by_user_id, reason)
        VALUES (${cr.claimant_user_id}, 'practitioner', 'practitioner', ${cr.practitioner_id}, ${v.userId}, ${"claim approved: " + input.reason}) ON CONFLICT DO NOTHING`);
      const competing = await tx.execute(sql`UPDATE claim_requests SET state = 'rejected', reviewer_user_id = ${v.userId}, decision_reason = 'competing claim resolved', decided_at = now()
        WHERE practitioner_id = ${cr.practitioner_id} AND id <> ${cr.id} AND state IN ('requested','evidence_requested','under_review') RETURNING id, case_id`);
      for (const row of competing.rows as { id: string; case_id: string | null }[]) {
        if (row.case_id) {
          await tx.execute(sql`UPDATE verification_cases SET state = 'decided', decision = 'rejected', decision_reason = 'competing claim resolved', decided_at = now(), decided_by_user_id = ${v.userId} WHERE id = ${row.case_id} AND state <> 'decided'`);
          await tx.execute(sql`INSERT INTO case_events (case_id, actor_user_id, event_type, payload) VALUES (${row.case_id}, ${v.userId}, 'decision', ${JSON.stringify({ decision: "rejected", reason: "competing claim resolved", resolvedBy: c.id })}::jsonb)`);
        }
      }
      await emitOutbox(tx, "practitioner", cr.practitioner_id, "profile.claimed", { practitionerId: cr.practitioner_id, ownerUserId: cr.claimant_user_id }, c.id);
      await audit({ actorUserId: v.userId, actorRole: actorRole(v), action: "claim.approve", objectType: "practitioner", objectId: cr.practitioner_id, reason: input.reason, changedFields: { ownerUserId: { from: p.owner_user_id, to: cr.claimant_user_id }, competingRejected: competing.rows.length }, correlationId: c.id }, tx);
      return `Claim approved; ${competing.rows.length} competing claim(s) closed`;
    }
    case "rejected":
      await tx.execute(sql`UPDATE claim_requests SET state = 'rejected', reviewer_user_id = ${v.userId}, decision_reason = ${input.reason}, decided_at = now(), case_id = ${c.id} WHERE id = ${cr.id}`);
      await audit({ actorUserId: v.userId, actorRole: actorRole(v), action: "claim.reject", objectType: "claim_request", objectId: cr.id, reason: input.reason, correlationId: c.id }, tx);
      return "Claim rejected";
    case "changes_requested":
      await tx.execute(sql`UPDATE claim_requests SET state = 'evidence_requested', reviewer_user_id = ${v.userId}, decision_reason = ${input.reason}, case_id = ${c.id} WHERE id = ${cr.id}`);
      await audit({ actorUserId: v.userId, actorRole: actorRole(v), action: "claim.request_evidence", objectType: "claim_request", objectId: cr.id, reason: input.reason, correlationId: c.id }, tx);
      return "Evidence requested from the claimant";
    default:
      throw new ApiError("INVALID_INPUT", "Choose approve, reject or request evidence");
  }
}

const CREDENTIAL_STATUSES = ["pending", "document_reviewed", "registration_checked", "unverifiable", "expired", "suspended", "revoked"];

async function decideCredential(tx: Db, v: Viewer, c: CaseRow, input: DecisionInput, extra: Record<string, unknown>): Promise<string> {
  const res = await tx.execute<{ id: string; practitioner_id: string; type: string; status: string }>(sql`SELECT id, practitioner_id, type, status FROM credentials WHERE id = ${c.subject_id} FOR UPDATE`);
  const cred = res.rows[0];
  if (!cred) throw new ApiError("NOT_FOUND", "Credential not found");
  const status = input.credentialStatus ?? (input.decision === "approved" ? "document_reviewed" : input.decision === "rejected" ? "unverifiable" : input.decision === "suspended" ? "suspended" : undefined);
  if (input.decision === "changes_requested") {
    await tx.execute(sql`UPDATE credentials SET status = 'pending' WHERE id = ${cred.id}`);
    return "Further evidence requested";
  }
  if (!status || !CREDENTIAL_STATUSES.includes(status)) throw new ApiError("INVALID_INPUT", "Choose the resulting credential status");
  if (input.decision === "approved" && !["registration_checked", "document_reviewed"].includes(status)) throw new ApiError("INVALID_INPUT", "Approval must set registration_checked or document_reviewed");
  if (!input.method) throw new ApiError("INVALID_INPUT", "Record the verification method (VER-02)");
  await lockPractitioner(tx, cred.practitioner_id);
  await tx.execute(sql`UPDATE credentials SET status = ${status}::credential_status, scope_of_check = ${input.scopeOfCheck ?? null}, last_checked_at = now(),
      next_review_at = ${input.nextReviewAt ?? null}::timestamptz, public_number_approved = ${Boolean(input.publicNumberApproved) && status === "registration_checked"}, source = coalesce(source, 'reviewer')
    WHERE id = ${cred.id}`);
  extra.method = input.method;
  extra.scopeOfCheck = input.scopeOfCheck ?? null;
  extra.credentialStatus = { from: cred.status, to: status };
  let note = "";
  if (["expired", "suspended", "revoked"].includes(status) && cred.type === "statutory_registration") {
    await tx.execute(sql`UPDATE practitioners SET booking_eligible = false WHERE id = ${cred.practitioner_id}`);
    await tx.execute(sql`UPDATE reservations SET state = 'released', released_reason = 'credential restricted' WHERE practitioner_id = ${cred.practitioner_id} AND state = 'held'`);
    const tasks = await openTasksForFutureBookings(tx, cred.practitioner_id, "credential_expired", { credentialId: cred.id, status, reason: input.reason });
    await emitOutbox(tx, "practitioner", cred.practitioner_id, "profile.booking_disabled", { practitionerId: cred.practitioner_id, cause: `credential_${status}` }, c.id);
    note = `; booking eligibility removed, ${tasks} future booking task(s) opened (VER-06)`;
  }
  await audit({ actorUserId: v.userId, actorRole: actorRole(v), action: "credential.decide", objectType: "credential", objectId: cred.id, reason: input.reason, changedFields: { status: { from: cred.status, to: status }, method: input.method, scopeOfCheck: input.scopeOfCheck ?? null, nextReviewAt: input.nextReviewAt ?? null, publicNumberApproved: Boolean(input.publicNumberApproved) }, correlationId: c.id }, tx);
  return `Credential marked ${status.replace("_", " ")}${note}`;
}

async function decideDuplicate(tx: Db, v: Viewer, c: CaseRow, input: DecisionInput): Promise<string> {
  const res = await tx.execute<{ id: string; practitioner_a_id: string; practitioner_b_id: string; resolved: boolean }>(sql`SELECT id, practitioner_a_id, practitioner_b_id, resolved FROM duplicate_candidates WHERE id = ${c.subject_id} FOR UPDATE`);
  const dc = res.rows[0];
  if (!dc) throw new ApiError("NOT_FOUND", "Duplicate candidate not found");
  if (input.decision === "merged") {
    if (!hasRole(v, "super_admin")) throw new ApiError("UNAUTHORISED", "Merging requires a super administrator");
    const keep = input.keep === "b" ? dc.practitioner_b_id : dc.practitioner_a_id;
    const merge = input.keep === "b" ? dc.practitioner_a_id : dc.practitioner_b_id;
    const moved = await mergePractitioners(tx, v, keep, merge, input.reason, c.id);
    return `Merged. Moved: ${Object.entries(moved).map(([k, n]) => `${n} ${k}`).join(", ")}`;
  }
  if (input.decision === "dismissed" || input.decision === "rejected") {
    await tx.execute(sql`UPDATE duplicate_candidates SET resolved = true WHERE id = ${dc.id}`);
    await audit({ actorUserId: v.userId, actorRole: actorRole(v), action: "duplicate.dismiss", objectType: "duplicate_candidate", objectId: dc.id, reason: input.reason, correlationId: c.id }, tx);
    return "Recorded as not a duplicate";
  }
  throw new ApiError("INVALID_INPUT", "Choose merge or not a duplicate");
}

async function decideOffer(tx: Db, v: Viewer, c: CaseRow, input: DecisionInput): Promise<string> {
  const res = await tx.execute<{ id: string; offer_id: string; starts_at: Date; ends_at: Date; moderation_state: string }>(sql`SELECT id, offer_id, starts_at, ends_at, moderation_state FROM offer_versions WHERE id = ${c.subject_id} FOR UPDATE`);
  const ov = res.rows[0];
  if (!ov) throw new ApiError("NOT_FOUND", "Offer version not found");
  await tx.execute(sql`SELECT id FROM offers WHERE id = ${ov.offer_id} FOR UPDATE`);
  if (input.decision === "approved") {
    const now = Date.now();
    const state = new Date(ov.starts_at).getTime() <= now && new Date(ov.ends_at).getTime() > now ? "active" : new Date(ov.ends_at).getTime() <= now ? "expired" : "approved";
    await tx.execute(sql`UPDATE offer_versions SET moderation_state = 'approved', moderated_by_user_id = ${v.userId}, moderation_reason = ${input.reason}, moderated_at = now() WHERE id = ${ov.id}`);
    await tx.execute(sql`UPDATE offers SET state = ${state}::offer_state, current_version_id = ${ov.id} WHERE id = ${ov.offer_id}`);
    await audit({ actorUserId: v.userId, actorRole: actorRole(v), action: "offer.approve", objectType: "offer", objectId: ov.offer_id, reason: input.reason, changedFields: { versionId: ov.id, state }, correlationId: c.id }, tx);
    return `Offer approved (${state})`;
  }
  if (input.decision === "rejected" || input.decision === "changes_requested") {
    const ms = input.decision === "rejected" ? "rejected" : "pending";
    await tx.execute(sql`UPDATE offer_versions SET moderation_state = ${ms}::moderation_state, moderated_by_user_id = ${v.userId}, moderation_reason = ${input.reason}, moderated_at = now() WHERE id = ${ov.id}`);
    if (input.decision === "rejected") await tx.execute(sql`UPDATE offers SET state = 'rejected' WHERE id = ${ov.offer_id} AND current_version_id IS NULL`);
    await audit({ actorUserId: v.userId, actorRole: actorRole(v), action: `offer.${input.decision}`, objectType: "offer", objectId: ov.offer_id, reason: input.reason, changedFields: { versionId: ov.id }, correlationId: c.id }, tx);
    return input.decision === "rejected" ? "Offer rejected" : "Changes requested on the offer";
  }
  if (input.decision === "suspended") {
    await tx.execute(sql`UPDATE offers SET state = 'suspended' WHERE id = ${ov.offer_id}`);
    await audit({ actorUserId: v.userId, actorRole: actorRole(v), action: "offer.suspend", objectType: "offer", objectId: ov.offer_id, reason: input.reason, correlationId: c.id }, tx);
    return "Offer suspended";
  }
  throw new ApiError("INVALID_INPUT", "Choose approve, reject, request changes or suspend");
}

async function decideReview(tx: Db, v: Viewer, c: CaseRow, input: DecisionInput): Promise<string> {
  if (c.subject_type === "review_reply") return decideReply(tx, v, c, input);
  const res = await tx.execute<{ id: string; practitioner_id: string; state: string }>(sql`SELECT id, practitioner_id, state FROM reviews WHERE id = ${c.subject_id} FOR UPDATE`);
  const r = res.rows[0];
  if (!r) throw new ApiError("NOT_FOUND", "Review not found");
  if (r.state === "withdrawn") throw new ApiError("CONFLICT", "The author withdrew this review; dismiss the case instead");
  let to: string;
  if (input.decision === "approved") to = "published";
  else if (input.decision === "rejected") to = "rejected";
  else throw new ApiError("INVALID_INPUT", "Choose publish (approve) or reject");
  await tx.execute(sql`UPDATE reviews SET state = ${to}::review_state, moderation_reason = ${input.reason}, moderated_by_user_id = ${v.userId}, published_at = CASE WHEN ${to} = 'published' THEN coalesce(published_at, now()) ELSE published_at END WHERE id = ${r.id}`);
  await recalcReviews(tx, r.practitioner_id);
  await audit({ actorUserId: v.userId, actorRole: actorRole(v), action: `review.${to}`, objectType: "review", objectId: r.id, reason: input.reason, changedFields: { state: { from: r.state, to } }, correlationId: c.id }, tx);
  return to === "published" ? "Review published; averages recalculated" : "Review rejected; the submitter sees the reason";
}

/** REV-03: provider replies are moderated too; the profile shows the latest approved version. */
async function decideReply(tx: Db, v: Viewer, c: CaseRow, input: DecisionInput): Promise<string> {
  const res = await tx.execute<{ id: string; state: string }>(sql`SELECT id, state::text AS state FROM review_replies WHERE id = ${c.subject_id} FOR UPDATE`);
  const rr = res.rows[0];
  if (!rr) throw new ApiError("NOT_FOUND", "Reply not found");
  let to: "approved" | "rejected";
  if (input.decision === "approved") to = "approved";
  else if (input.decision === "rejected") to = "rejected";
  else throw new ApiError("INVALID_INPUT", "Choose publish (approve) or reject");
  await tx.execute(sql`UPDATE review_replies SET state = ${to}::moderation_state, moderation_reason = ${input.reason} WHERE id = ${rr.id}`);
  await audit({ actorUserId: v.userId, actorRole: actorRole(v), action: `review_reply.${to}`, objectType: "review_reply", objectId: rr.id, reason: input.reason, changedFields: { state: { from: rr.state, to } }, correlationId: c.id }, tx);
  return to === "approved" ? "Reply published on the profile" : "Reply rejected; the practitioner sees the reason";
}

async function decideComplaint(tx: Db, v: Viewer, c: CaseRow, input: DecisionInput): Promise<string> {
  const pid = c.practitioner_id ?? (c.subject_type === "practitioner" ? c.subject_id : null);
  if (input.decision === "suspended") {
    if (!pid) throw new ApiError("INVALID_INPUT", "This case has no practitioner to suspend");
    await suspendPractitioner(tx, v, pid, input.reason, c.id);
    return "Practitioner suspended; future bookings have resolution tasks";
  }
  if (input.decision === "approved") return c.case_type === "correction_request" ? "Correction accepted; apply the change on the practitioner page" : "Complaint upheld";
  if (input.decision === "rejected" || input.decision === "dismissed") return c.case_type === "correction_request" ? "Correction declined" : "Complaint dismissed";
  if (input.decision === "changes_requested") return "More information requested";
  throw new ApiError("INVALID_INPUT", "Choose uphold, dismiss, request information or suspend");
}

async function decideLocality(tx: Db, v: Viewer, c: CaseRow, input: DecisionInput): Promise<string> {
  const res = await tx.execute<{ id: string; city_id: string; proposed_name: string; proposed_pin_code: string | null; branch_id: string | null; state: string }>(sql`SELECT id, city_id, proposed_name, proposed_pin_code, branch_id, state FROM locality_proposals WHERE id = ${c.subject_id} FOR UPDATE`);
  const lp = res.rows[0];
  if (!lp) throw new ApiError("NOT_FOUND", "Locality proposal not found");
  if (lp.state !== "pending") throw new ApiError("CONFLICT", `Proposal already ${lp.state}`);
  if (input.decision === "approved") {
    let localityId = input.resolvedLocalityId ?? null;
    let created = false;
    if (!localityId) {
      const slug = slugify(lp.proposed_name);
      const existing = await tx.execute<{ id: string }>(sql`SELECT id FROM localities WHERE city_id = ${lp.city_id} AND slug = ${slug}`);
      if (existing.rows[0]) localityId = existing.rows[0].id;
      else {
        const ins = await tx.execute<{ id: string }>(sql`INSERT INTO localities (city_id, name, slug, status, pin_codes) VALUES (${lp.city_id}, ${lp.proposed_name}, ${slug}, 'active', ${textArray(lp.proposed_pin_code ? [lp.proposed_pin_code] : [])}) RETURNING id`);
        localityId = ins.rows[0].id;
        created = true;
      }
    }
    // The proposed spelling becomes an alias of the canonical record (DIR-08).
    await tx.execute(sql`INSERT INTO geo_aliases (target_type, target_id, alias, alias_normalised, kind) VALUES ('locality', ${localityId}, ${lp.proposed_name}, ${normaliseAlias(lp.proposed_name)}, 'spelling') ON CONFLICT DO NOTHING`);
    if (lp.branch_id) await tx.execute(sql`UPDATE branches SET locality_id = ${localityId} WHERE id = ${lp.branch_id}`);
    await tx.execute(sql`UPDATE locality_proposals SET state = ${created ? "approved" : "merged"}::proposal_state, resolved_locality_id = ${localityId}, reviewer_user_id = ${v.userId}, decision_reason = ${input.reason}, decided_at = now() WHERE id = ${lp.id}`);
    await audit({ actorUserId: v.userId, actorRole: actorRole(v), action: "locality.approve_proposal", objectType: "locality", objectId: localityId, reason: input.reason, changedFields: { proposalId: lp.id, created, branchId: lp.branch_id }, correlationId: c.id }, tx);
    return created ? "Locality created and branch updated" : "Mapped to an existing locality; alias recorded";
  }
  if (input.decision === "rejected") {
    await tx.execute(sql`UPDATE locality_proposals SET state = 'rejected', reviewer_user_id = ${v.userId}, decision_reason = ${input.reason}, decided_at = now() WHERE id = ${lp.id}`);
    await audit({ actorUserId: v.userId, actorRole: actorRole(v), action: "locality.reject_proposal", objectType: "locality_proposal", objectId: lp.id, reason: input.reason, correlationId: c.id }, tx);
    return "Proposal rejected";
  }
  throw new ApiError("INVALID_INPUT", "Choose approve or reject");
}

/** IAM-03: second administrator approves; requester cannot approve their own change. */
function requireSecondAdmin(v: Viewer, c: CaseRow) {
  if (!hasRole(v, "super_admin")) throw new ApiError("UNAUTHORISED", "Only a super administrator can approve this");
  if (c.submitted_by_user_id === v.userId) throw new ApiError("UNAUTHORISED", "The requester cannot approve their own change (IAM-03)");
}

async function decideOwnership(tx: Db, v: Viewer, c: CaseRow, input: DecisionInput): Promise<string> {
  requireSecondAdmin(v, c);
  const pid = c.practitioner_id ?? c.subject_id;
  const newOwner = String(c.evidence.newOwnerUserId ?? "");
  if (input.decision === "approved") {
    if (!newOwner) throw new ApiError("INVALID_INPUT", "Case is missing the new owner");
    const p = await lockPractitioner(tx, pid);
    if (p.owner_user_id) {
      await tx.execute(sql`UPDATE role_assignments SET revoked_at = now(), revoked_by_user_id = ${v.userId} WHERE user_id = ${p.owner_user_id} AND role = 'practitioner' AND scope_type = 'practitioner' AND scope_id = ${pid} AND revoked_at IS NULL`);
    }
    await tx.execute(sql`UPDATE practitioners SET owner_user_id = ${newOwner}, claim_state = 'claimed' WHERE id = ${pid}`);
    await tx.execute(sql`INSERT INTO role_assignments (user_id, role, scope_type, scope_id, granted_by_user_id, reason) VALUES (${newOwner}, 'practitioner', 'practitioner', ${pid}, ${v.userId}, ${"ownership transfer: " + input.reason}) ON CONFLICT DO NOTHING`);
    await emitOutbox(tx, "practitioner", pid, "profile.owner_changed", { practitionerId: pid, from: p.owner_user_id, to: newOwner }, c.id);
    await audit({ actorUserId: v.userId, actorRole: actorRole(v), action: "practitioner.transfer_ownership", objectType: "practitioner", objectId: pid, reason: input.reason, changedFields: { ownerUserId: { from: p.owner_user_id, to: newOwner }, requestedBy: c.submitted_by_user_id, approvedBy: v.userId }, correlationId: c.id }, tx);
    return "Ownership transferred";
  }
  if (input.decision === "rejected") return "Ownership transfer declined";
  throw new ApiError("INVALID_INPUT", "Choose approve or reject");
}

async function decideRoleEscalation(tx: Db, v: Viewer, c: CaseRow, input: DecisionInput): Promise<string> {
  requireSecondAdmin(v, c);
  const userId = c.subject_id;
  const role = String(c.evidence.role ?? "");
  if (input.decision === "approved") {
    if (!["verification_reviewer", "support_agent", "analyst", "super_admin"].includes(role)) throw new ApiError("INVALID_INPUT", "Case is missing a valid role");
    await tx.execute(sql`INSERT INTO role_assignments (user_id, role, scope_type, granted_by_user_id, reason) VALUES (${userId}, ${role}::role_name, 'global', ${v.userId}, ${input.reason}) ON CONFLICT DO NOTHING`);
    await tx.execute(sql`UPDATE auth."user" SET kind = 'staff' WHERE id::text = (SELECT auth_subject FROM users WHERE id = ${userId})`);
    await audit({ actorUserId: v.userId, actorRole: actorRole(v), action: "staff.grant_role", objectType: "user", objectId: userId, reason: input.reason, changedFields: { role, requestedBy: c.submitted_by_user_id, approvedBy: v.userId }, correlationId: c.id }, tx);
    return `Role ${role} granted`;
  }
  if (input.decision === "rejected") return "Role escalation declined";
  throw new ApiError("INVALID_INPUT", "Choose approve or reject");
}

/** Assignment and state changes that are not decisions. */
export async function assignCase(v: Viewer, caseId: string, assigneeUserId: string | null): Promise<void> {
  await withTransaction(async (_c, tx) => {
    const res = await tx.execute<{ state: string; assignee_user_id: string | null }>(sql`SELECT state, assignee_user_id FROM verification_cases WHERE id = ${caseId} FOR UPDATE`);
    const c = res.rows[0];
    if (!c) throw new ApiError("NOT_FOUND", "Case not found");
    if (c.state === "decided" || c.state === "closed") throw new ApiError("CONFLICT", "Case is already decided");
    await tx.execute(sql`UPDATE verification_cases SET assignee_user_id = ${assigneeUserId}, state = CASE WHEN state = 'open' AND ${assigneeUserId}::uuid IS NOT NULL THEN 'in_review'::case_state ELSE state END, first_response_at = coalesce(first_response_at, now()) WHERE id = ${caseId}`);
    await tx.execute(sql`INSERT INTO case_events (case_id, actor_user_id, event_type, payload) VALUES (${caseId}, ${v.userId}, ${assigneeUserId ? "assigned" : "unassigned"}, ${JSON.stringify({ assigneeUserId })}::jsonb)`);
    await audit({ actorUserId: v.userId, actorRole: actorRole(v), action: "case.assign", objectType: "verification_case", objectId: caseId, changedFields: { assigneeUserId: { from: c.assignee_user_id, to: assigneeUserId } } }, tx);
  });
}

export async function setCasePriority(v: Viewer, caseId: string, priority: string): Promise<void> {
  await withTransaction(async (_c, tx) => {
    await tx.execute(sql`UPDATE verification_cases SET priority = ${priority}::priority WHERE id = ${caseId} AND state NOT IN ('decided','closed')`);
    await tx.execute(sql`INSERT INTO case_events (case_id, actor_user_id, event_type, payload) VALUES (${caseId}, ${v.userId}, 'priority', ${JSON.stringify({ priority })}::jsonb)`);
    await audit({ actorUserId: v.userId, actorRole: actorRole(v), action: "case.priority", objectType: "verification_case", objectId: caseId, changedFields: { priority } }, tx);
  });
}

export async function addCaseNote(v: Viewer, caseId: string, note: string): Promise<void> {
  await withTransaction(async (_c, tx) => {
    await tx.execute(sql`INSERT INTO case_events (case_id, actor_user_id, event_type, payload) VALUES (${caseId}, ${v.userId}, 'note', ${JSON.stringify({ note })}::jsonb)`);
    await tx.execute(sql`UPDATE verification_cases SET first_response_at = coalesce(first_response_at, now()) WHERE id = ${caseId}`);
  });
}
