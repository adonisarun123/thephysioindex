import { sql, type SQL } from "drizzle-orm";
import { db } from "@/db/client";
import { VERIFICATION_CATEGORY_SQL, type VerificationCategory } from "@/lib/verification";
import { normaliseRegistrationNumber } from "@/lib/slug";
import type { StructuredContent } from "./profile-content";

/** Practitioner directory for staff: all listing states, including drafts (staff only; never a public read model). */

export type PractitionerListRow = {
  id: string;
  publicId: string;
  slug: string;
  displayName: string;
  designation: string | null;
  listingStatus: string;
  claimState: string;
  bookingEligible: boolean;
  bookingPaused: boolean;
  source: string;
  verification: VerificationCategory;
  cities: string | null;
  openCases: number;
  isTestAccount: boolean;
  createdAt: Date;
};

export type PractitionerFilters = { q?: string; listingStatus?: string; stateId?: string; cityId?: string; claimState?: string; page?: number; pageSize?: number };

export async function listPractitioners(f: PractitionerFilters): Promise<{ rows: PractitionerListRow[]; total: number }> {
  const where: SQL[] = [];
  const q = f.q?.trim();
  if (q) {
    const norm = normaliseRegistrationNumber(q);
    where.push(sql`(p.display_name ILIKE ${"%" + q + "%"} OR p.public_id = ${q.toLowerCase()} OR p.slug = ${q.toLowerCase()} OR EXISTS (SELECT 1 FROM credentials c WHERE c.practitioner_id = p.id AND (c.number_normalised = ${norm} OR c.number_original ILIKE ${"%" + q + "%"})))`);
  }
  if (f.listingStatus) where.push(sql`p.listing_status = ${f.listingStatus}::listing_status`);
  if (f.claimState) where.push(sql`p.claim_state = ${f.claimState}::claim_state`);
  if (f.stateId) where.push(sql`EXISTS (SELECT 1 FROM practitioner_branches pb JOIN branches b ON b.id = pb.branch_id WHERE pb.practitioner_id = p.id AND b.state_id = ${f.stateId})`);
  if (f.cityId) where.push(sql`EXISTS (SELECT 1 FROM practitioner_branches pb JOIN branches b ON b.id = pb.branch_id WHERE pb.practitioner_id = p.id AND b.city_id = ${f.cityId})`);
  const whereSql = where.length ? sql`WHERE ${sql.join(where, sql` AND `)}` : sql``;
  const pageSize = f.pageSize ?? 50;
  const page = Math.max(1, f.page ?? 1);
  const [rows, total] = await Promise.all([
    db().execute<PractitionerListRow>(sql`
      SELECT p.id, p.public_id AS "publicId", p.slug, p.display_name AS "displayName", p.designation, p.listing_status AS "listingStatus", p.claim_state AS "claimState",
        p.booking_eligible AS "bookingEligible", p.booking_paused AS "bookingPaused", p.source, p.is_test_account AS "isTestAccount", p.created_at AS "createdAt",
        ${sql.raw(VERIFICATION_CATEGORY_SQL)} AS verification,
        (SELECT string_agg(DISTINCT ci.name, ', ') FROM practitioner_branches pb JOIN branches b ON b.id = pb.branch_id JOIN cities ci ON ci.id = b.city_id WHERE pb.practitioner_id = p.id AND pb.state IN ('pending','approved')) AS cities,
        (SELECT count(*)::int FROM verification_cases vc WHERE vc.practitioner_id = p.id AND vc.state IN ('open','in_review','awaiting_evidence')) AS "openCases"
      FROM practitioners p ${whereSql}
      ORDER BY p.created_at DESC LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`),
    db().execute<{ n: string }>(sql`SELECT count(*) AS n FROM practitioners p ${whereSql}`),
  ]);
  return { rows: rows.rows, total: Number(total.rows[0]?.n ?? 0) };
}

export type PractitionerDetail = {
  id: string;
  publicId: string;
  slug: string;
  displayName: string;
  designation: string | null;
  headline: string | null;
  gender: string;
  practiceStartDate: string | null;
  listingStatus: string;
  claimState: string;
  bookingEligible: boolean;
  bookingPaused: boolean;
  source: string;
  importBatchId: string | null;
  ownerUserId: string | null;
  ownerName: string | null;
  ownerContact: string | null;
  ownerVerified: boolean;
  publishedVersionId: string | null;
  publishedVersion: number | null;
  publishedContent: StructuredContent | null;
  latestDraft: { id: string; version: number; state: string; structuredContent: StructuredContent; submittedAt: Date | null } | null;
  suspendedAt: Date | null;
  suspensionReason: string | null;
  publishedAt: Date | null;
  reviewCount: number;
  ratingAvgX100: number | null;
  isTestAccount: boolean;
  bookingsCount: number;
  futureBookings: number;
  createdAt: Date;
  verification: VerificationCategory;
};

export async function getPractitionerDetail(id: string): Promise<PractitionerDetail | null> {
  const res = await db().execute<PractitionerDetail>(sql`
    SELECT p.id, p.public_id AS "publicId", p.slug, p.display_name AS "displayName", p.designation, p.headline, p.gender::text, p.practice_start_date::text AS "practiceStartDate",
      p.listing_status AS "listingStatus", p.claim_state AS "claimState", p.booking_eligible AS "bookingEligible", p.booking_paused AS "bookingPaused", p.source, p.import_batch_id AS "importBatchId",
      p.owner_user_id AS "ownerUserId", coalesce(u.display_name, u.email, u.mobile) AS "ownerName", coalesce(u.email, u.mobile) AS "ownerContact", (u.mobile_verified_at IS NOT NULL OR u.email_verified_at IS NOT NULL) AS "ownerVerified",
      p.published_version_id AS "publishedVersionId", pv.version AS "publishedVersion", pv.structured_content AS "publishedContent",
      (SELECT json_build_object('id', d.id, 'version', d.version, 'state', d.state, 'structuredContent', d.structured_content, 'submittedAt', d.submitted_at) FROM profile_versions d WHERE d.practitioner_id = p.id AND d.state IN ('draft','submitted') ORDER BY d.version DESC LIMIT 1) AS "latestDraft",
      p.suspended_at AS "suspendedAt", p.suspension_reason AS "suspensionReason", p.published_at AS "publishedAt", p.review_count AS "reviewCount", p.rating_avg_x100 AS "ratingAvgX100", p.is_test_account AS "isTestAccount", p.created_at AS "createdAt",
      (SELECT count(*)::int FROM bookings b WHERE b.practitioner_id = p.id) AS "bookingsCount",
      (SELECT count(*)::int FROM bookings b WHERE b.practitioner_id = p.id AND b.status IN ('confirmed','requested') AND b.starts_at > now()) AS "futureBookings",
      ${sql.raw(VERIFICATION_CATEGORY_SQL)} AS verification
    FROM practitioners p LEFT JOIN users u ON u.id = p.owner_user_id LEFT JOIN profile_versions pv ON pv.id = p.published_version_id
    WHERE p.id = ${id}`);
  return res.rows[0] ?? null;
}

export type CredentialRow = { id: string; type: string; status: string; authorityId: string; authority: string; authorityKind: string; numberOriginal: string | null; issueDate: string | null; expiresOn: string | null; source: string | null; scopeOfCheck: string | null; lastCheckedAt: Date | null; nextReviewAt: Date | null; publicNumberApproved: boolean; openCaseId: string | null };

export async function listCredentials(practitionerId: string): Promise<CredentialRow[]> {
  const res = await db().execute<CredentialRow>(sql`
    SELECT c.id, c.type, c.status, c.authority_id AS "authorityId", a.name AS authority, a.kind AS "authorityKind", c.number_original AS "numberOriginal", c.issue_date::text AS "issueDate", c.expires_on::text AS "expiresOn", c.source, c.scope_of_check AS "scopeOfCheck",
      c.last_checked_at AS "lastCheckedAt", c.next_review_at AS "nextReviewAt", c.public_number_approved AS "publicNumberApproved",
      (SELECT vc.id FROM verification_cases vc WHERE vc.subject_type = 'credential' AND vc.subject_id = c.id AND vc.state IN ('open','in_review','awaiting_evidence') LIMIT 1) AS "openCaseId"
    FROM credentials c JOIN credential_authorities a ON a.id = c.authority_id WHERE c.practitioner_id = ${practitionerId} ORDER BY c.created_at`);
  return res.rows;
}

export type AssociationRow = { id: string; branchId: string; branchName: string; clinicId: string; clinicName: string; locality: string; city: string; state: string; activeFrom: string; practitionerId?: string; activeTo: string | null; bookable: boolean; branchStatus: string; offerings: number };

export async function listAssociations(practitionerId: string): Promise<AssociationRow[]> {
  const res = await db().execute<AssociationRow>(sql`
    SELECT pb.id, pb.branch_id AS "branchId", b.name AS "branchName", c.id AS "clinicId", c.name AS "clinicName", l.name AS locality, ci.name AS city, pb.state, pb.active_from::text AS "activeFrom", pb.active_to::text AS "activeTo", pb.bookable, b.status AS "branchStatus",
      (SELECT count(*)::int FROM offerings o WHERE o.practitioner_branch_id = pb.id AND o.active) AS offerings
    FROM practitioner_branches pb JOIN branches b ON b.id = pb.branch_id JOIN clinics c ON c.id = b.clinic_id JOIN localities l ON l.id = b.locality_id JOIN cities ci ON ci.id = b.city_id
    WHERE pb.practitioner_id = ${practitionerId} ORDER BY pb.created_at`);
  return res.rows;
}

export type OfferingRow = { id: string; displayName: string; service: string; mode: string; active: boolean; branchName: string; clinicName: string; basePricePaise: number | null; durationMin: number | null; bookingMode: string | null };

export async function listOfferings(practitionerId: string): Promise<OfferingRow[]> {
  const res = await db().execute<OfferingRow>(sql`
    SELECT o.id, o.display_name AS "displayName", s.label AS service, o.mode, o.active, b.name AS "branchName", c.name AS "clinicName", ov.base_price_paise AS "basePricePaise", ov.duration_min AS "durationMin", ov.booking_mode AS "bookingMode"
    FROM offerings o JOIN services s ON s.id = o.service_id JOIN branches b ON b.id = o.branch_id JOIN clinics c ON c.id = b.clinic_id LEFT JOIN offering_versions ov ON ov.id = o.current_version_id
    WHERE o.practitioner_id = ${practitionerId} ORDER BY b.name, o.display_name`);
  return res.rows.map((r) => ({ ...r, basePricePaise: r.basePricePaise == null ? null : Number(r.basePricePaise) }));
}

export async function listSlugHistory(practitionerId: string): Promise<{ slug: string; createdAt: Date }[]> {
  const res = await db().execute<{ slug: string; createdAt: Date }>(sql`SELECT slug, created_at AS "createdAt" FROM practitioner_slug_history WHERE practitioner_id = ${practitionerId} ORDER BY created_at DESC`);
  return res.rows;
}

export type AuditRow = { id: string; action: string; objectType: string; objectId: string | null; actorName: string | null; actorRole: string | null; reason: string | null; changedFields: Record<string, unknown> | null; occurredAt: Date };

export async function auditFor(objectType: string, objectId: string, limit = 50): Promise<AuditRow[]> {
  const res = await db().execute<AuditRow>(sql`
    SELECT a.id, a.action, a.object_type AS "objectType", a.object_id AS "objectId", coalesce(u.display_name, u.email) AS "actorName", a.actor_role AS "actorRole", a.reason, a.changed_fields AS "changedFields", a.occurred_at AS "occurredAt"
    FROM audit_events a LEFT JOIN users u ON u.id = a.actor_user_id
    WHERE (a.object_type = ${objectType} AND a.object_id = ${objectId}) OR (a.changed_fields ->> 'keepId' = ${objectId}) OR (a.changed_fields ->> 'mergedId' = ${objectId})
    ORDER BY a.occurred_at DESC LIMIT ${limit}`);
  return res.rows;
}

export async function listDuplicateCandidates(practitionerId: string): Promise<{ id: string; otherId: string; otherName: string; score: number; resolved: boolean; caseId: string | null }[]> {
  const res = await db().execute<{ id: string; otherId: string; otherName: string; score: number; resolved: boolean; caseId: string | null }>(sql`
    SELECT dc.id, CASE WHEN dc.practitioner_a_id = ${practitionerId} THEN dc.practitioner_b_id ELSE dc.practitioner_a_id END AS "otherId",
      CASE WHEN dc.practitioner_a_id = ${practitionerId} THEN pb.display_name ELSE pa.display_name END AS "otherName", dc.score, dc.resolved, dc.case_id AS "caseId"
    FROM duplicate_candidates dc JOIN practitioners pa ON pa.id = dc.practitioner_a_id JOIN practitioners pb ON pb.id = dc.practitioner_b_id
    WHERE dc.practitioner_a_id = ${practitionerId} OR dc.practitioner_b_id = ${practitionerId} ORDER BY dc.resolved, dc.score DESC`);
  return res.rows;
}

/** Lookups for forms. */
export async function geoOptions(): Promise<{ states: { id: string; name: string; code: string }[]; cities: { id: string; name: string; stateId: string }[] }> {
  const [states, cities] = await Promise.all([
    db().execute<{ id: string; name: string; code: string }>(sql`SELECT id, name, code FROM states WHERE status = 'active' ORDER BY sort_order, name`),
    db().execute<{ id: string; name: string; stateId: string }>(sql`SELECT id, name, state_id AS "stateId" FROM cities WHERE status = 'active' ORDER BY name`),
  ]);
  return { states: states.rows, cities: cities.rows };
}

export async function authorityOptions(): Promise<{ id: string; name: string; kind: string; stateCode: string | null }[]> {
  const res = await db().execute<{ id: string; name: string; kind: string; stateCode: string | null }>(sql`SELECT a.id, a.name, a.kind, s.code AS "stateCode" FROM credential_authorities a LEFT JOIN states s ON s.id = a.jurisdiction_state_id WHERE a.active ORDER BY a.kind, a.name`);
  return res.rows;
}

export async function findUserByContact(contact: string): Promise<{ id: string; name: string | null } | null> {
  const c = contact.trim();
  const digits = c.replace(/\D/g, "");
  const res = await db().execute<{ id: string; name: string | null }>(sql`
    SELECT id, coalesce(display_name, email, mobile) AS name FROM users
    WHERE lower(email) = lower(${c}) OR (${digits.length >= 10} AND regexp_replace(coalesce(mobile,''), '\\D', '', 'g') LIKE ${"%" + digits.slice(-10)}) OR id::text = ${c}
    LIMIT 1`);
  return res.rows[0] ?? null;
}
