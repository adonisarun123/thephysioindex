import { createHash, randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { ApiError } from "@/lib/api";
import { audit } from "@/lib/audit";
import { privateStorage } from "@/lib/storage";
import { assertOwnPatient } from "./patients";

/**
 * Patient documents (addendum EMR-07): reports, scans, prescriptions and
 * consent forms attached to a patient record. Bytes go to private storage
 * under an opaque key (no names in paths); the type is checked from the
 * file's own bytes, not its name; reads stream through an authorised,
 * audited route; delete removes the bytes and keeps a tombstone row.
 */

export const MAX_DOCUMENT_BYTES = 4 * 1024 * 1024;

export const DOCUMENT_CATEGORIES = [
  { key: "report", label: "Report / letter" },
  { key: "imaging", label: "X-ray / MRI / scan" },
  { key: "prescription", label: "Prescription" },
  { key: "consent", label: "Consent form" },
  { key: "other", label: "Other" },
] as const;
type Category = (typeof DOCUMENT_CATEGORIES)[number]["key"];

/** File type from magic bytes (EMR-07). Returns null for anything we do not accept. */
export function sniffMime(b: Buffer): "application/pdf" | "image/jpeg" | "image/png" | "image/webp" | null {
  if (b.length >= 5 && b.subarray(0, 5).toString("latin1") === "%PDF-") return "application/pdf";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (b.length >= 12 && b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp";
  return null;
}

export const DocumentMetaSchema = z.object({
  title: z.string().trim().min(2, "Give the document a title").max(120),
  category: z.enum(DOCUMENT_CATEGORIES.map((c) => c.key) as [Category, ...Category[]]),
  docDate: z.iso.date().optional(),
});
export type DocumentMeta = z.infer<typeof DocumentMetaSchema>;

function safeName(name: string): string {
  return name.replace(/[^\w.\- ]+/g, "_").slice(0, 120);
}

export async function uploadDocument(practitionerId: string, actorUserId: string, patientId: string, meta: DocumentMeta, file: { name: string; bytes: Buffer }): Promise<string> {
  const store = privateStorage();
  if (!store) throw new ApiError("FEATURE_DISABLED", "Document storage is not set up yet");
  if (file.bytes.length === 0) throw new ApiError("INVALID_INPUT", "Choose a file to upload");
  if (file.bytes.length > MAX_DOCUMENT_BYTES) throw new ApiError("INVALID_INPUT", "Files can be up to 4 MB. Take a smaller photo or compress the PDF.");
  const mime = sniffMime(file.bytes);
  if (!mime) throw new ApiError("INVALID_INPUT", "Upload a PDF, JPG, PNG or WebP file");
  await assertOwnPatient(db(), practitionerId, patientId);
  const terms = await db().execute<{ ok: boolean }>(sql`SELECT true AS ok FROM practice_records_terms WHERE practitioner_id = ${practitionerId}`);
  if (!terms.rows[0]) throw new ApiError("CONFLICT", "Accept the patient-records terms first");

  const key = `patients/${practitionerId}/${patientId}/${randomUUID()}`;
  const sha256 = createHash("sha256").update(file.bytes).digest("hex");
  // Upload first (no DB locks held during the network call, BKG-12 spirit); remove the object if the row insert fails.
  await store.put(key, file.bytes, mime);
  try {
    const r = await db().execute<{ id: string }>(sql`
      INSERT INTO patient_documents (patient_id, practitioner_id, object_key, title, category, doc_date, original_name, mime, bytes, sha256, uploaded_by)
      VALUES (${patientId}, ${practitionerId}, ${key}, ${meta.title}, ${meta.category}, ${meta.docDate ?? null}::date, ${safeName(file.name)}, ${mime}, ${file.bytes.length}, ${sha256}, ${actorUserId})
      RETURNING id`);
    await db().execute(sql`UPDATE practice_patients SET updated_at = now() WHERE id = ${patientId}`);
    await audit({ actorUserId, action: "patient_document.upload", objectType: "patient_document", objectId: r.rows[0].id, changedFields: { patientId, mime, bytes: file.bytes.length } });
    return r.rows[0].id;
  } catch (err) {
    await store.del(key).catch(() => undefined);
    throw err;
  }
}

export type DocumentRow = { id: string; title: string; category: Category; docDate: string | null; originalName: string | null; mime: string; bytes: number; createdAt: Date; uploadedBy: string | null };

export async function listDocuments(practitionerId: string, patientId: string): Promise<DocumentRow[]> {
  const res = await db().execute<{ id: string; title: string; category: Category; doc_date: string | null; original_name: string | null; mime: string; bytes: number; created_at: string; uploaded_by: string | null }>(sql`
    SELECT d.id, d.title, d.category, d.doc_date::text AS doc_date, d.original_name, d.mime, d.bytes, d.created_at, coalesce(nullif(u.display_name, ''), u.email) AS uploaded_by
    FROM patient_documents d LEFT JOIN users u ON u.id = d.uploaded_by
    WHERE d.patient_id = ${patientId} AND d.practitioner_id = ${practitionerId} AND d.deleted_at IS NULL
    ORDER BY coalesce(d.doc_date, (d.created_at AT TIME ZONE 'Asia/Kolkata')::date) DESC, d.created_at DESC`);
  return res.rows.map((r) => ({ id: r.id, title: r.title, category: r.category, docDate: r.doc_date, originalName: r.original_name, mime: r.mime, bytes: r.bytes, createdAt: new Date(r.created_at), uploadedBy: r.uploaded_by }));
}

/** EMR-07: authorised read. Logs the access and returns the stream. */
export async function openDocument(practitionerId: string, viewerUserId: string, documentId: string) {
  if (!z.uuid().safeParse(documentId).success) return null;
  const r = await db().execute<{ object_key: string; mime: string; title: string; original_name: string | null }>(sql`
    SELECT object_key, mime, title, original_name FROM patient_documents WHERE id = ${documentId} AND practitioner_id = ${practitionerId} AND deleted_at IS NULL`);
  const row = r.rows[0];
  if (!row) return null;
  const store = privateStorage();
  if (!store) throw new ApiError("FEATURE_DISABLED", "Document storage is not set up yet");
  const obj = await store.get(row.object_key);
  if (!obj) return null;
  await audit({ actorUserId: viewerUserId, action: "patient_document.view", objectType: "patient_document", objectId: documentId });
  return { body: obj.body, mime: row.mime, filename: row.original_name || `${row.title}` };
}

/** EMR-07: removes the bytes; the row stays as a tombstone for the audit trail. */
export async function deleteDocument(practitionerId: string, actorUserId: string, documentId: string): Promise<void> {
  const r = await db().execute<{ object_key: string }>(sql`
    UPDATE patient_documents SET deleted_at = now(), deleted_by = ${actorUserId}
    WHERE id = ${documentId} AND practitioner_id = ${practitionerId} AND deleted_at IS NULL RETURNING object_key`);
  const key = r.rows[0]?.object_key;
  if (!key) throw new ApiError("NOT_FOUND", "Document not found");
  await privateStorage()?.del(key);
  await audit({ actorUserId, action: "patient_document.delete", objectType: "patient_document", objectId: documentId });
}

export function documentsEnabled(): boolean {
  return privateStorage() !== null;
}
