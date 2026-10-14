import { sql, type SQL } from "drizzle-orm";
import { db, type Db } from "@/db/client";
import type { RoleName } from "@/lib/auth/session";
import { getConfig } from "@/lib/config";
import { isOverdue } from "./format";

/**
 * Review-queue read models (ADM-02). Every case carries status, assignee,
 * priority, submission time, evidence, decision reason and event history.
 */

export type CaseRow = {
  id: string;
  caseType: string;
  subjectType: string;
  subjectId: string;
  practitionerId: string | null;
  practitionerName: string | null;
  state: string;
  priority: string;
  assigneeUserId: string | null;
  assigneeName: string | null;
  submittedByName: string | null;
  submittedAt: Date;
  firstResponseAt: Date | null;
  dueAt: Date | null;
  decidedAt: Date | null;
  decision: string | null;
  decisionReason: string | null;
  summary: string | null;
  overdue: boolean;
};

export type CaseFilters = {
  caseType?: string;
  state?: string; // open | in_review | awaiting_evidence | decided | all
  priority?: string;
  assignee?: "me" | "unassigned" | "any";
  practitionerId?: string;
  viewerUserId: string;
  page?: number;
  pageSize?: number;
};

export const CASE_STATES = ["open", "in_review", "awaiting_evidence", "decided"] as const;

/** Which staff role may read a queue; decisions re-check per type (IAM-01). */
export function queueRole(caseType: string): RoleName {
  return ["complaint", "correction_request", "credential_fraud"].includes(caseType) ? "support_agent" : "verification_reviewer";
}

/** One-line description of the subject, derived per subject type. */
const SUMMARY_SQL = sql`CASE vc.subject_type
  WHEN 'practitioner' THEN (SELECT display_name FROM practitioners WHERE id = vc.subject_id)
  WHEN 'profile_version' THEN (SELECT 'v' || pv.version || ' · ' || p.display_name FROM profile_versions pv JOIN practitioners p ON p.id = pv.practitioner_id WHERE pv.id = vc.subject_id)
  WHEN 'claim_request' THEN (SELECT p.display_name || ' ← ' || coalesce(u.display_name, u.email, u.mobile, 'claimant') FROM claim_requests cr JOIN practitioners p ON p.id = cr.practitioner_id JOIN users u ON u.id = cr.claimant_user_id WHERE cr.id = vc.subject_id)
  WHEN 'credential' THEN (SELECT a.name || ' · ' || coalesce(c.number_original, '(no number)') FROM credentials c JOIN credential_authorities a ON a.id = c.authority_id WHERE c.id = vc.subject_id)
  WHEN 'duplicate_candidate' THEN (SELECT pa.display_name || ' ⇄ ' || pb.display_name FROM duplicate_candidates dc JOIN practitioners pa ON pa.id = dc.practitioner_a_id JOIN practitioners pb ON pb.id = dc.practitioner_b_id WHERE dc.id = vc.subject_id)
  WHEN 'offer_version' THEN (SELECT o.title || ' v' || ov.version FROM offer_versions ov JOIN offers o ON o.id = ov.offer_id WHERE ov.id = vc.subject_id)
  WHEN 'review' THEN (SELECT r.rating || '★ · ' || left(coalesce(r.text, ''), 60) FROM reviews r WHERE r.id = vc.subject_id)
  WHEN 'locality_proposal' THEN (SELECT lp.proposed_name || ' (' || c.name || ')' FROM locality_proposals lp JOIN cities c ON c.id = lp.city_id WHERE lp.id = vc.subject_id)
  WHEN 'booking' THEN (SELECT 'Booking ' || b.reference FROM bookings b WHERE b.id = vc.subject_id)
  WHEN 'user' THEN (SELECT coalesce(u.display_name, u.email, u.mobile) FROM users u WHERE u.id = vc.subject_id)
  WHEN 'branch' THEN (SELECT c.name || ' · ' || b.name FROM branches b JOIN clinics c ON c.id = b.clinic_id WHERE b.id = vc.subject_id)
  WHEN 'clinic' THEN (SELECT name FROM clinics WHERE id = vc.subject_id)
  ELSE vc.evidence ->> 'summary' END`;

const BASE_SELECT = sql`
  SELECT vc.id, vc.case_type AS "caseType", vc.subject_type AS "subjectType", vc.subject_id AS "subjectId", vc.practitioner_id AS "practitionerId",
    p.display_name AS "practitionerName", vc.state, vc.priority, vc.assignee_user_id AS "assigneeUserId",
    coalesce(au.display_name, au.email) AS "assigneeName", coalesce(su.display_name, su.email, su.mobile) AS "submittedByName",
    vc.submitted_at AS "submittedAt", vc.first_response_at AS "firstResponseAt", vc.due_at AS "dueAt", vc.decided_at AS "decidedAt",
    vc.decision, vc.decision_reason AS "decisionReason", ${SUMMARY_SQL} AS summary
  FROM verification_cases vc
  LEFT JOIN practitioners p ON p.id = vc.practitioner_id
  LEFT JOIN users au ON au.id = vc.assignee_user_id
  LEFT JOIN users su ON su.id = vc.submitted_by_user_id`;

export async function listCases(f: CaseFilters): Promise<{ rows: CaseRow[]; total: number; counts: Record<string, number>; target: number }> {
  const where: SQL[] = [];
  if (f.caseType) where.push(sql`vc.case_type = ${f.caseType}::case_type`);
  if (f.practitionerId) where.push(sql`vc.practitioner_id = ${f.practitionerId}`);
  const stateWhere = [...where];
  const state = f.state ?? "open";
  if (state !== "all") stateWhere.push(state === "decided" ? sql`vc.state IN ('decided','closed')` : sql`vc.state = ${state}::case_state`);
  if (f.priority) stateWhere.push(sql`vc.priority = ${f.priority}::priority`);
  if (f.assignee === "me") stateWhere.push(sql`vc.assignee_user_id = ${f.viewerUserId}`);
  if (f.assignee === "unassigned") stateWhere.push(sql`vc.assignee_user_id IS NULL`);
  const pageSize = f.pageSize ?? 50;
  const page = Math.max(1, f.page ?? 1);
  const whereSql = stateWhere.length ? sql`WHERE ${sql.join(stateWhere, sql` AND `)}` : sql``;
  const order = state === "decided" || state === "all" ? sql`ORDER BY vc.decided_at DESC NULLS LAST, vc.submitted_at DESC` : sql`ORDER BY CASE vc.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END, vc.submitted_at ASC`;
  const [rows, totalRes, countsRes, target] = await Promise.all([
    db().execute<Omit<CaseRow, "overdue">>(sql`${BASE_SELECT} ${whereSql} ${order} LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`),
    db().execute<{ n: string }>(sql`SELECT count(*) AS n FROM verification_cases vc ${whereSql}`),
    db().execute<{ state: string; n: string }>(sql`SELECT CASE WHEN vc.state IN ('decided','closed') THEN 'decided' ELSE vc.state::text END AS state, count(*) AS n FROM verification_cases vc ${where.length ? sql`WHERE ${sql.join(where, sql` AND `)}` : sql``} GROUP BY 1`),
    getConfig<number>("admin.first_response_target_business_days", 2),
  ]);
  const counts = Object.fromEntries(countsRes.rows.map((r) => [r.state, Number(r.n)]));
  return {
    rows: rows.rows.map((r) => ({ ...r, overdue: isOverdue(r.submittedAt, r.firstResponseAt, target) })),
    total: Number(totalRes.rows[0]?.n ?? 0),
    counts,
    target,
  };
}

export async function getCase(id: string): Promise<(CaseRow & { evidence: Record<string, unknown>; method: string | null; checkedAt: Date | null; nextReviewAt: Date | null; submittedByUserId: string | null; secondApproverUserId: string | null; decidedByName: string | null }) | null> {
  const res = await db().execute<CaseRow & { evidence: Record<string, unknown>; method: string | null; checkedAt: Date | null; nextReviewAt: Date | null; submittedByUserId: string | null; secondApproverUserId: string | null; decidedByName: string | null }>(sql`
    SELECT vc.id, vc.case_type AS "caseType", vc.subject_type AS "subjectType", vc.subject_id AS "subjectId", vc.practitioner_id AS "practitionerId",
      p.display_name AS "practitionerName", vc.state, vc.priority, vc.assignee_user_id AS "assigneeUserId",
      coalesce(au.display_name, au.email) AS "assigneeName", coalesce(su.display_name, su.email, su.mobile) AS "submittedByName", vc.submitted_by_user_id AS "submittedByUserId",
      vc.submitted_at AS "submittedAt", vc.first_response_at AS "firstResponseAt", vc.due_at AS "dueAt", vc.decided_at AS "decidedAt",
      vc.decision, vc.decision_reason AS "decisionReason", vc.evidence, vc.method, vc.checked_at AS "checkedAt", vc.next_review_at AS "nextReviewAt",
      vc.second_approver_user_id AS "secondApproverUserId", coalesce(du.display_name, du.email) AS "decidedByName", ${SUMMARY_SQL} AS summary
    FROM verification_cases vc
    LEFT JOIN practitioners p ON p.id = vc.practitioner_id
    LEFT JOIN users au ON au.id = vc.assignee_user_id
    LEFT JOIN users su ON su.id = vc.submitted_by_user_id
    LEFT JOIN users du ON du.id = vc.decided_by_user_id
    WHERE vc.id = ${id}`);
  const row = res.rows[0];
  if (!row) return null;
  const target = await getConfig<number>("admin.first_response_target_business_days", 2);
  return { ...row, overdue: isOverdue(row.submittedAt, row.firstResponseAt, target) };
}

export type CaseEvent = { id: string; eventType: string; actorName: string | null; payload: Record<string, unknown> | null; occurredAt: Date };

export async function listCaseEvents(caseId: string): Promise<CaseEvent[]> {
  const res = await db().execute<CaseEvent>(sql`
    SELECT ce.id, ce.event_type AS "eventType", coalesce(u.display_name, u.email) AS "actorName", ce.payload, ce.occurred_at AS "occurredAt"
    FROM case_events ce LEFT JOIN users u ON u.id = ce.actor_user_id WHERE ce.case_id = ${caseId} ORDER BY ce.occurred_at ASC`);
  return res.rows;
}

/** Subject panel data, loaded per subject type. Drafts and evidence stay server-side (PRO-10). */
export async function loadSubject(subjectType: string, subjectId: string): Promise<Record<string, unknown> | null> {
  const d = db();
  switch (subjectType) {
    case "profile_version": {
      const res = await d.execute(sql`
        SELECT pv.id, pv.version, pv.state, pv.structured_content AS "structuredContent", pv.changed_fields AS "changedFields", pv.submitted_at AS "submittedAt", pv.practitioner_id AS "practitionerId",
          p.display_name AS "displayName", p.listing_status AS "listingStatus", p.published_version_id AS "publishedVersionId",
          (SELECT structured_content FROM profile_versions WHERE id = p.published_version_id) AS "publishedContent",
          (SELECT json_agg(json_build_object('id', c.id, 'type', c.type, 'authority', a.name, 'number', c.number_original, 'status', c.status, 'expiresOn', c.expires_on) ORDER BY c.created_at) FROM credentials c JOIN credential_authorities a ON a.id = c.authority_id WHERE c.practitioner_id = pv.practitioner_id) AS credentials
        FROM profile_versions pv JOIN practitioners p ON p.id = pv.practitioner_id WHERE pv.id = ${subjectId}`);
      return (res.rows[0] as Record<string, unknown>) ?? null;
    }
    case "practitioner": {
      const res = await d.execute(sql`
        SELECT p.id, p.display_name AS "displayName", p.public_id AS "publicId", p.listing_status AS "listingStatus", p.claim_state AS "claimState", p.booking_eligible AS "bookingEligible", p.source,
          (SELECT json_build_object('id', pv.id, 'version', pv.version, 'state', pv.state, 'structuredContent', pv.structured_content, 'changedFields', pv.changed_fields) FROM profile_versions pv WHERE pv.practitioner_id = p.id AND pv.state IN ('submitted','draft') ORDER BY pv.version DESC LIMIT 1) AS "latestDraft",
          (SELECT json_agg(json_build_object('id', c.id, 'type', c.type, 'authority', a.name, 'number', c.number_original, 'status', c.status, 'expiresOn', c.expires_on) ORDER BY c.created_at) FROM credentials c JOIN credential_authorities a ON a.id = c.authority_id WHERE c.practitioner_id = p.id) AS credentials
        FROM practitioners p WHERE p.id = ${subjectId}`);
      return (res.rows[0] as Record<string, unknown>) ?? null;
    }
    case "claim_request": {
      const res = await d.execute(sql`
        SELECT cr.id, cr.state, cr.evidence, cr.decision_reason AS "decisionReason", cr.created_at AS "createdAt", cr.practitioner_id AS "practitionerId",
          p.display_name AS "practitionerName", p.claim_state AS "claimState", p.owner_user_id AS "ownerUserId",
          coalesce(u.display_name, u.email, u.mobile) AS "claimantName", u.mobile_verified_at IS NOT NULL AS "claimantMobileVerified", u.email_verified_at IS NOT NULL AS "claimantEmailVerified",
          (SELECT count(*) FROM claim_requests o WHERE o.practitioner_id = cr.practitioner_id AND o.id <> cr.id AND o.state IN ('requested','evidence_requested','under_review')) AS "competingClaims"
        FROM claim_requests cr JOIN practitioners p ON p.id = cr.practitioner_id JOIN users u ON u.id = cr.claimant_user_id WHERE cr.id = ${subjectId}`);
      return (res.rows[0] as Record<string, unknown>) ?? null;
    }
    case "credential": {
      const res = await d.execute(sql`
        SELECT c.id, c.type, c.status, c.number_original AS "numberOriginal", c.number_normalised AS "numberNormalised", c.issue_date AS "issueDate", c.expires_on AS "expiresOn", c.source, c.scope_of_check AS "scopeOfCheck",
          c.last_checked_at AS "lastCheckedAt", c.next_review_at AS "nextReviewAt", c.public_number_approved AS "publicNumberApproved", c.evidence_asset_id AS "evidenceAssetId",
          a.name AS authority, a.kind AS "authorityKind", a.lookup_url AS "lookupUrl", a.accepted_for_booking AS "acceptedForBooking", p.display_name AS "practitionerName", p.id AS "practitionerId",
          (SELECT json_agg(json_build_object('practitionerId', o.practitioner_id, 'name', op.display_name, 'status', o.status)) FROM credentials o JOIN practitioners op ON op.id = o.practitioner_id WHERE o.id <> c.id AND o.authority_id = c.authority_id AND o.type = c.type AND o.number_normalised = c.number_normalised AND c.number_normalised IS NOT NULL) AS "sameNumberElsewhere"
        FROM credentials c JOIN credential_authorities a ON a.id = c.authority_id JOIN practitioners p ON p.id = c.practitioner_id WHERE c.id = ${subjectId}`);
      return (res.rows[0] as Record<string, unknown>) ?? null;
    }
    case "duplicate_candidate": {
      const res = await d.execute(sql`
        SELECT dc.id, dc.match_reasons AS "matchReasons", dc.score, dc.resolved,
          json_build_object('id', pa.id, 'name', pa.display_name, 'publicId', pa.public_id, 'listingStatus', pa.listing_status, 'claimState', pa.claim_state, 'source', pa.source, 'createdAt', pa.created_at,
            'bookings', (SELECT count(*) FROM bookings WHERE practitioner_id = pa.id), 'credentials', (SELECT json_agg(a.short_name || ' ' || coalesce(c.number_original,'')) FROM credentials c JOIN credential_authorities a ON a.id = c.authority_id WHERE c.practitioner_id = pa.id),
            'branches', (SELECT json_agg(cl.name || ' · ' || b.name) FROM practitioner_branches pb JOIN branches b ON b.id = pb.branch_id JOIN clinics cl ON cl.id = b.clinic_id WHERE pb.practitioner_id = pa.id AND pb.state IN ('pending','approved'))) AS a,
          json_build_object('id', pb2.id, 'name', pb2.display_name, 'publicId', pb2.public_id, 'listingStatus', pb2.listing_status, 'claimState', pb2.claim_state, 'source', pb2.source, 'createdAt', pb2.created_at,
            'bookings', (SELECT count(*) FROM bookings WHERE practitioner_id = pb2.id), 'credentials', (SELECT json_agg(a.short_name || ' ' || coalesce(c.number_original,'')) FROM credentials c JOIN credential_authorities a ON a.id = c.authority_id WHERE c.practitioner_id = pb2.id),
            'branches', (SELECT json_agg(cl.name || ' · ' || b.name) FROM practitioner_branches pb JOIN branches b ON b.id = pb.branch_id JOIN clinics cl ON cl.id = b.clinic_id WHERE pb.practitioner_id = pb2.id AND pb.state IN ('pending','approved'))) AS b
        FROM duplicate_candidates dc JOIN practitioners pa ON pa.id = dc.practitioner_a_id JOIN practitioners pb2 ON pb2.id = dc.practitioner_b_id WHERE dc.id = ${subjectId}`);
      return (res.rows[0] as Record<string, unknown>) ?? null;
    }
    case "offer_version": {
      const res = await d.execute(sql`
        SELECT ov.id, ov.version, ov.type, ov.value, ov.starts_at AS "startsAt", ov.ends_at AS "endsAt", ov.min_spend_paise AS "minSpendPaise", ov.max_discount_paise AS "maxDiscountPaise", ov.total_cap AS "totalCap", ov.per_patient_cap AS "perPatientCap",
          ov.first_visit_only AS "firstVisitOnly", ov.automatic, ov.terms, ov.regular_price_confirmed AS "regularPriceConfirmed", ov.moderation_state AS "moderationState", ov.moderation_reason AS "moderationReason",
          o.title, o.code, o.state AS "offerState", o.scope_type AS "scopeType", p.display_name AS "practitionerName", c.name AS "clinicName"
        FROM offer_versions ov JOIN offers o ON o.id = ov.offer_id LEFT JOIN practitioners p ON p.id = o.practitioner_id LEFT JOIN clinics c ON c.id = o.clinic_id WHERE ov.id = ${subjectId}`);
      return (res.rows[0] as Record<string, unknown>) ?? null;
    }
    case "review": {
      const res = await d.execute(sql`
        SELECT r.id, r.rating, r.text, r.display_name AS "displayName", r.state, r.moderation_reason AS "moderationReason", r.created_at AS "createdAt",
          b.reference AS "bookingReference", b.status AS "bookingStatus", b.starts_at AS "appointmentAt", p.display_name AS "practitionerName", p.id AS "practitionerId"
        FROM reviews r JOIN bookings b ON b.id = r.booking_id JOIN practitioners p ON p.id = r.practitioner_id WHERE r.id = ${subjectId}`);
      return (res.rows[0] as Record<string, unknown>) ?? null;
    }
    case "locality_proposal": {
      const res = await d.execute(sql`
        SELECT lp.id, lp.proposed_name AS "proposedName", lp.proposed_pin_code AS "proposedPinCode", lp.state, lp.decision_reason AS "decisionReason", lp.city_id AS "cityId", c.name AS "cityName", s.name AS "stateName",
          lp.branch_id AS "branchId", (SELECT cl.name || ' · ' || b.name FROM branches b JOIN clinics cl ON cl.id = b.clinic_id WHERE b.id = lp.branch_id) AS "branchName",
          (SELECT json_agg(json_build_object('id', l.id, 'name', l.name, 'similarity', round(similarity(lower(l.name), lower(lp.proposed_name))::numeric, 2)) ORDER BY similarity(lower(l.name), lower(lp.proposed_name)) DESC) FROM (SELECT * FROM localities l WHERE l.city_id = lp.city_id AND l.status = 'active' ORDER BY similarity(lower(l.name), lower(lp.proposed_name)) DESC LIMIT 5) l) AS "similar"
        FROM locality_proposals lp JOIN cities c ON c.id = lp.city_id JOIN states s ON s.id = c.state_id WHERE lp.id = ${subjectId}`);
      return (res.rows[0] as Record<string, unknown>) ?? null;
    }
    case "booking": {
      const res = await d.execute(sql`
        SELECT b.id, b.reference, b.status, b.starts_at AS "startsAt", b.source, p.display_name AS "practitionerName", c.name AS "clinicName", br.name AS "branchName"
        FROM bookings b JOIN practitioners p ON p.id = b.practitioner_id JOIN branches br ON br.id = b.branch_id JOIN clinics c ON c.id = br.clinic_id WHERE b.id = ${subjectId}`);
      return (res.rows[0] as Record<string, unknown>) ?? null;
    }
    case "user": {
      const res = await d.execute(sql`
        SELECT u.id, coalesce(u.display_name, u.email, u.mobile) AS name, u.email, u.status,
          (SELECT json_agg(ra.role::text) FROM role_assignments ra WHERE ra.user_id = u.id AND ra.revoked_at IS NULL) AS roles
        FROM users u WHERE u.id = ${subjectId}`);
      return (res.rows[0] as Record<string, unknown>) ?? null;
    }
    default:
      return null;
  }
}

/** Opens a case (used by actions that need a review). Returns the id; dedupes on an open case for the same subject. */
export async function openCase(
  tx: Db,
  input: {
    caseType: string;
    subjectType: string;
    subjectId: string;
    practitionerId?: string | null;
    submittedByUserId?: string | null;
    priority?: "low" | "normal" | "high" | "urgent";
    evidence?: Record<string, unknown>;
    dueAt?: Date | null;
  },
): Promise<{ id: string; created: boolean }> {
  const existing = await tx.execute<{ id: string }>(sql`
    SELECT id FROM verification_cases WHERE case_type = ${input.caseType}::case_type AND subject_type = ${input.subjectType} AND subject_id = ${input.subjectId} AND state IN ('open','in_review','awaiting_evidence') LIMIT 1`);
  if (existing.rows[0]) return { id: existing.rows[0].id, created: false };
  const res = await tx.execute<{ id: string }>(sql`
    INSERT INTO verification_cases (case_type, subject_type, subject_id, practitioner_id, submitted_by_user_id, priority, evidence, due_at)
    VALUES (${input.caseType}::case_type, ${input.subjectType}, ${input.subjectId}, ${input.practitionerId ?? null}, ${input.submittedByUserId ?? null}, ${input.priority ?? "normal"}::priority, ${JSON.stringify(input.evidence ?? {})}::jsonb, ${input.dueAt ?? null})
    RETURNING id`);
  const id = res.rows[0].id;
  await tx.execute(sql`INSERT INTO case_events (case_id, actor_user_id, event_type, payload) VALUES (${id}, ${input.submittedByUserId ?? null}, 'opened', ${JSON.stringify({ caseType: input.caseType })}::jsonb)`);
  return { id, created: true };
}
