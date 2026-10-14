import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db/client";
import { ApiError, handler } from "@/lib/api";
import { audit } from "@/lib/audit";
import { apiStaff, recentlyAuthenticated } from "@/lib/auth/session";
import { parseForm, zBool, zOpt, zOptDate, zReq } from "@/lib/admin/forms";
import { maskMobile } from "@/lib/admin/format";
import { exportPatients, toCsv } from "@/lib/admin/patients";
import { actorRole } from "@/lib/admin/practitioner-ops";
import { getConfig } from "@/lib/config";

const MAX_ROWS = 5000;

const schema = z.object({ purpose: zReq(1000, 10), status: zOpt(20), q: zOpt(120), createdFrom: zOptDate, createdTo: zOptDate, includeMobile: zBool });

/**
 * PRO-17: purpose-bound, scoped CSV export streamed straight to the requester.
 * Nothing is stored; the export_jobs row records scope, purpose, row count and
 * expiry. Requires the support role and a recent sign-in (IAM-03).
 */
export const POST = handler(async (req, rid) => {
  const v = await apiStaff("support_agent");
  if (!recentlyAuthenticated(v)) {
    return NextResponse.redirect(new URL(`/admin/sign-in?next=${encodeURIComponent("/admin/patients/export")}&reason=reauth`, req.url), { status: 303 });
  }
  const fd = await req.formData();
  let input: z.infer<typeof schema>;
  try {
    input = parseForm(schema, fd);
  } catch (err) {
    const msg = err instanceof ApiError ? err.message : "Invalid input";
    return NextResponse.redirect(new URL(`/admin/patients/export?error=${encodeURIComponent(msg)}`, req.url), { status: 303 });
  }
  const ttlHours = await getConfig<number>("exports.ttl_hours", 24);
  const scope = { status: input.status || undefined, q: input.q, createdFrom: input.createdFrom, createdTo: input.createdTo, includeMobile: input.includeMobile };
  const job = await db().execute<{ id: string }>(sql`
    INSERT INTO export_jobs (requested_by_user_id, kind, scope, purpose, state, expires_at)
    VALUES (${v.userId}, 'patients', ${JSON.stringify(scope)}::jsonb, ${input.purpose}, 'running', now() + (${Number(ttlHours)}::int * interval '1 hour')) RETURNING id`);
  const jobId = job.rows[0].id;
  try {
    const rows = await exportPatients(scope, MAX_ROWS);
    if (rows.length > MAX_ROWS) {
      await db().execute(sql`UPDATE export_jobs SET state = 'failed', error = ${"more than " + MAX_ROWS + " rows; narrow the scope"} WHERE id = ${jobId}`);
      return NextResponse.redirect(new URL(`/admin/patients/export?error=${encodeURIComponent(`More than ${MAX_ROWS} rows match. Narrow the scope.`)}`, req.url), { status: 303 });
    }
    const csv = toCsv(
      ["patient_id", "display_name", "mobile", "status", "age_band", "bookings", "created_at"],
      rows.map((r) => [r.patientId, r.displayName, input.includeMobile ? r.mobile : maskMobile(r.mobile), r.status, r.ageBand, r.bookings, r.createdAt]),
    );
    await db().execute(sql`UPDATE export_jobs SET state = 'ready', row_count = ${rows.length} WHERE id = ${jobId}`);
    await audit({ actorUserId: v.userId, actorRole: actorRole(v), action: "export.patients", objectType: "export_job", objectId: jobId, reason: input.purpose, changedFields: { rowCount: rows.length, scope }, correlationId: rid });
    const stamp = new Date().toISOString().slice(0, 10);
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="patients-${stamp}-${jobId.slice(0, 8)}.csv"`,
        "Cache-Control": "no-store",
        "x-request-id": rid,
      },
    });
  } catch (err) {
    await db().execute(sql`UPDATE export_jobs SET state = 'failed', error = ${String((err as Error).message ?? err).slice(0, 500)} WHERE id = ${jobId}`).catch(() => undefined);
    throw err;
  }
});
