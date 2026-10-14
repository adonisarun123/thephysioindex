import { sql } from "drizzle-orm";
import { db, withTransaction, type Db } from "@/db/client";
import { audit } from "@/lib/audit";
import { ApiError } from "@/lib/api";
import { normaliseRegistrationNumber } from "@/lib/slug";
import { openCase } from "./cases";

/** Claim search, claim requests and duplicate detection (PRO-02, PRO-04 to PRO-06). */

export type ClaimHit = {
  id: string;
  publicId: string;
  slug: string;
  displayName: string;
  designation: string | null;
  listingStatus: string;
  claimed: boolean;
  source: string;
  location: string | null;
  registrationHint: string | null;
};

function showTestAccounts() {
  return process.env.SHOW_TEST_ACCOUNTS === "1";
}

/** Published or unclaimed imported listings matching a name, with optional registration number or city narrowing. */
export async function searchClaimable(q: { name: string; regNo?: string; city?: string }): Promise<ClaimHit[]> {
  const name = q.name.trim();
  if (name.length < 2) return [];
  const reg = q.regNo ? normaliseRegistrationNumber(q.regNo) : null;
  const res = await db().execute<Record<string, unknown>>(sql`
    SELECT p.id, p.public_id, p.slug, p.display_name, p.designation, p.listing_status::text AS listing_status,
      (p.claim_state = 'claimed' OR p.owner_user_id IS NOT NULL) AS claimed, p.source::text AS source,
      (SELECT concat_ws(', ', l.name, ci.name) FROM practitioner_branches pb JOIN branches b ON b.id = pb.branch_id
         JOIN localities l ON l.id = b.locality_id JOIN cities ci ON ci.id = b.city_id
         WHERE pb.practitioner_id = p.id AND pb.state IN ('approved', 'pending') ORDER BY pb.created_at LIMIT 1) AS location,
      (SELECT a.short_name FROM credentials c JOIN credential_authorities a ON a.id = c.authority_id WHERE c.practitioner_id = p.id ORDER BY c.type LIMIT 1) AS registration_hint
    FROM practitioners p
    WHERE (p.listing_status = 'published' OR (p.claim_state = 'unclaimed' AND p.source = 'imported' AND p.listing_status NOT IN ('archived', 'suspended')))
      ${showTestAccounts() ? sql`` : sql`AND p.is_test_account = false`}
      AND (lower(p.display_name) % lower(${name}) OR lower(p.display_name) LIKE lower(${`%${name}%`}))
      ${reg ? sql`AND EXISTS (SELECT 1 FROM credentials c WHERE c.practitioner_id = p.id AND c.number_normalised = ${reg})` : sql``}
      ${q.city ? sql`AND EXISTS (SELECT 1 FROM practitioner_branches pb JOIN branches b ON b.id = pb.branch_id JOIN cities ci ON ci.id = b.city_id WHERE pb.practitioner_id = p.id AND (lower(ci.name) = lower(${q.city}) OR EXISTS (SELECT 1 FROM geo_aliases ga WHERE ga.target_type = 'city' AND ga.target_id = ci.id AND ga.alias_normalised = regexp_replace(lower(${q.city}), '[^a-z0-9]', '', 'g'))))` : sql``}
    ORDER BY similarity(lower(p.display_name), lower(${name})) DESC, p.display_name
    LIMIT 20`);
  return res.rows.map((r) => ({
    id: r.id as string,
    publicId: r.public_id as string,
    slug: r.slug as string,
    displayName: r.display_name as string,
    designation: (r.designation as string | null) ?? null,
    listingStatus: r.listing_status as string,
    claimed: Boolean(r.claimed),
    source: r.source as string,
    location: (r.location as string | null) ?? null,
    registrationHint: (r.registration_hint as string | null) ?? null,
  }));
}

export type ClaimTarget = { id: string; publicId: string; slug: string; displayName: string; designation: string | null; claimed: boolean; listingStatus: string };

export async function getClaimTarget(publicId: string): Promise<ClaimTarget | null> {
  const res = await db().execute<Record<string, unknown>>(sql`
    SELECT id, public_id, slug, display_name, designation, (claim_state = 'claimed' OR owner_user_id IS NOT NULL) AS claimed, listing_status::text AS listing_status
    FROM practitioners WHERE public_id = ${publicId} AND listing_status NOT IN ('archived') ${showTestAccounts() ? sql`` : sql`AND is_test_account = false`}`);
  const r = res.rows[0];
  return r
    ? { id: r.id as string, publicId: r.public_id as string, slug: r.slug as string, displayName: r.display_name as string, designation: (r.designation as string | null) ?? null, claimed: Boolean(r.claimed), listingStatus: r.listing_status as string }
    : null;
}

export type ClaimStatus = { id: string; state: string; createdAt: string; decisionReason: string | null; competing: number };

export async function myClaim(practitionerId: string, userId: string): Promise<ClaimStatus | null> {
  const res = await db().execute<Record<string, unknown>>(sql`
    SELECT cr.id, cr.state::text AS state, cr.created_at, cr.decision_reason,
      (SELECT count(*) FROM claim_requests o WHERE o.practitioner_id = cr.practitioner_id AND o.id <> cr.id AND o.state IN ('requested', 'evidence_requested', 'under_review')) AS competing
    FROM claim_requests cr WHERE cr.practitioner_id = ${practitionerId} AND cr.claimant_user_id = ${userId}
    ORDER BY cr.created_at DESC LIMIT 1`);
  const r = res.rows[0];
  return r ? { id: r.id as string, state: r.state as string, createdAt: String(r.created_at), decisionReason: (r.decision_reason as string | null) ?? null, competing: Number(r.competing ?? 0) } : null;
}

export type ClaimEvidence = { authorityId: string | null; registrationNumber: string | null; clinicPhone: string | null; clinicEmail: string | null; note: string | null; dispute: boolean };

/**
 * Creates a claim request and its review case. A claim on an already claimed
 * listing is recorded as a dispute: ownership transfer stays frozen until a
 * reviewer decides (PRO-06). Evidence is stored privately; an OTP alone never
 * transfers a listing (PRO-04).
 */
export async function createClaim(target: ClaimTarget, claimantUserId: string, evidence: ClaimEvidence): Promise<{ claimId: string; duplicateWarning: boolean }> {
  const existing = await myClaim(target.id, claimantUserId);
  if (existing && ["requested", "evidence_requested", "under_review"].includes(existing.state)) throw new ApiError("CONFLICT", "You already have an open claim for this profile");
  const normalised = evidence.registrationNumber ? normaliseRegistrationNumber(evidence.registrationNumber) : null;
  return withTransaction(async (_client, tx) => {
    const ins = await tx.execute<{ id: string }>(sql`
      INSERT INTO claim_requests (practitioner_id, claimant_user_id, state, evidence)
      VALUES (${target.id}, ${claimantUserId}, 'requested', ${JSON.stringify({ ...evidence, registrationNumberNormalised: normalised, competingClaim: target.claimed })}::jsonb) RETURNING id`);
    const claimId = ins.rows[0].id;
    const caseId = await openCase(
      { caseType: "claim", subjectType: "claim_request", subjectId: claimId, practitionerId: target.id, submittedByUserId: claimantUserId, priority: target.claimed ? "high" : "normal", evidence: { dispute: target.claimed } },
      tx,
    );
    await tx.execute(sql`UPDATE claim_requests SET case_id = ${caseId} WHERE id = ${claimId}`);
    await audit({ actorUserId: claimantUserId, action: target.claimed ? "claim.dispute" : "claim.request", objectType: "claim_request", objectId: claimId, changedFields: { practitionerId: target.id, caseId } }, tx);
    // PRO-05: a matching issuer + normalised number elsewhere raises a duplicate warning for review.
    let duplicateWarning = false;
    if (evidence.authorityId && normalised) {
      duplicateWarning = await flagDuplicateByCredential(tx, target.id, evidence.authorityId, normalised, claimantUserId);
    }
    return { claimId, duplicateWarning };
  });
}

/**
 * Looks for another practitioner holding the same authority + normalised
 * number. Records a duplicate_candidates row and a review case; never merges
 * automatically (PRO-05). Returns true when a match was found.
 */
export async function flagDuplicateByCredential(tx: Db, practitionerId: string, authorityId: string, numberNormalised: string, actorUserId: string): Promise<boolean> {
  const hits = await tx.execute<{ practitioner_id: string }>(sql`
    SELECT DISTINCT c.practitioner_id FROM credentials c
    WHERE c.authority_id = ${authorityId} AND c.number_normalised = ${numberNormalised} AND c.practitioner_id <> ${practitionerId}`);
  if (hits.rows.length === 0) return false;
  for (const h of hits.rows) {
    const [a, b] = [practitionerId, h.practitioner_id].sort();
    const ins = await tx.execute<{ id: string }>(sql`
      INSERT INTO duplicate_candidates (practitioner_a_id, practitioner_b_id, match_reasons, score)
      VALUES (${a}, ${b}, ARRAY['registration_number'], 90)
      ON CONFLICT (practitioner_a_id, practitioner_b_id) DO UPDATE SET match_reasons = (SELECT array_agg(DISTINCT x) FROM unnest(duplicate_candidates.match_reasons || ARRAY['registration_number']) x), resolved = false
      RETURNING id`);
    const dupId = ins.rows[0].id;
    const caseId = await openCase({ caseType: "duplicate_candidate", subjectType: "duplicate_candidate", subjectId: dupId, practitionerId, submittedByUserId: actorUserId }, tx);
    await tx.execute(sql`UPDATE duplicate_candidates SET case_id = ${caseId} WHERE id = ${dupId} AND case_id IS NULL`);
    await audit({ actorUserId, action: "duplicate.flag", objectType: "duplicate_candidate", objectId: dupId, changedFields: { reason: "registration_number" } }, tx);
  }
  return true;
}
