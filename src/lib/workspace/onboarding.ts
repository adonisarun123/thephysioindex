import { sql } from "drizzle-orm";
import { db, withTransaction } from "@/db/client";
import { audit } from "@/lib/audit";
import { ApiError } from "@/lib/api";
import { newPublicId } from "@/lib/public-id";
import { slugify } from "@/lib/slug";
import { getLatestVersion, type ProfileDraft } from "./draft";
import { consentState, listAssociations, listCredentials } from "./queries";

/** Creation wizard support (PRO-02, PRO-03). The practitioner row exists from step one so drafts are resumable. */

export const STEPS = ["identity", "credentials", "practice", "services", "consent", "review"] as const;
export type Step = (typeof STEPS)[number];

export function nextStep(step: Step): Step {
  const i = STEPS.indexOf(step);
  return STEPS[Math.min(STEPS.length - 1, i + 1)];
}

export async function createPractitioner(ownerUserId: string, identity: NonNullable<ProfileDraft["identity"]>): Promise<string> {
  return withTransaction(async (_c, tx) => {
    const existing = await tx.execute<{ id: string }>(sql`SELECT id FROM practitioners WHERE owner_user_id = ${ownerUserId} AND listing_status <> 'archived' LIMIT 1`);
    if (existing.rows[0]) throw new ApiError("CONFLICT", "You already have a profile");
    const publicId = newPublicId();
    const ins = await tx.execute<{ id: string }>(sql`
      INSERT INTO practitioners (public_id, slug, owner_user_id, claim_state, listing_status, source, display_name, designation, headline, gender)
      VALUES (${publicId}, ${slugify(identity.displayName) || "physiotherapist"}, ${ownerUserId}, 'claimed', 'draft', 'self_created', ${identity.displayName}, ${identity.designation || null}, ${identity.headline || null}, ${identity.gender}::gender_pref)
      RETURNING id`);
    const id = ins.rows[0].id;
    await tx.execute(sql`INSERT INTO calendar_resources (practitioner_id, timezone) VALUES (${id}, 'Asia/Kolkata')`);
    await tx.execute(sql`
      INSERT INTO profile_versions (practitioner_id, version, state, structured_content, changed_fields, created_by_user_id)
      VALUES (${id}, 1, 'draft', ${JSON.stringify({ identity })}::jsonb, ARRAY['identity'], ${ownerUserId})`);
    // The account becomes a practitioner account: default landing is the workspace and the
    // placeholder name from phone sign-up ("Patient") is replaced where it would show to reviewers.
    await tx.execute(sql`UPDATE users SET display_name = ${identity.displayName} WHERE id = ${ownerUserId} AND (display_name IS NULL OR display_name = 'Patient')`);
    await tx.execute(sql`UPDATE auth."user" SET kind = 'practitioner', name = CASE WHEN name IS NULL OR name = 'Patient' THEN ${identity.displayName} ELSE name END, updated_at = now()
      WHERE id = (SELECT auth_subject::uuid FROM users WHERE id = ${ownerUserId}) AND coalesce(kind, 'patient') = 'patient'`);
    // Owner role scoped to the new practitioner; the viewer's kind becomes practitioner for the default landing.
    await tx.execute(sql`
      INSERT INTO role_assignments (user_id, role, scope_type, scope_id, permissions, reason)
      VALUES (${ownerUserId}, 'practitioner', 'practitioner', ${id}, '["*"]'::jsonb, 'self_created')
      ON CONFLICT DO NOTHING`);
    await audit({ actorUserId: ownerUserId, action: "practitioner.create", objectType: "practitioner", objectId: id, changedFields: { publicId } }, tx);
    return id;
  });
}

/** Captures publication consent and provider terms at their current versions (PRO-03, SEC-07). Append-only. */
export async function recordConsents(practitionerId: string, actorUserId: string, versions: { providerTerms: string; privacyNotice: string }): Promise<void> {
  await withTransaction(async (_c, tx) => {
    for (const [purpose, version] of [
      ["profile_publication", versions.privacyNotice],
      ["provider_terms", versions.providerTerms],
    ] as const) {
      await tx.execute(sql`
        INSERT INTO consent_records (subject_type, subject_id, purpose, notice_version, action, source, actor_user_id)
        VALUES ('practitioner', ${practitionerId}, ${purpose}::consent_purpose, ${version}, 'granted', 'web', ${actorUserId})`);
    }
    await audit({ actorUserId, action: "consent.grant", objectType: "practitioner", objectId: practitionerId, changedFields: versions }, tx);
  });
}

export type OnboardingStatus = {
  draft: ProfileDraft;
  versionState: string | null;
  credentialCount: number;
  branchCount: number;
  offeringCount: number;
  consents: boolean;
  completed: Record<Step, boolean>;
};

export async function onboardingStatus(practitionerId: string): Promise<OnboardingStatus> {
  const [latest, creds, assoc, consents] = await Promise.all([getLatestVersion(practitionerId), listCredentials(practitionerId), listAssociations(practitionerId), consentState(practitionerId)]);
  const draft = latest?.content ?? {};
  const live = assoc.filter((a) => a.state !== "ended" && a.state !== "rejected");
  const offeringCount = live.reduce((n, a) => n + a.offerings.length, 0);
  const consentOk = Boolean(consents.profilePublication && consents.providerTerms);
  return {
    draft,
    versionState: latest?.state ?? null,
    credentialCount: creds.length,
    branchCount: live.length,
    offeringCount,
    consents: consentOk,
    completed: {
      identity: Boolean(draft.identity?.displayName),
      credentials: creds.length > 0 && (draft.qualifications?.length ?? 0) > 0,
      practice: live.length > 0,
      services: offeringCount > 0,
      consent: consentOk,
      review: latest?.state === "submitted" || latest?.state === "approved",
    },
  };
}

/** Pending actions for the overview (Section 15). */
export async function pendingActions(practitionerId: string, listingStatus: string): Promise<{ label: string; href: string }[]> {
  const s = await onboardingStatus(practitionerId);
  const out: { label: string; href: string }[] = [];
  if (!s.completed.identity) out.push({ label: "Complete your identity details", href: "/workspace/profile#identity" });
  if (!s.draft.about || s.draft.about.length < 100) out.push({ label: "Write your About section (at least 100 characters)", href: "/workspace/profile#about" });
  if (s.credentialCount === 0) out.push({ label: "Add a registration or enrolment credential", href: "/workspace/profile#credentials" });
  if (s.branchCount === 0) out.push({ label: "Add a clinic", href: "/workspace/clinics" });
  if (s.offeringCount === 0) out.push({ label: "Add services and fees", href: "/workspace/clinics" });
  if (!s.consents) out.push({ label: "Accept provider terms and publication consent", href: "/workspace/onboarding?step=consent" });
  if (["draft", "rejected", "changes_requested"].includes(listingStatus) && s.versionState === "draft") out.push({ label: "Submit your profile for review", href: "/workspace/profile#submit" });
  const rules = await db().execute<{ n: string | number }>(sql`SELECT count(*) AS n FROM availability_rules r JOIN calendar_resources cr ON cr.id = r.resource_id WHERE cr.practitioner_id = ${practitionerId} AND (r.effective_to IS NULL OR r.effective_to >= current_date)`);
  if (Number(rules.rows[0]?.n ?? 0) === 0) out.push({ label: "Publish weekly availability", href: "/workspace/calendar" });
  return out;
}
