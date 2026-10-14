"use server";

import { revalidatePath } from "next/cache";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { withTransaction } from "@/db/client";
import { ApiError } from "@/lib/api";
import { audit } from "@/lib/audit";
import { requireStaff } from "@/lib/auth/session";
import { csvToRecords } from "@/lib/admin/csv";
import { act, parseForm, requireRecent, zBool, zDate, zOpt, zReason, zReq, zUuid } from "@/lib/admin/forms";
import { publishBatch, revertBatch, validateBatch } from "@/lib/admin/imports";
import { actorRole } from "@/lib/admin/practitioner-ops";

const MAX_ROWS = 2000;
const MAX_BYTES = 2 * 1024 * 1024;

const uploadSchema = z.object({ sourceName: zReq(200), sourceUrl: zOpt(500), collectedOn: zDate, permittedUseBasis: zReq(500, 5) });

/** ADM-06 / PRO-07: stage a CSV with source and permission metadata, then validate it (dry run). */
export async function uploadBatchAction(fd: FormData) {
  const v = await requireStaff("verification_reviewer");
  const meta = parseForm(uploadSchema, fd);
  const file = fd.get("file");
  await act("/admin/imports", async () => {
    if (!(file instanceof File) || file.size === 0) throw new ApiError("INVALID_INPUT", "Choose a CSV file");
    if (file.size > MAX_BYTES) throw new ApiError("INVALID_INPUT", "CSV larger than 2 MB; split the file");
    const text = await file.text();
    const { headers, records } = csvToRecords(text);
    if (!headers.length || records.length === 0) throw new ApiError("INVALID_INPUT", "The CSV has no data rows");
    if (records.length > MAX_ROWS) throw new ApiError("INVALID_INPUT", `More than ${MAX_ROWS} rows; split the file`);
    const batchId = await withTransaction(async (_c, tx) => {
      const b = await tx.execute<{ id: string }>(sql`INSERT INTO import_batches (source_name, source_url, collected_on, permitted_use_basis, state, row_count, created_by_user_id, summary)
        VALUES (${meta.sourceName}, ${meta.sourceUrl ?? null}, ${meta.collectedOn}::date, ${meta.permittedUseBasis}, 'staged', ${records.length}, ${v.userId}, ${JSON.stringify({ headers, fileName: file.name })}::jsonb) RETURNING id`);
      const id = b.rows[0].id;
      for (const [i, raw] of records.entries()) {
        await tx.execute(sql`INSERT INTO import_rows (batch_id, row_no, raw, state) VALUES (${id}, ${i + 1}, ${JSON.stringify(raw)}::jsonb, 'pending')`);
      }
      const counts = await validateBatch(tx, id);
      await audit({ actorUserId: v.userId, actorRole: actorRole(v), action: "import.stage", objectType: "import_batch", objectId: id, reason: meta.permittedUseBasis, changedFields: { rows: records.length, ...counts, sourceName: meta.sourceName } }, tx);
      return id;
    });
    revalidatePath("/admin/imports");
    return { path: `/admin/imports/${batchId}`, notice: "Batch staged and validated. Review the dry run before publishing." };
  });
}

export async function revalidateBatchAction(fd: FormData) {
  const v = await requireStaff("verification_reviewer");
  const { batchId } = parseForm(z.object({ batchId: zUuid }), fd);
  await act(`/admin/imports/${batchId}`, async () => {
    const counts = await withTransaction((_c, tx) => validateBatch(tx, batchId));
    await audit({ actorUserId: v.userId, actorRole: actorRole(v), action: "import.validate", objectType: "import_batch", objectId: batchId, changedFields: counts });
    revalidatePath(`/admin/imports/${batchId}`);
    return { notice: `Validated: ${counts.valid} valid, ${counts.duplicate} duplicate, ${counts.invalid} invalid` };
  });
}

export async function publishBatchAction(fd: FormData) {
  const v = await requireStaff("verification_reviewer");
  const { batchId, includeDuplicates, reason } = parseForm(z.object({ batchId: zUuid, includeDuplicates: zBool, reason: zReason }), fd);
  await act(`/admin/imports/${batchId}`, async () => {
    const r = await withTransaction(async (_c, tx) => {
      const out = await publishBatch(tx, batchId, v.userId, includeDuplicates);
      await audit({ actorUserId: v.userId, actorRole: actorRole(v), action: "import.publish", objectType: "import_batch", objectId: batchId, reason, changedFields: { ...out, includeDuplicates } }, tx);
      return out;
    }, { statementTimeoutMs: 120_000 });
    revalidatePath("/admin", "layout");
    return { notice: `Published ${r.practitioners} draft profile(s) into listing review (${r.clinics} new clinics, ${r.branches} new branches, ${r.skipped} skipped). Nothing is verified or claimed by import.` };
  });
}

export async function revertBatchAction(fd: FormData) {
  const v = await requireStaff("super_admin");
  const { batchId, reason } = parseForm(z.object({ batchId: zUuid, reason: zReason }), fd);
  requireRecent(v, `/admin/imports/${batchId}`);
  await act(`/admin/imports/${batchId}`, async () => {
    const r = await withTransaction(async (_c, tx) => {
      const out = await revertBatch(tx, batchId, v.userId, reason);
      await audit({ actorUserId: v.userId, actorRole: actorRole(v), action: "import.revert", objectType: "import_batch", objectId: batchId, reason, changedFields: out }, tx);
      return out;
    });
    revalidatePath("/admin", "layout");
    return { notice: `Reverted: ${r.practitioners} profiles, ${r.branches} branches and ${r.clinics} clinics archived.` };
  });
}
