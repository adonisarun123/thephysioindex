import { sql } from "drizzle-orm";
import { db, withTransaction, type Db } from "@/db/client";
import { ApiError } from "@/lib/api";
import { audit } from "@/lib/audit";
import { deleteFile, getFile, PHOTO_MAX_BYTES, PHOTO_MIME, photoUrl, practitionerFolder } from "@/lib/media/imagekit";

/**
 * Profile photograph (PRO-08 identity, PRO-10 drafts vs published, PRO-12 media rules).
 *
 * - Upload goes browser → ImageKit with a short-lived signature; the browser then
 *   hands us only the fileId. We read the file back from ImageKit and check folder,
 *   type and size before recording it, so a tampered request cannot attach someone
 *   else's file or a non-image.
 * - A new photo is `pending` (counts for completion, never public). It goes live when
 *   a reviewer approves the listing / profile change or approves the photo directly;
 *   then `practitioners.photo_asset_id` points at it.
 * - Public read models show only `photo_asset_id` with moderation `approved`.
 */

export type PhotoState = {
  published: { id: string; url: string | null; altText: string | null } | null;
  pending: { id: string; url: string | null; state: "pending" | "rejected" } | null;
};

export async function photoState(practitionerId: string, d: Db = db()): Promise<PhotoState> {
  const res = await d.execute<{ id: string; object_key: string; alt_text: string | null; moderation_state: string; is_current: boolean }>(sql`
    SELECT m.id, m.object_key, m.alt_text, m.moderation_state, (p.photo_asset_id = m.id) AS is_current
    FROM media_assets m JOIN practitioners p ON p.id = m.practitioner_id
    WHERE m.practitioner_id = ${practitionerId} AND m.purpose = 'profile_photo' AND m.deleted_at IS NULL
    ORDER BY m.created_at DESC`);
  const cur = res.rows.find((r) => r.is_current && r.moderation_state === "approved");
  const latest = res.rows.find((r) => !r.is_current);
  return {
    published: cur ? { id: cur.id, url: photoUrl(cur.object_key, 320), altText: cur.alt_text } : null,
    pending:
      latest && (latest.moderation_state === "pending" || latest.moderation_state === "rejected")
        ? { id: latest.id, url: photoUrl(latest.object_key, 320), state: latest.moderation_state as "pending" | "rejected" }
        : null,
  };
}

/** Completion counts a published photo or one waiting for review; a rejected one does not. */
export function hasPhoto(s: PhotoState): boolean {
  return Boolean(s.published || s.pending?.state === "pending");
}

export async function saveProfilePhoto(
  p: { id: string; publicId: string; displayName: string },
  userId: string,
  input: { fileId: string; ownershipConfirmed: boolean },
): Promise<void> {
  if (!input.ownershipConfirmed) throw new ApiError("INVALID_INPUT", "Confirm the photo is of you and you may use it"); // PRO-12
  const file = await getFile(input.fileId);
  if (!file) throw new ApiError("NOT_FOUND", "Upload not found. Try again.");
  const folder = practitionerFolder(p.publicId, "profile_photo");
  const reject = async (msg: string) => {
    await deleteFile(file.fileId);
    throw new ApiError("INVALID_INPUT", msg);
  };
  if (!file.filePath.startsWith(`${folder}/`)) await reject("That upload does not belong to this profile");
  if (file.fileType !== "image" || (file.mime && !(PHOTO_MIME as readonly string[]).includes(file.mime))) await reject("Use a JPG, PNG or WebP photo");
  if (file.size <= 0 || file.size > PHOTO_MAX_BYTES) await reject("Photo must be under 5 MB");
  if (file.width != null && file.height != null && (file.width < 200 || file.height < 200)) await reject("Photo is too small. Use one at least 200 × 200 pixels.");

  const alt = `${p.displayName}, physiotherapist`.slice(0, 160); // meaningful alt text (PRO-12)
  const superseded = await withTransaction(async (_c, tx) => {
    // Earlier uploads that never went live are replaced, not kept.
    const old = await tx.execute<{ id: string; external_id: string | null }>(sql`
      UPDATE media_assets m SET deleted_at = now(), updated_at = now()
      FROM practitioners p
      WHERE p.id = m.practitioner_id AND m.practitioner_id = ${p.id} AND m.purpose = 'profile_photo' AND m.deleted_at IS NULL
        AND m.id IS DISTINCT FROM p.photo_asset_id AND m.external_id IS DISTINCT FROM ${file.fileId}
      RETURNING m.id, m.external_id`);
    const ins = await tx.execute<{ id: string }>(sql`
      INSERT INTO media_assets (object_key, external_id, owner_user_id, practitioner_id, purpose, visibility, mime, bytes, width, height, alt_text,
                                scan_state, scanned_at, ownership_confirmed_at, moderation_state)
      VALUES (${file.filePath}, ${file.fileId}, ${userId}, ${p.id}, 'profile_photo', 'public', ${file.mime ?? "image/jpeg"}, ${file.size}, ${file.width}, ${file.height}, ${alt},
              'clean', now(), now(), 'pending')
      ON CONFLICT (object_key) DO NOTHING
      RETURNING id`);
    // 'clean': ImageKit decoded and re-encoded the file at upload (pre-transformation), so no foreign payload survives.
    await audit({ actorUserId: userId, action: "profile.photo.upload", objectType: "practitioner", objectId: p.id, changedFields: { assetId: ins.rows[0]?.id ?? null, bytes: file.size, replaced: old.rows.length } }, tx);
    return old.rows;
  });
  // Network calls only after the transaction (BKG-12 spirit: no I/O while holding locks).
  for (const r of superseded) await deleteFile(r.external_id);
}

/**
 * Makes the newest pending photo the published one. Called inside the reviewer's
 * approval transaction (listing review / profile change) and by the admin photo action.
 */
export async function publishPendingPhoto(tx: Db, practitionerId: string, actorUserId: string, correlationId?: string): Promise<boolean> {
  const next = await tx.execute<{ id: string }>(sql`
    SELECT m.id FROM media_assets m JOIN practitioners p ON p.id = m.practitioner_id
    WHERE m.practitioner_id = ${practitionerId} AND m.purpose = 'profile_photo' AND m.deleted_at IS NULL
      AND m.moderation_state = 'pending' AND m.id IS DISTINCT FROM p.photo_asset_id
    ORDER BY m.created_at DESC LIMIT 1`);
  const id = next.rows[0]?.id;
  if (!id) return false;
  await tx.execute(sql`
    UPDATE media_assets m SET deleted_at = now(), updated_at = now()
    FROM practitioners p WHERE p.id = ${practitionerId} AND m.id = p.photo_asset_id`);
  await tx.execute(sql`UPDATE media_assets SET moderation_state = 'approved', updated_at = now() WHERE id = ${id}`);
  await tx.execute(sql`UPDATE practitioners SET photo_asset_id = ${id}, updated_at = now() WHERE id = ${practitionerId}`);
  await audit({ actorUserId, action: "profile.photo.approve", objectType: "practitioner", objectId: practitionerId, changedFields: { assetId: id }, correlationId: correlationId ?? null }, tx);
  return true;
}

export async function rejectPendingPhoto(tx: Db, practitionerId: string, actorUserId: string, reason: string): Promise<boolean> {
  const res = await tx.execute<{ id: string }>(sql`
    UPDATE media_assets m SET moderation_state = 'rejected', updated_at = now()
    FROM practitioners p
    WHERE p.id = m.practitioner_id AND m.practitioner_id = ${practitionerId} AND m.purpose = 'profile_photo'
      AND m.deleted_at IS NULL AND m.moderation_state = 'pending' AND m.id IS DISTINCT FROM p.photo_asset_id
    RETURNING m.id`);
  if (!res.rows.length) return false;
  await audit({ actorUserId, action: "profile.photo.reject", objectType: "practitioner", objectId: practitionerId, reason, changedFields: { assetIds: res.rows.map((r) => r.id) } }, tx);
  return true;
}
