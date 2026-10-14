import { sql } from "drizzle-orm";
import { z } from "zod";
import { db, withTransaction, type Db } from "@/db/client";
import { audit } from "@/lib/audit";
import { ApiError } from "@/lib/api";
import { openCase } from "./cases";
import { textArray } from "@/lib/sql";

/**
 * Profile draft model (PRO-08, PRO-10).
 *
 * The DRAFT lives in profile_versions.structured_content (latest draft or
 * submitted version). The PUBLISHED state is the relational tables
 * (qualifications, experiences, practitioner_specialties, …), which only an
 * admin approval writes. The workspace never writes those tables directly.
 */

const CURRENT_YEAR = new Date().getFullYear();
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

export const IdentitySchema = z.object({
  displayName: z.string().trim().min(2, "Name must be at least 2 characters").max(120, "Name must be at most 120 characters"),
  designation: z.string().trim().max(80).optional().or(z.literal("")),
  headline: z.string().trim().max(160, "Headline must be at most 160 characters").optional().or(z.literal("")),
  gender: z.enum(["female", "male", "non_binary", "unset"]).default("unset"),
});

export const QualificationSchema = z
  .object({
    degree: z.string().trim().min(2).max(120),
    institution: z.string().trim().min(2).max(160),
    completionYear: z.coerce.number().int().min(1950).max(2100).nullable(),
    inProgress: z.boolean().default(false),
  })
  .refine((q) => q.inProgress || q.completionYear === null || q.completionYear <= CURRENT_YEAR, { message: "Completion year cannot be in the future unless in progress", path: ["completionYear"] });

export const ExperienceSchema = z
  .object({
    role: z.string().trim().min(2).max(120),
    organisationName: z.string().trim().min(2).max(160),
    startMonth: z.string().regex(MONTH, "Use YYYY-MM"),
    endMonth: z.string().regex(MONTH, "Use YYYY-MM").nullable(),
    description: z.string().trim().max(600).optional().or(z.literal("")),
  })
  .refine((e) => e.endMonth === null || e.endMonth >= e.startMonth, { message: "End month must not be before start month", path: ["endMonth"] });

export const PortfolioSchema = z.object({
  kind: z.enum(["award", "certification", "membership", "publication", "website", "social"]),
  title: z.string().trim().min(2).max(160),
  issuer: z.string().trim().max(160).optional().or(z.literal("")),
  itemDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD").nullable(),
  url: z.url("Enter a valid link").max(300).nullable(),
  description: z.string().trim().max(400).optional().or(z.literal("")),
});

export const SpecialtiesSchema = z
  .array(z.object({ specialtyId: z.uuid(), isPrimary: z.boolean() }))
  .max(8)
  .refine((s) => s.filter((x) => x.isPrimary).length <= 1, { message: "Choose one primary area of practice" });

export const DraftSchema = z.object({
  identity: IdentitySchema.optional(),
  about: z.string().optional(),
  qualifications: z.array(QualificationSchema).optional(),
  experiences: z.array(ExperienceSchema).optional(),
  specialties: SpecialtiesSchema.optional(),
  languages: z.array(z.uuid()).max(10).optional(),
  portfolio: z.array(PortfolioSchema).max(20).optional(),
});

export type ProfileDraft = z.infer<typeof DraftSchema>;

export type DraftVersion = { id: string; version: number; state: string; content: ProfileDraft; submittedAt: string | null; decisionReason: string | null };

/** Latest version regardless of state (the working copy, or what is under review / was decided last). */
export async function getLatestVersion(practitionerId: string, d: Db = db()): Promise<DraftVersion | null> {
  const res = await d.execute<{ id: string; version: number; state: string; structured_content: ProfileDraft; submitted_at: string | null; decision_reason: string | null }>(sql`
    SELECT id, version, state::text AS state, structured_content, submitted_at, decision_reason
    FROM profile_versions WHERE practitioner_id = ${practitionerId} ORDER BY version DESC LIMIT 1`);
  const r = res.rows[0];
  return r ? { id: r.id, version: Number(r.version), state: r.state, content: r.structured_content ?? {}, submittedAt: r.submitted_at, decisionReason: r.decision_reason } : null;
}

/**
 * Merges a section patch into the working draft. An editable draft row is
 * updated in place; otherwise a new version is created from the latest content
 * (approved versions stay immutable, PRO-10).
 */
export async function saveDraftSection(
  practitionerId: string,
  actorUserId: string,
  section: keyof ProfileDraft,
  value: ProfileDraft[keyof ProfileDraft],
): Promise<DraftVersion> {
  const patch = DraftSchema.parse({ [section]: value });
  return withTransaction(async (_client, tx) => {
    const latest = await getLatestVersion(practitionerId, tx);
    const merged: ProfileDraft = { ...(latest?.content ?? {}), ...patch };
    const changed = Array.from(new Set([...(latest?.state === "draft" ? await changedFieldsOf(tx, latest.id) : []), section]));
    let out: DraftVersion;
    if (latest && latest.state === "draft") {
      await tx.execute(sql`UPDATE profile_versions SET structured_content = ${JSON.stringify(merged)}::jsonb, changed_fields = ${textArray(changed)} WHERE id = ${latest.id}`);
      out = { ...latest, content: merged };
    } else {
      const version = (latest?.version ?? 0) + 1;
      const res = await tx.execute<{ id: string }>(sql`
        INSERT INTO profile_versions (practitioner_id, version, state, structured_content, changed_fields, created_by_user_id)
        VALUES (${practitionerId}, ${version}, 'draft', ${JSON.stringify(merged)}::jsonb, ${textArray([section])}, ${actorUserId}) RETURNING id`);
      out = { id: res.rows[0].id, version, state: "draft", content: merged, submittedAt: null, decisionReason: null };
    }
    // Identity fields are mirrored on the practitioner row only while the listing is not yet published;
    // after publication they change through approval (VER-05).
    if (section === "identity" && patch.identity) {
      await tx.execute(sql`
        UPDATE practitioners SET display_name = ${patch.identity.displayName}, designation = ${patch.identity.designation || null},
          headline = ${patch.identity.headline || null}, gender = ${patch.identity.gender}::gender_pref
        WHERE id = ${practitionerId} AND listing_status IN ('draft', 'rejected', 'changes_requested')`);
    }
    await audit({ actorUserId, action: "profile.draft.save", objectType: "profile_version", objectId: out.id, changedFields: { section } }, tx);
    return out;
  });
}

async function changedFieldsOf(tx: Db, versionId: string): Promise<string[]> {
  const res = await tx.execute<{ changed_fields: string[] | null }>(sql`SELECT changed_fields FROM profile_versions WHERE id = ${versionId}`);
  return res.rows[0]?.changed_fields ?? [];
}

/** Mandatory fields for a submitted profile (PRO-03, PRO-08). Returns human-readable gaps. */
export function validateForSubmission(content: ProfileDraft, extra: { credentialCount: number; branchCount: number; offeringCount: number; consents: boolean }): string[] {
  const gaps: string[] = [];
  const id = content.identity;
  if (!id || id.displayName.trim().length < 2) gaps.push("Name (2–120 characters)");
  if (!id?.designation) gaps.push("Designation");
  if (!content.about || content.about.trim().length < 100) gaps.push("About section (at least 100 characters)");
  if (!content.qualifications?.length) gaps.push("At least one qualification");
  if (extra.credentialCount === 0) gaps.push("At least one registration or enrolment credential");
  if (!content.specialties?.some((s) => s.isPrimary)) gaps.push("A primary area of practice");
  if (!content.languages?.length) gaps.push("At least one language");
  if (extra.branchCount === 0) gaps.push("At least one clinic location");
  if (extra.offeringCount === 0) gaps.push("At least one service with a fee");
  if (!extra.consents) gaps.push("Publication consent and provider terms");
  return gaps;
}

/**
 * Submits the working draft for review: version state → submitted,
 * listing_status → submitted (first listing) and a review case (PRO-03,
 * VER-05). Returns the case id.
 */
export async function submitDraft(practitionerId: string, actorUserId: string, opts: { published: boolean }): Promise<string> {
  return withTransaction(async (_client, tx) => {
    const latest = await getLatestVersion(practitionerId, tx);
    if (!latest || latest.state !== "draft") throw new ApiError("CONFLICT", latest?.state === "submitted" ? "This profile is already under review" : "There are no unsaved changes to submit");
    await tx.execute(sql`UPDATE profile_versions SET state = 'submitted', submitted_at = now() WHERE id = ${latest.id}`);
    if (!opts.published) {
      await tx.execute(sql`UPDATE practitioners SET listing_status = 'submitted' WHERE id = ${practitionerId} AND listing_status IN ('draft', 'rejected', 'changes_requested')`);
    }
    const caseId = await openCase(
      { caseType: opts.published ? "profile_change" : "listing_review", subjectType: "profile_version", subjectId: latest.id, practitionerId, submittedByUserId: actorUserId },
      tx,
    );
    await tx.execute(sql`UPDATE profile_versions SET case_id = ${caseId} WHERE id = ${latest.id}`);
    await audit({ actorUserId, action: opts.published ? "profile.change.submit" : "listing.submit", objectType: "profile_version", objectId: latest.id, changedFields: { caseId } }, tx);
    return caseId;
  });
}
