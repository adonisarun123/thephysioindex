import { sql } from "drizzle-orm";
import { db, withTransaction } from "@/db/client";
import type { Viewer } from "@/lib/auth/session";
import { openCase } from "./cases";
import { decideCase } from "./decisions";
import { bookingEligibilityChecklist, setBookingEligible } from "./practitioner-ops";

/**
 * One-screen approvals (ADM-02, VER-02, VER-04). Everything a reviewer needs to
 * decide a new listing or a profile change sits on one card, and one click runs
 * the existing case decisions in order:
 *   1. listing_review / profile_change → approved (publishes, approves locations)
 *   2. each credential the reviewer ticked → registration_checked (method recorded)
 *   3. booking eligibility switched on when every VER-04 check passes
 * Nothing bypasses decideCase / setBookingEligible, so audit, notifications and
 * the server-side eligibility checks are unchanged.
 */

export type ApprovalCard = {
  caseId: string;
  caseType: "listing_review" | "profile_change";
  submittedAt: string;
  practitionerId: string;
  publicId: string;
  displayName: string;
  listingStatus: string;
  email: string | null;
  mobile: string | null;
  about: string | null;
  qualifications: { degree: string; institution: string; completionYear: number | null }[];
  specialties: string[];
  languages: string[];
  credentials: { id: string; type: string; authority: string; number: string | null; status: string; lookupUrl: string | null; sameNumberElsewhere: number }[];
  places: { label: string; kind: string; state: string; services: { name: string; mode: string; minutes: number; pricePaise: number }[] }[];
  changedFields: string[];
};

export async function listApprovals(): Promise<ApprovalCard[]> {
  const res = await db().execute<Record<string, unknown>>(sql`
    SELECT c.id AS "caseId", c.case_type::text AS "caseType", c.submitted_at AS "submittedAt",
      p.id AS "practitionerId", p.public_id AS "publicId", p.display_name AS "displayName", p.listing_status::text AS "listingStatus",
      u.email, u.mobile, pv.structured_content AS content, coalesce(pv.changed_fields, '{}') AS "changedFields",
      (SELECT coalesce(json_agg(s.label ORDER BY s.label), '[]') FROM specialties s
         WHERE s.id::text IN (SELECT x ->> 'specialtyId' FROM jsonb_array_elements(coalesce(pv.structured_content -> 'specialties', '[]'::jsonb)) x)) AS specialties,
      (SELECT coalesce(json_agg(lg.label ORDER BY lg.label), '[]') FROM languages lg
         WHERE lg.id::text IN (SELECT jsonb_array_elements_text(coalesce(pv.structured_content -> 'languages', '[]'::jsonb)))) AS languages,
      (SELECT coalesce(json_agg(json_build_object('id', cr.id, 'type', cr.type, 'authority', a.name, 'number', cr.number_original, 'status', cr.status, 'lookupUrl', a.lookup_url,
          'sameNumberElsewhere', (SELECT count(*) FROM credentials o WHERE o.id <> cr.id AND o.authority_id = cr.authority_id AND o.type = cr.type AND o.number_normalised = cr.number_normalised AND cr.number_normalised IS NOT NULL))
          ORDER BY cr.created_at), '[]')
         FROM credentials cr JOIN credential_authorities a ON a.id = cr.authority_id WHERE cr.practitioner_id = p.id) AS credentials,
      (SELECT coalesce(json_agg(json_build_object(
          'label', CASE WHEN b.kind = 'service_area' THEN 'Home visits · ' || coalesce(l.name, '') || ', ' || coalesce(ci.name, '') ELSE cl.name || ' · ' || concat_ws(', ', b.address_line1, l.name, ci.name) END,
          'kind', b.kind, 'state', pb.state,
          'services', (SELECT coalesce(json_agg(json_build_object('name', o.display_name, 'mode', o.mode, 'minutes', ov.duration_min, 'pricePaise', ov.base_price_paise) ORDER BY ov.base_price_paise), '[]')
             FROM offerings o JOIN offering_versions ov ON ov.id = o.current_version_id WHERE o.practitioner_branch_id = pb.id AND o.active)
          ) ORDER BY pb.created_at), '[]')
         FROM practitioner_branches pb JOIN branches b ON b.id = pb.branch_id JOIN clinics cl ON cl.id = b.clinic_id
           LEFT JOIN localities l ON l.id = b.locality_id LEFT JOIN cities ci ON ci.id = b.city_id
         WHERE pb.practitioner_id = p.id AND pb.state IN ('pending','approved') AND pb.active_to IS NULL) AS places
    FROM verification_cases c
    JOIN practitioners p ON p.id = c.practitioner_id
    LEFT JOIN users u ON u.id = p.owner_user_id
    LEFT JOIN profile_versions pv ON pv.id = CASE WHEN c.subject_type = 'profile_version' THEN c.subject_id ELSE NULL END
    WHERE c.case_type IN ('listing_review', 'profile_change') AND c.state IN ('open', 'in_review')
    ORDER BY (c.case_type = 'listing_review') DESC, c.submitted_at ASC
    LIMIT 50`);
  return res.rows.map((r) => {
    const content = (r.content ?? {}) as { about?: string; qualifications?: { degree: string; institution: string; completionYear: number | null }[] };
    return {
      caseId: r.caseId as string,
      caseType: r.caseType as ApprovalCard["caseType"],
      submittedAt: new Date(r.submittedAt as string).toISOString(),
      practitionerId: r.practitionerId as string,
      publicId: r.publicId as string,
      displayName: r.displayName as string,
      listingStatus: r.listingStatus as string,
      email: (r.email as string | null) ?? null,
      mobile: (r.mobile as string | null) ?? null,
      about: content.about?.trim() || null,
      qualifications: content.qualifications ?? [],
      specialties: r.specialties as string[],
      languages: r.languages as string[],
      credentials: (r.credentials as ApprovalCard["credentials"]).map((c) => ({ ...c, sameNumberElsewhere: Number(c.sameNumberElsewhere) })),
      places: r.places as ApprovalCard["places"],
      changedFields: (r.changedFields as string[]) ?? [],
    };
  });
}

/** Preset reasons keep the decision to one click while still telling the physio what to fix (Section 13). */
export const CHANGE_REASONS: Record<string, string> = {
  registration: "Please check your registration number and council. We could not match it on the council's register.",
  about: "Please write a short About section in your own words: who you help and how you work.",
  services: "Please add at least one service with a fee for each place you practise.",
  location: "Please check your clinic address or home-visit area. It looks incomplete or incorrect.",
  name: "Please use your full name as it appears on your registration.",
};

export const REJECT_REASONS: Record<string, string> = {
  not_physio: "This profile does not appear to belong to a qualified physiotherapist.",
  duplicate: "A profile for this physiotherapist already exists on The Physio Index.",
  test: "This looks like a test or incomplete sign-up.",
};

export async function quickApprove(v: Viewer, input: { caseId: string; practitionerId: string; checkedCredentialIds: string[] }): Promise<string> {
  const parts: string[] = [];
  parts.push(await decideCase(v, { caseId: input.caseId, decision: "approved", reason: "Approved in one-screen review" }));

  // VER-02: a credential is marked checked only when the reviewer ticked it, with the method recorded.
  for (const credentialId of input.checkedCredentialIds) {
    const cred = await db().execute<{ status: string; authority: string }>(sql`
      SELECT c.status::text AS status, a.name AS authority FROM credentials c JOIN credential_authorities a ON a.id = c.authority_id
      WHERE c.id = ${credentialId} AND c.practitioner_id = ${input.practitionerId}`);
    const row = cred.rows[0];
    if (!row || row.status === "registration_checked") continue;
    const { id } = await withTransaction((_c, tx) =>
      openCase(tx, { caseType: "credential_check", subjectType: "credential", subjectId: credentialId, practitionerId: input.practitionerId, submittedByUserId: v.userId }),
    );
    await decideCase(v, {
      caseId: id,
      decision: "approved",
      reason: "Registration checked in one-screen review",
      credentialStatus: "registration_checked",
      method: `Name and number looked up on the ${row.authority} public register by the reviewer`,
      scopeOfCheck: "Name and number matched on the issuer's public register",
      publicNumberApproved: true,
    });
    parts.push("registration marked checked");
  }

  // VER-04: switch booking on only when every server-side check passes; otherwise say what is missing.
  const checks = await bookingEligibilityChecklist(db(), input.practitionerId);
  const failing = checks.filter((c) => !c.ok);
  if (!failing.length) {
    await withTransaction((_c, tx) => setBookingEligible(tx, v, input.practitionerId, true, "Enabled automatically after one-screen approval"));
    parts.push("online booking switched on");
  } else {
    parts.push(`live as enquiry-only (online booking needs: ${failing.map((c) => c.label.toLowerCase()).join("; ")})`);
  }
  return parts.join(" · ");
}

export async function quickDecline(v: Viewer, input: { caseId: string; decision: "changes_requested" | "rejected"; reason: string }): Promise<string> {
  return decideCase(v, { caseId: input.caseId, decision: input.decision, reason: input.reason });
}
