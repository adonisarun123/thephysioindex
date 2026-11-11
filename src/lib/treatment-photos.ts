import { sql } from "drizzle-orm";
import { db, withTransaction, type Db } from "@/db/client";
import { ApiError } from "@/lib/api";
import { audit } from "@/lib/audit";
import { deleteFile, fitUrl, getFile, patientPhotoFolder, PHOTO_MAX_BYTES, PHOTO_MIME, type ImageKitFile } from "@/lib/media/imagekit";

/**
 * Photographs of patients on public profiles (owner decision 11 Nov 2026).
 *
 * A photograph of someone at a physiotherapy clinic says something about
 * their health, so the rules are strict:
 *  - A physiotherapist may upload a photo only with a recorded declaration
 *    that they hold the patient's written consent. The exact wording agreed to
 *    is stored on the row with the time and the account.
 *  - A patient may attach photos to their own invited review; that is their
 *    own consent, recorded the same way.
 *  - Nothing is public until a moderator approves it (PRO-10 spirit), and a
 *    photo can be taken down at once by its uploader or by staff. Removal is
 *    permanent and deletes the file from ImageKit.
 * Uploads follow the profile-photo pattern: the browser sends the file to
 * ImageKit with a short-lived signature, the server re-reads it and checks
 * folder, type and size before recording anything.
 */

export const PRACTITIONER_CONSENT_STATEMENT =
  "I hold this patient's written consent to publish this photograph on my public profile on The Physio Index, I will give The Physio Index a copy of that consent if asked, and I will remove the photograph at once if the patient asks. The patient is an adult, or I hold a parent's or guardian's written consent.";
export const PATIENT_CONSENT_STATEMENT =
  "These are my own photographs. I agree to The Physio Index showing them publicly with my review, and I know I can remove them at any time.";

export const MAX_GALLERY_PHOTOS = 12;
export const MAX_REVIEW_PHOTOS = 3;
const CAPTION_MAX = 140;

/** Captions describe the setting, never the person: no names with titles, numbers or contact details. */
export function cleanCaption(input: string | undefined | null): string | null {
  const c = (input ?? "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim().slice(0, CAPTION_MAX);
  if (!c) return null;
  if (/[\w.+-]+@[\w-]+\.[\w.]+/.test(c) || /(?:\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}\b/.test(c)) throw new ApiError("INVALID_INPUT", "A caption cannot contain a phone number or email address");
  return c;
}

/** Re-reads an upload from ImageKit and checks it; a file that fails is deleted. Network only, no database. */
export async function verifyUpload(fileId: string, folder: string): Promise<ImageKitFile> {
  const file = await getFile(fileId);
  if (!file) throw new ApiError("NOT_FOUND", "Upload not found. Try again.");
  const reject = async (msg: string): Promise<never> => {
    await deleteFile(file.fileId);
    throw new ApiError("INVALID_INPUT", msg);
  };
  if (!file.filePath.startsWith(`${folder}/`)) await reject("That upload does not belong here");
  if (file.fileType !== "image" || (file.mime && !(PHOTO_MIME as readonly string[]).includes(file.mime))) await reject("Use a JPG, PNG or WebP photo");
  if (file.size <= 0 || file.size > PHOTO_MAX_BYTES) await reject("Photo must be under 5 MB");
  if (file.width != null && file.height != null && (file.width < 300 || file.height < 300)) await reject("Photo is too small. Use one at least 300 pixels on each side.");
  return file;
}

export type OwnPhoto = { id: string; url: string | null; caption: string | null; state: "pending" | "approved" | "rejected" | "appealed"; moderationReason: string | null; createdAt: Date };

export async function listOwnPhotos(practitionerId: string): Promise<OwnPhoto[]> {
  const res = await db().execute<{ id: string; object_key: string; caption: string | null; state: OwnPhoto["state"]; moderation_reason: string | null; created_at: Date | string }>(sql`
    SELECT id, object_key, caption, state::text AS state, moderation_reason, created_at
    FROM treatment_photos WHERE practitioner_id = ${practitionerId} AND kind = 'practitioner' AND removed_at IS NULL
    ORDER BY created_at DESC`);
  return res.rows.map((r) => ({ id: r.id, url: fitUrl(r.object_key, 480), caption: r.caption, state: r.state, moderationReason: r.moderation_reason, createdAt: new Date(r.created_at) }));
}

export async function addPractitionerPhoto(
  p: { id: string; publicId: string; listingStatus: string },
  userId: string,
  input: { fileId: string; caption?: string | null; consentDeclared: boolean },
): Promise<string> {
  if (!input.consentDeclared) throw new ApiError("INVALID_INPUT", "Confirm that you hold the patient's written consent");
  if (p.listingStatus !== "published") throw new ApiError("CONFLICT", "Patient photos can be added once your profile is approved and published");
  const caption = cleanCaption(input.caption);
  const file = await verifyUpload(input.fileId, patientPhotoFolder(p.publicId));
  try {
    return await withTransaction(async (_c, tx) => {
      await tx.execute(sql`SELECT id FROM practitioners WHERE id = ${p.id} FOR UPDATE`); // serialises the count below
      const n = await tx.execute<{ n: number | string }>(sql`SELECT count(*) AS n FROM treatment_photos WHERE practitioner_id = ${p.id} AND kind = 'practitioner' AND removed_at IS NULL AND state <> 'rejected'`);
      if (Number(n.rows[0]?.n ?? 0) >= MAX_GALLERY_PHOTOS) throw new ApiError("CONFLICT", `You can show up to ${MAX_GALLERY_PHOTOS} patient photos. Remove one to add another.`);
      const ins = await tx.execute<{ id: string }>(sql`
        INSERT INTO treatment_photos (practitioner_id, kind, uploaded_by_user_id, object_key, external_id, mime, bytes, width, height, caption, consent_basis, consent_statement)
        VALUES (${p.id}, 'practitioner', ${userId}, ${file.filePath}, ${file.fileId}, ${file.mime ?? "image/jpeg"}, ${file.size}, ${file.width}, ${file.height}, ${caption}, 'practitioner_declared', ${PRACTITIONER_CONSENT_STATEMENT})
        ON CONFLICT (object_key) DO NOTHING RETURNING id`);
      const id = ins.rows[0]?.id;
      if (!id) throw new ApiError("CONFLICT", "That photo has already been added");
      await audit({ actorUserId: userId, actorRole: "practitioner", action: "treatment_photo.upload", objectType: "treatment_photo", objectId: id, changedFields: { practitionerId: p.id, consentBasis: "practitioner_declared", bytes: file.size } }, tx);
      return id;
    });
  } catch (err) {
    await deleteFile(file.fileId); // not recorded, so do not leave it on the image service
    throw err;
  }
}

/** Uploader's own removal: immediate and permanent. */
export async function removeOwnPhoto(practitionerId: string, userId: string, photoId: string): Promise<void> {
  const row = await withTransaction(async (_c, tx) => {
    const res = await tx.execute<{ id: string; external_id: string }>(sql`
      UPDATE treatment_photos SET removed_at = now(), removed_reason = 'Removed by the physiotherapist'
      WHERE id = ${photoId} AND practitioner_id = ${practitionerId} AND kind = 'practitioner' AND removed_at IS NULL
      RETURNING id, external_id`);
    if (!res.rows[0]) throw new ApiError("NOT_FOUND", "Photo not found");
    await audit({ actorUserId: userId, actorRole: "practitioner", action: "treatment_photo.remove", objectType: "treatment_photo", objectId: photoId }, tx);
    return res.rows[0];
  });
  await deleteFile(row.external_id);
}

export type PublicPhoto = { id: string; url: string | null; thumbUrl: string | null; caption: string | null; width: number | null; height: number | null };

/** Approved gallery photos for the public profile. Review photos travel with their review. */
export async function listPublicPhotos(practitionerId: string): Promise<PublicPhoto[]> {
  const res = await db().execute<{ id: string; object_key: string; caption: string | null; width: number | null; height: number | null }>(sql`
    SELECT id, object_key, caption, width, height FROM treatment_photos
    WHERE practitioner_id = ${practitionerId} AND kind = 'practitioner' AND state = 'approved' AND removed_at IS NULL
    ORDER BY moderated_at DESC NULLS LAST, created_at DESC LIMIT ${MAX_GALLERY_PHOTOS}`);
  return res.rows.map((r) => ({ id: r.id, url: fitUrl(r.object_key, 1200), thumbUrl: fitUrl(r.object_key, 480), caption: r.caption, width: r.width, height: r.height })).filter((x) => x.url);
}

// ------------------------------------------------------------------ staff

export type AdminPhoto = {
  id: string;
  kind: "practitioner" | "review";
  url: string | null;
  caption: string | null;
  state: string;
  consentBasis: string;
  consentStatement: string;
  consentAt: Date;
  practitionerId: string;
  practitionerName: string;
  uploaderEmail: string | null;
  reviewId: string | null;
  createdAt: Date;
};

export async function listPhotosForModeration(view: "pending" | "live"): Promise<AdminPhoto[]> {
  // Review photos are decided with their review case, so the pending list shows gallery photos only.
  const where = view === "pending" ? sql`t.state = 'pending' AND t.kind = 'practitioner'` : sql`t.state = 'approved'`;
  const res = await db().execute<Record<string, unknown>>(sql`
    SELECT t.id, t.kind, t.object_key, t.caption, t.state::text AS state, t.consent_basis, t.consent_statement, t.consent_at, t.practitioner_id, t.review_id, t.created_at,
      p.display_name AS practitioner_name, u.email AS uploader_email
    FROM treatment_photos t JOIN practitioners p ON p.id = t.practitioner_id LEFT JOIN users u ON u.id = t.uploaded_by_user_id
    WHERE t.removed_at IS NULL AND ${where}
    ORDER BY t.created_at ${view === "pending" ? sql`ASC` : sql`DESC`} LIMIT 200`);
  return res.rows.map((r) => ({
    id: String(r.id),
    kind: r.kind as AdminPhoto["kind"],
    url: fitUrl(String(r.object_key), 640),
    caption: (r.caption as string | null) ?? null,
    state: String(r.state),
    consentBasis: String(r.consent_basis),
    consentStatement: String(r.consent_statement),
    consentAt: new Date(r.consent_at as string),
    practitionerId: String(r.practitioner_id),
    practitionerName: String(r.practitioner_name),
    uploaderEmail: (r.uploader_email as string | null) ?? null,
    reviewId: (r.review_id as string | null) ?? null,
    createdAt: new Date(r.created_at as string),
  }));
}

export async function pendingPhotoCount(): Promise<number> {
  const res = await db().execute<{ n: number | string }>(sql`SELECT count(*) AS n FROM treatment_photos WHERE state = 'pending' AND kind = 'practitioner' AND removed_at IS NULL`);
  return Number(res.rows[0]?.n ?? 0);
}

/** Moderator decision on a gallery photo. A rejection needs a reason the physiotherapist will read. */
export async function decidePhoto(staff: { userId: string; role: string | null }, photoId: string, decision: "approve" | "reject", reason: string | null): Promise<void> {
  if (decision === "reject" && (!reason || reason.trim().length < 5)) throw new ApiError("INVALID_INPUT", "Give a reason for rejecting the photo");
  await withTransaction(async (_c, tx) => {
    const res = await tx.execute<{ id: string }>(sql`
      UPDATE treatment_photos SET state = ${decision === "approve" ? "approved" : "rejected"}::moderation_state, moderation_reason = ${decision === "reject" ? reason!.trim() : null},
        moderated_by_user_id = ${staff.userId}, moderated_at = now()
      WHERE id = ${photoId} AND state = 'pending' AND removed_at IS NULL RETURNING id`);
    if (!res.rows[0]) throw new ApiError("CONFLICT", "This photo has already been decided or removed");
    await audit({ actorUserId: staff.userId, actorRole: staff.role, action: `treatment_photo.${decision}`, objectType: "treatment_photo", objectId: photoId, reason }, tx);
  });
}

/** Staff take-down (for example when the person pictured objects). Works on any photo, of either kind. */
export async function staffRemovePhoto(staff: { userId: string; role: string | null }, photoId: string, reason: string): Promise<void> {
  if (!reason || reason.trim().length < 5) throw new ApiError("INVALID_INPUT", "Give a reason for removing the photo");
  const row = await withTransaction(async (_c, tx) => {
    const res = await tx.execute<{ external_id: string }>(sql`
      UPDATE treatment_photos SET removed_at = now(), removed_reason = ${reason.trim()}, moderated_by_user_id = ${staff.userId}
      WHERE id = ${photoId} AND removed_at IS NULL RETURNING external_id`);
    if (!res.rows[0]) throw new ApiError("NOT_FOUND", "Photo not found");
    await audit({ actorUserId: staff.userId, actorRole: staff.role, action: "treatment_photo.staff_remove", objectType: "treatment_photo", objectId: photoId, reason: reason.trim() }, tx);
    return res.rows[0];
  });
  await deleteFile(row.external_id);
}

/** Called from the review moderation decision: a review's photos follow the review. */
export async function setReviewPhotosState(tx: Db, reviewId: string, to: "approved" | "rejected", staffUserId: string): Promise<number> {
  const res = await tx.execute(sql`
    UPDATE treatment_photos SET state = ${to}::moderation_state, moderated_by_user_id = ${staffUserId}, moderated_at = now()
    WHERE review_id = ${reviewId} AND kind = 'review' AND removed_at IS NULL AND state IN ('pending', 'approved', 'rejected') RETURNING id`);
  return res.rows.length;
}
