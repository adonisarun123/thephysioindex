import { createHmac, timingSafeEqual } from "node:crypto";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { db, withTransaction } from "@/db/client";
import { ApiError } from "@/lib/api";
import { audit } from "@/lib/audit";
import { openCase } from "@/lib/admin/cases";
import { deleteFile, fitUrl, reviewPhotoFolder, type ImageKitFile } from "@/lib/media/imagekit";
import { looksLikeContactDetails } from "@/lib/reviews";
import { MAX_REVIEW_PHOTOS, PATIENT_CONSENT_STATEMENT, verifyUpload } from "@/lib/treatment-photos";

/**
 * Reviews from patients a physiotherapist invites (owner decision 11 Nov 2026).
 *
 * REV-01 ties a review to a completed platform booking. Most patients are
 * still treated outside the platform, so a physiotherapist can also send a
 * one-use link. Such a review:
 *  - needs the patient to sign in with a one-time code, so it belongs to a
 *    verified account, one per account per physiotherapist;
 *  - is stored with source `invitation` and always shown as "Invited by the
 *    physiotherapist", apart from booking reviews;
 *  - is left out of the headline rating and of structured data, because the
 *    physiotherapist chose whom to ask;
 *  - goes through the same moderation queue as every other review (REV-03).
 * The link token is an HMAC of the invitation id and its version; nothing
 * secret is stored.
 */

export const INVITE_TTL_DAYS = 30;
export const MAX_INVITES_PER_DAY = 10;
export const MAX_OPEN_INVITES = 40;

function secret(): string {
  const s = process.env.REVIEW_LINK_SECRET ?? process.env.BETTER_AUTH_SECRET;
  if (!s) throw new ApiError("INTERNAL", "Review links are not configured");
  return s;
}
const mac = (id: string, version: number) => createHmac("sha256", secret()).update(`tpi-review-invite:${id}:${version}`).digest().subarray(0, 18);

export function invitationToken(id: string, version: number): string {
  return `${Buffer.from(id.replace(/-/g, ""), "hex").toString("base64url")}.${mac(id, version).toString("base64url")}`;
}

export function parseInvitationToken(token: string): { id: string; tag: Buffer } | null {
  const m = /^([A-Za-z0-9_-]{22})\.([A-Za-z0-9_-]{24})$/.exec(token);
  if (!m) return null;
  const hex = Buffer.from(m[1], "base64url").toString("hex");
  if (hex.length !== 32) return null;
  return { id: `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`, tag: Buffer.from(m[2], "base64url") };
}

export type InvitationStatus = "open" | "reviewed" | "expired" | "cancelled";
export type Invitation = { id: string; patientLabel: string; status: InvitationStatus; token: string; createdAt: Date; expiresAt: Date; reviewState: string | null };

function statusOf(r: { revoked_at: unknown; used_at: unknown; expires_at: Date | string }): InvitationStatus {
  if (r.used_at) return "reviewed";
  if (r.revoked_at) return "cancelled";
  return new Date(r.expires_at).getTime() < Date.now() ? "expired" : "open";
}

const Label = z.string().trim().min(1, "Enter the patient's name as you know them").max(60, "Keep the name under 60 characters");

export async function createInvitation(p: { id: string; listingStatus: string }, userId: string, patientLabel: string): Promise<{ id: string; token: string }> {
  const label = Label.parse(patientLabel);
  if (p.listingStatus !== "published") throw new ApiError("CONFLICT", "You can invite patients to review you once your profile is approved and published");
  return withTransaction(async (_c, tx) => {
    await tx.execute(sql`SELECT id FROM practitioners WHERE id = ${p.id} FOR UPDATE`); // serialises the limits below
    const n = (await tx.execute<{ today: number | string; open: number | string }>(sql`
      SELECT count(*) FILTER (WHERE created_at > now() - interval '24 hours') AS today,
             count(*) FILTER (WHERE used_at IS NULL AND revoked_at IS NULL AND expires_at > now()) AS open
      FROM review_invitations WHERE practitioner_id = ${p.id}`)).rows[0];
    if (Number(n?.today ?? 0) >= MAX_INVITES_PER_DAY) throw new ApiError("RATE_LIMITED", `You can send ${MAX_INVITES_PER_DAY} review invitations a day. Try again tomorrow.`);
    if (Number(n?.open ?? 0) >= MAX_OPEN_INVITES) throw new ApiError("CONFLICT", "You have many invitations still unanswered. Cancel some before sending more.");
    const ins = await tx.execute<{ id: string; token_version: number }>(sql`
      INSERT INTO review_invitations (practitioner_id, created_by_user_id, patient_label, expires_at)
      VALUES (${p.id}, ${userId}, ${label}, now() + make_interval(days => ${INVITE_TTL_DAYS})) RETURNING id, token_version`);
    const row = ins.rows[0];
    await audit({ actorUserId: userId, actorRole: "practitioner", action: "review_invitation.create", objectType: "review_invitation", objectId: row.id, changedFields: { practitionerId: p.id } }, tx);
    return { id: row.id, token: invitationToken(row.id, Number(row.token_version)) };
  });
}

export async function listInvitations(practitionerId: string): Promise<Invitation[]> {
  const res = await db().execute<{ id: string; patient_label: string; token_version: number; created_at: Date | string; expires_at: Date | string; revoked_at: unknown; used_at: unknown; review_state: string | null }>(sql`
    SELECT i.id, i.patient_label, i.token_version, i.created_at, i.expires_at, i.revoked_at, i.used_at,
      (SELECT r.state::text FROM reviews r WHERE r.invitation_id = i.id) AS review_state
    FROM review_invitations i WHERE i.practitioner_id = ${practitionerId}
    ORDER BY i.created_at DESC LIMIT 100`);
  return res.rows.map((r) => ({ id: r.id, patientLabel: r.patient_label, status: statusOf(r), token: invitationToken(r.id, Number(r.token_version)), createdAt: new Date(r.created_at), expiresAt: new Date(r.expires_at), reviewState: r.review_state }));
}

export async function revokeInvitation(practitionerId: string, userId: string, invitationId: string): Promise<void> {
  const res = await db().execute(sql`
    UPDATE review_invitations SET revoked_at = now()
    WHERE id = ${invitationId} AND practitioner_id = ${practitionerId} AND used_at IS NULL AND revoked_at IS NULL RETURNING id`);
  if (!res.rows.length) throw new ApiError("NOT_FOUND", "Invitation not found or already used");
  await audit({ actorUserId: userId, actorRole: "practitioner", action: "review_invitation.revoke", objectType: "review_invitation", objectId: invitationId });
}

export type ResolvedInvitation = {
  id: string;
  status: InvitationStatus;
  practitioner: { id: string; displayName: string; path: string; ownerUserId: string | null; published: boolean };
};

/** Looks a link up. Returns null for anything malformed or forged, without saying which. */
export async function resolveInvitation(token: string): Promise<ResolvedInvitation | null> {
  const parsed = parseInvitationToken(token);
  if (!parsed) return null;
  const res = await db().execute<{ id: string; token_version: number; expires_at: Date | string; revoked_at: unknown; used_at: unknown; practitioner_id: string; display_name: string; slug: string; public_id: string; owner_user_id: string | null; listing_status: string }>(sql`
    SELECT i.id, i.token_version, i.expires_at, i.revoked_at, i.used_at, p.id AS practitioner_id, p.display_name, p.slug, p.public_id, p.owner_user_id, p.listing_status::text AS listing_status
    FROM review_invitations i JOIN practitioners p ON p.id = i.practitioner_id WHERE i.id = ${parsed.id} LIMIT 1`);
  const r = res.rows[0];
  if (!r) return null;
  const expected = mac(r.id, Number(r.token_version));
  if (parsed.tag.length !== expected.length || !timingSafeEqual(parsed.tag, expected)) return null;
  return {
    id: r.id,
    status: statusOf(r),
    practitioner: { id: r.practitioner_id, displayName: r.display_name, path: `/physiotherapist/${r.slug}-${r.public_id}`, ownerUserId: r.owner_user_id, published: r.listing_status === "published" },
  };
}

export const InvitedReviewInput = z.object({
  rating: z.coerce.number().int().min(1, "Choose a rating from 1 to 5").max(5, "Choose a rating from 1 to 5"),
  text: z.string().trim().min(20, "Write at least 20 characters about your experience").max(2000),
  displayName: z.string().trim().min(2, "Enter the name to show").max(40, "Keep the display name under 40 characters"),
  confirmedGenuine: z.literal(true, { message: "Confirm this is your own experience as a patient" }),
  photoFileIds: z.array(z.string().min(6).max(64)).max(MAX_REVIEW_PHOTOS, `You can add up to ${MAX_REVIEW_PHOTOS} photos`).default([]),
  photoConsent: z.boolean().default(false),
});

/** Is this account on the practitioner's side of the profile (owner or team)? They cannot review it. */
async function isPracticeSide(userId: string, practitionerId: string, ownerUserId: string | null): Promise<boolean> {
  if (ownerUserId === userId) return true;
  const res = await db().execute(sql`
    SELECT 1 FROM role_assignments WHERE user_id = ${userId} AND scope_type = 'practitioner' AND scope_id = ${practitionerId} AND revoked_at IS NULL LIMIT 1`);
  return res.rows.length > 0;
}

export async function submitInvitedReview(userId: string, token: string, raw: unknown): Promise<string> {
  const input = InvitedReviewInput.parse(raw);
  const inv = await resolveInvitation(token);
  if (!inv) throw new ApiError("NOT_FOUND", "This review link is not valid");
  if (inv.status !== "open") throw new ApiError("CONFLICT", inv.status === "reviewed" ? "This link has already been used for a review" : "This review link is no longer active. Ask your physiotherapist for a new one.");
  if (!inv.practitioner.published) throw new ApiError("CONFLICT", "This profile is not public at the moment");
  if (await isPracticeSide(userId, inv.practitioner.id, inv.practitioner.ownerUserId)) throw new ApiError("UNAUTHORISED", "You cannot review your own profile or one you help manage");
  if (/^\d|@|https?:\/\//i.test(input.displayName) || looksLikeContactDetails(input.displayName)) throw new ApiError("INVALID_INPUT", "The display name cannot contain contact details or links");
  if (input.photoFileIds.length && !input.photoConsent) throw new ApiError("INVALID_INPUT", "Tick the box to agree to your photos being shown, or remove the photos");

  // Network first, database after (no I/O while holding locks).
  const files: ImageKitFile[] = [];
  try {
    for (const fileId of [...new Set(input.photoFileIds)]) files.push(await verifyUpload(fileId, reviewPhotoFolder(inv.id)));
  } catch (err) {
    for (const f of files) await deleteFile(f.fileId);
    throw err;
  }

  try {
    return await withTransaction(async (_c, tx) => {
      const locked = (await tx.execute<{ used_at: unknown; revoked_at: unknown; expires_at: Date | string }>(sql`SELECT used_at, revoked_at, expires_at FROM review_invitations WHERE id = ${inv.id} FOR UPDATE`)).rows[0];
      if (!locked || statusOf(locked) !== "open") throw new ApiError("CONFLICT", "This link has already been used for a review");
      const dup = await tx.execute(sql`SELECT 1 FROM reviews WHERE practitioner_id = ${inv.practitioner.id} AND author_user_id = ${userId} AND source = 'invitation' AND state <> 'withdrawn' LIMIT 1`);
      if (dup.rows.length) throw new ApiError("CONFLICT", "You have already reviewed this physiotherapist");
      const ins = await tx.execute<{ id: string }>(sql`
        INSERT INTO reviews (practitioner_id, source, invitation_id, author_user_id, rating, text, display_name, state)
        VALUES (${inv.practitioner.id}, 'invitation', ${inv.id}, ${userId}, ${input.rating}, ${input.text}, ${input.displayName}, 'pending') RETURNING id`);
      const reviewId = ins.rows[0].id;
      await tx.execute(sql`UPDATE review_invitations SET used_at = now() WHERE id = ${inv.id}`);
      for (const f of files) {
        await tx.execute(sql`
          INSERT INTO treatment_photos (practitioner_id, kind, review_id, uploaded_by_user_id, object_key, external_id, mime, bytes, width, height, consent_basis, consent_statement)
          VALUES (${inv.practitioner.id}, 'review', ${reviewId}, ${userId}, ${f.filePath}, ${f.fileId}, ${f.mime ?? "image/jpeg"}, ${f.size}, ${f.width}, ${f.height}, 'patient_own', ${PATIENT_CONSENT_STATEMENT})`);
      }
      const flagged = looksLikeContactDetails(input.text);
      await openCase(tx, {
        caseType: "review_moderation",
        subjectType: "review",
        subjectId: reviewId,
        practitionerId: inv.practitioner.id,
        submittedByUserId: userId,
        priority: flagged ? "high" : "normal",
        evidence: { kind: "review", source: "invitation", rating: input.rating, photos: files.length, contactDetailsSuspected: flagged },
      });
      await audit({ actorUserId: userId, actorRole: "patient", action: "review.submit", objectType: "review", objectId: reviewId, changedFields: { rating: input.rating, source: "invitation", invitationId: inv.id, photos: files.length, photoConsent: files.length ? true : undefined } }, tx);
      return reviewId;
    });
  } catch (err) {
    for (const f of files) await deleteFile(f.fileId);
    throw err;
  }
}

export type OwnInvitedReview = { id: string; rating: number; text: string | null; displayName: string; state: string; moderationReason: string | null; photos: { id: string; url: string | null }[] };

/** The signed-in author's review of this practitioner, if they have written one from an invitation. */
export async function getOwnInvitedReview(userId: string, practitionerId: string): Promise<OwnInvitedReview | null> {
  const res = await db().execute<{ id: string; rating: number; text: string | null; display_name: string; state: string; moderation_reason: string | null }>(sql`
    SELECT id, rating, text, display_name, state::text AS state, moderation_reason FROM reviews
    WHERE practitioner_id = ${practitionerId} AND author_user_id = ${userId} AND source = 'invitation' AND state <> 'withdrawn'
    ORDER BY created_at DESC LIMIT 1`);
  const r = res.rows[0];
  if (!r) return null;
  const ph = await db().execute<{ id: string; object_key: string }>(sql`SELECT id, object_key FROM treatment_photos WHERE review_id = ${r.id} AND removed_at IS NULL ORDER BY created_at`);
  return { id: r.id, rating: Number(r.rating), text: r.text, displayName: r.display_name, state: r.state, moderationReason: r.moderation_reason, photos: ph.rows.map((p) => ({ id: p.id, url: fitUrl(p.object_key, 320) })) };
}

/** The author can take their invited review down at any time; its photos are deleted with it. */
export async function withdrawInvitedReview(userId: string, reviewId: string): Promise<void> {
  const files = await withTransaction(async (_c, tx) => {
    const r = (await tx.execute<{ id: string; state: string }>(sql`SELECT id, state::text AS state FROM reviews WHERE id = ${reviewId} AND author_user_id = ${userId} AND source = 'invitation' FOR UPDATE`)).rows[0];
    if (!r) throw new ApiError("NOT_FOUND", "Review not found");
    if (r.state === "withdrawn") return [];
    await tx.execute(sql`UPDATE reviews SET state = 'withdrawn' WHERE id = ${r.id}`);
    await tx.execute(sql`
      UPDATE verification_cases SET state = 'closed', decision = 'dismissed', decision_reason = 'withdrawn by the author', decided_at = now()
      WHERE subject_type = 'review' AND subject_id = ${r.id} AND state IN ('open', 'in_review', 'awaiting_evidence')`);
    const ph = await tx.execute<{ external_id: string }>(sql`
      UPDATE treatment_photos SET removed_at = now(), removed_reason = 'Review withdrawn by its author' WHERE review_id = ${r.id} AND removed_at IS NULL RETURNING external_id`);
    await audit({ actorUserId: userId, actorRole: "patient", action: "review.withdraw", objectType: "review", objectId: r.id, changedFields: { state: { from: r.state, to: "withdrawn" }, source: "invitation" } }, tx);
    return ph.rows;
  });
  for (const f of files) await deleteFile(f.external_id);
}

/** The author can remove one of their review photos without withdrawing the review. */
export async function removeOwnReviewPhoto(userId: string, photoId: string): Promise<void> {
  const res = await db().execute<{ external_id: string }>(sql`
    UPDATE treatment_photos SET removed_at = now(), removed_reason = 'Removed by the patient'
    WHERE id = ${photoId} AND kind = 'review' AND uploaded_by_user_id = ${userId} AND removed_at IS NULL RETURNING external_id`);
  if (!res.rows[0]) throw new ApiError("NOT_FOUND", "Photo not found");
  await audit({ actorUserId: userId, actorRole: "patient", action: "treatment_photo.remove", objectType: "treatment_photo", objectId: photoId });
  await deleteFile(res.rows[0].external_id);
}
