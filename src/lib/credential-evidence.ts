import { createHash, randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { db, withTransaction } from "@/db/client";
import { ApiError } from "@/lib/api";
import { audit } from "@/lib/audit";
import { EVIDENCE_EXT, MAX_EVIDENCE_BYTES, evidenceEditableBy, sniffEvidenceMime, type EvidenceMime } from "@/lib/credential-evidence-rules";
import { privateStorage } from "@/lib/storage";

/**
 * Credential evidence (VER-02, DAT-02): the registration or degree
 * certificate behind a credential. Bytes go to private storage under an
 * opaque key; the row is a private `media_assets` record linked from
 * `credentials.evidence_asset_id`. Never public: reads stream through an
 * authorised, audited route for the profile's own managers and for
 * verification staff only. This module does not read the session: callers
 * pass who is asking (keeps it importable from the registration path).
 *
 * There is no malware scanner yet, so assets stay `quarantined`; the type is
 * taken from the file's own bytes and the route serves it with `nosniff`.
 */

export function evidenceEnabled(): boolean {
  return privateStorage() !== null;
}

/** Checks a file before any storage or database work. Returns the sniffed type. */
export function checkEvidenceFile(bytes: Buffer): EvidenceMime {
  if (bytes.length === 0) throw new ApiError("INVALID_INPUT", "Choose a file to upload");
  if (bytes.length > MAX_EVIDENCE_BYTES) throw new ApiError("INVALID_INPUT", "Files can be up to 4 MB. Take a smaller photo or compress the PDF.");
  const mime = sniffEvidenceMime(bytes);
  if (!mime) throw new ApiError("INVALID_INPUT", "Upload a PDF, JPG, PNG or WebP file");
  return mime;
}

export async function attachEvidence(input: { practitionerId: string; credentialId: string; actorUserId: string; actorRole?: string | null; byStaff: boolean; bytes: Buffer }): Promise<string> {
  const store = privateStorage();
  if (!store) throw new ApiError("FEATURE_DISABLED", "Document storage is not set up yet");
  if (!z.uuid().safeParse(input.credentialId).success) throw new ApiError("NOT_FOUND", "Credential not found");
  const mime = checkEvidenceFile(input.bytes);
  const cur = await db().execute<{ status: string }>(sql`SELECT status::text AS status FROM credentials WHERE id = ${input.credentialId} AND practitioner_id = ${input.practitionerId}`);
  const cred = cur.rows[0];
  if (!cred) throw new ApiError("NOT_FOUND", "Credential not found");
  if (!evidenceEditableBy(cred.status, input.byStaff)) throw new ApiError("CONFLICT", "This credential has already been reviewed. Contact support to replace its document.");

  const key = `credential-evidence/${input.practitionerId}/${randomUUID()}`;
  const sha256 = createHash("sha256").update(input.bytes).digest("hex");
  // Upload first (no database locks held during the network call); remove the object if the rows cannot be written.
  await store.put(key, input.bytes, mime);
  let replacedKey: string | null = null;
  let assetId: string;
  try {
    ({ assetId, replacedKey } = await withTransaction(async (_c, tx) => {
      const locked = await tx.execute<{ evidence_asset_id: string | null; status: string }>(sql`
        SELECT evidence_asset_id, status::text AS status FROM credentials WHERE id = ${input.credentialId} AND practitioner_id = ${input.practitionerId} FOR UPDATE`);
      const row = locked.rows[0];
      if (!row) throw new ApiError("NOT_FOUND", "Credential not found");
      if (!evidenceEditableBy(row.status, input.byStaff)) throw new ApiError("CONFLICT", "This credential has already been reviewed. Contact support to replace its document.");
      const ins = await tx.execute<{ id: string }>(sql`
        INSERT INTO media_assets (object_key, owner_user_id, practitioner_id, purpose, visibility, mime, bytes, checksum_sha256)
        VALUES (${key}, ${input.actorUserId}, ${input.practitionerId}, 'credential_evidence', 'private', ${mime}, ${input.bytes.length}, ${sha256}) RETURNING id`);
      const id = ins.rows[0].id;
      await tx.execute(sql`UPDATE credentials SET evidence_asset_id = ${id} WHERE id = ${input.credentialId}`);
      let oldKey: string | null = null;
      if (row.evidence_asset_id) {
        const old = await tx.execute<{ object_key: string }>(sql`
          UPDATE media_assets SET deleted_at = now() WHERE id = ${row.evidence_asset_id} AND purpose = 'credential_evidence' AND deleted_at IS NULL RETURNING object_key`);
        oldKey = old.rows[0]?.object_key ?? null;
      }
      await audit({ actorUserId: input.actorUserId, actorRole: input.actorRole ?? null, action: "credential.evidence.upload", objectType: "credential", objectId: input.credentialId, changedFields: { assetId: id, mime, bytes: input.bytes.length, byStaff: input.byStaff, replaced: row.evidence_asset_id } }, tx);
      return { assetId: id, replacedKey: oldKey };
    }));
  } catch (err) {
    await store.del(key).catch(() => undefined);
    throw err;
  }
  if (replacedKey) await store.del(replacedKey).catch(() => undefined);
  return assetId;
}

/**
 * Authorised read. `authorise` receives the practitioner the document belongs
 * to and returns who is reading, or null to refuse. Logs the access and
 * returns the stream, or null when there is nothing this reader may see.
 */
export async function openEvidence(credentialId: string, authorise: (practitionerId: string) => Promise<{ userId: string; asStaff: boolean } | null>) {
  if (!z.uuid().safeParse(credentialId).success) return null;
  const r = await db().execute<{ practitioner_id: string; asset_id: string; object_key: string; mime: string }>(sql`
    SELECT c.practitioner_id, m.id AS asset_id, m.object_key, m.mime
    FROM credentials c JOIN media_assets m ON m.id = c.evidence_asset_id
    WHERE c.id = ${credentialId} AND m.purpose = 'credential_evidence' AND m.deleted_at IS NULL`);
  const row = r.rows[0];
  if (!row) return null;
  const reader = await authorise(row.practitioner_id);
  if (!reader) return null;
  const store = privateStorage();
  if (!store) throw new ApiError("FEATURE_DISABLED", "Document storage is not set up yet");
  const obj = await store.get(row.object_key);
  if (!obj) return null;
  await audit({ actorUserId: reader.userId, action: "credential.evidence.view", objectType: "credential", objectId: credentialId, changedFields: { assetId: row.asset_id, asStaff: reader.asStaff } });
  return { body: obj.body, mime: row.mime, filename: `credential-document.${EVIDENCE_EXT[row.mime as EvidenceMime] ?? "bin"}` };
}

/** Removes a document whose credential row has gone. The asset row stays as a tombstone. */
export async function discardEvidence(assetId: string): Promise<void> {
  const r = await db().execute<{ object_key: string }>(sql`
    UPDATE media_assets SET deleted_at = now() WHERE id = ${assetId} AND purpose = 'credential_evidence' AND deleted_at IS NULL RETURNING object_key`);
  const key = r.rows[0]?.object_key;
  if (key) await privateStorage()?.del(key).catch(() => undefined);
}
