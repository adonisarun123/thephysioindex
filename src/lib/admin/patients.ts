import { sql, type SQL } from "drizzle-orm";
import { db } from "@/db/client";

/** Patient directory for staff. Identifiers are masked by default; reveals are purpose-bound and logged (ADM-04, PRO-16). */

export type PatientRow = { id: string; displayName: string; mobile: string | null; mobileVerified: boolean; ageBand: string | null; status: string; accountContact: string | null; bookings: number; lastBookingAt: Date | null; isTestAccount: boolean; createdAt: Date };

export async function listPatients(f: { q?: string; status?: string; page?: number; pageSize?: number }): Promise<{ rows: PatientRow[]; total: number }> {
  const where: SQL[] = [];
  const q = f.q?.trim();
  if (q) {
    const digits = q.replace(/\D/g, "");
    if (digits.length >= 4) where.push(sql`regexp_replace(coalesce(p.mobile, ''), '\\D', '', 'g') LIKE ${"%" + digits}`);
    else where.push(sql`(p.display_name ILIKE ${"%" + q + "%"} OR p.id::text = ${q})`);
  }
  if (f.status) where.push(sql`p.status = ${f.status}::patient_status`);
  const whereSql = where.length ? sql`WHERE ${sql.join(where, sql` AND `)}` : sql``;
  const pageSize = f.pageSize ?? 50;
  const page = Math.max(1, f.page ?? 1);
  const [rows, total] = await Promise.all([
    db().execute<PatientRow>(sql`
      SELECT p.id, p.display_name AS "displayName", p.mobile, p.mobile_verified_at IS NOT NULL AS "mobileVerified", p.age_band AS "ageBand", p.status, coalesce(u.email, u.mobile) AS "accountContact", p.is_test_account AS "isTestAccount", p.created_at AS "createdAt",
        (SELECT count(*)::int FROM bookings b WHERE b.patient_id = p.id) AS bookings, (SELECT max(b.starts_at) FROM bookings b WHERE b.patient_id = p.id) AS "lastBookingAt"
      FROM patients p LEFT JOIN users u ON u.id = p.account_user_id ${whereSql} ORDER BY p.created_at DESC LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`),
    db().execute<{ n: string }>(sql`SELECT count(*) AS n FROM patients p ${whereSql}`),
  ]);
  return { rows: rows.rows, total: Number(total.rows[0]?.n ?? 0) };
}

/** Patient ids this actor revealed in the last `minutes` (a reveal is valid for one short viewing window). */
export async function recentReveals(actorUserId: string, minutes = 10): Promise<Set<string>> {
  const res = await db().execute<{ objectId: string }>(sql`SELECT DISTINCT object_id AS "objectId" FROM record_access_log WHERE actor_user_id = ${actorUserId} AND object_type = 'patient' AND occurred_at > now() - (${Number(minutes)}::int * interval '1 minute')`);
  return new Set(res.rows.map((r) => r.objectId));
}

export type ExportRow = { patientId: string; displayName: string; mobile: string; status: string; ageBand: string; bookings: number; createdAt: string };

/** Minimum operational fields only (PRO-17). Row cap enforced by caller. */
export async function exportPatients(scope: { q?: string; status?: string; createdFrom?: string; createdTo?: string }, cap: number): Promise<ExportRow[]> {
  const where: SQL[] = [sql`NOT p.is_test_account`];
  if (scope.status) where.push(sql`p.status = ${scope.status}::patient_status`);
  if (scope.createdFrom) where.push(sql`p.created_at >= ${scope.createdFrom}::date`);
  if (scope.createdTo) where.push(sql`p.created_at < (${scope.createdTo}::date + 1)`);
  if (scope.q?.trim()) where.push(sql`p.display_name ILIKE ${"%" + scope.q.trim() + "%"}`);
  const res = await db().execute<ExportRow>(sql`
    SELECT p.id AS "patientId", p.display_name AS "displayName", coalesce(p.mobile, '') AS mobile, p.status::text, coalesce(p.age_band::text, '') AS "ageBand", (SELECT count(*)::int FROM bookings b WHERE b.patient_id = p.id) AS bookings, to_char(p.created_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD') AS "createdAt"
    FROM patients p WHERE ${sql.join(where, sql` AND `)} ORDER BY p.created_at DESC LIMIT ${cap + 1}`);
  return res.rows;
}

/** CSV with formula-injection mitigation (PRO-17): cells starting with = + - @ are prefixed with a quote. */
export function toCsv(headers: string[], rows: (string | number | null)[][]): string {
  const cell = (v: string | number | null): string => {
    let s = v == null ? "" : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  return [headers.map(cell).join(","), ...rows.map((r) => r.map(cell).join(","))].join("\r\n") + "\r\n";
}
