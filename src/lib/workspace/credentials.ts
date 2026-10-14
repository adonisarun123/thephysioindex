import { sql } from "drizzle-orm";
import { z } from "zod";
import { db, withTransaction } from "@/db/client";
import { audit } from "@/lib/audit";
import { ApiError } from "@/lib/api";
import { normaliseRegistrationNumber } from "@/lib/slug";
import { credentialTypeForAuthority } from "./catalog";
import { flagDuplicateByCredential } from "./claims";
import { openCase } from "./cases";

/**
 * Self-declared credentials (VER-01). Status starts at self_declared; only a
 * reviewer moves it. Registration numbers are stored as text with a normalised
 * copy for duplicate detection (PRO-05, DAT-21).
 */

export const CredentialInputSchema = z.object({
  authorityId: z.uuid("Choose an authority"),
  type: z.enum(["statutory_registration", "enrolment", "degree", "association_membership", "certification"]).optional(),
  number: z.string().trim().min(2, "Enter the number as printed").max(60),
  issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD").optional(),
  expiresOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD").optional(),
});

export type CredentialInput = z.infer<typeof CredentialInputSchema>;

export async function addCredential(practitionerId: string, actorUserId: string, input: CredentialInput, opts: { openReviewCase: boolean }): Promise<{ id: string; duplicateWarning: boolean }> {
  const normalised = normaliseRegistrationNumber(input.number);
  return withTransaction(async (_c, tx) => {
    const auth = await tx.execute<{ id: string; kind: string }>(sql`SELECT id, kind::text AS kind FROM credential_authorities WHERE id = ${input.authorityId} AND active`);
    const a = auth.rows[0];
    if (!a) throw new ApiError("NOT_FOUND", "Authority not found");
    const type = input.type ?? credentialTypeForAuthority(a.kind);
    const same = await tx.execute<{ id: string }>(sql`SELECT id FROM credentials WHERE practitioner_id = ${practitionerId} AND authority_id = ${a.id} AND type = ${type}::credential_type AND number_normalised = ${normalised}`);
    if (same.rows[0]) throw new ApiError("CONFLICT", "This credential is already on your profile");
    const ins = await tx.execute<{ id: string }>(sql`
      INSERT INTO credentials (practitioner_id, authority_id, type, number_original, number_normalised, issue_date, expires_on, status, source)
      VALUES (${practitionerId}, ${a.id}, ${type}::credential_type, ${input.number}, ${normalised}, ${input.issueDate ?? null}, ${input.expiresOn ?? null}, 'self_declared', 'self_declared') RETURNING id`);
    const id = ins.rows[0].id;
    await audit({ actorUserId, action: "credential.add", objectType: "credential", objectId: id, changedFields: { type, authorityId: a.id } }, tx);
    // VER-05: new registration details on a published profile trigger renewed review.
    if (opts.openReviewCase) await openCase({ caseType: "credential_check", subjectType: "credential", subjectId: id, practitionerId, submittedByUserId: actorUserId }, tx);
    const duplicateWarning = await flagDuplicateByCredential(tx, practitionerId, a.id, normalised, actorUserId);
    return { id, duplicateWarning };
  });
}

/** Only self-declared, unreviewed rows may be removed by the practitioner; reviewed history stays (VER-02). */
export async function removeCredential(practitionerId: string, actorUserId: string, credentialId: string): Promise<void> {
  const res = await db().execute(sql`DELETE FROM credentials WHERE id = ${credentialId} AND practitioner_id = ${practitionerId} AND status IN ('self_declared', 'pending')`);
  if (res.rowCount === 0) throw new ApiError("CONFLICT", "Reviewed credentials cannot be removed here; ask support to correct them");
  await audit({ actorUserId, action: "credential.remove", objectType: "credential", objectId: credentialId });
}
