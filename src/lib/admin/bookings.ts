import { sql, type SQL } from "drizzle-orm";
import { db } from "@/db/client";

/** Booking oversight (ADM-04, ANA-01). Read-only; patient identifiers are masked by the page. */

export type BookingRow = {
  id: string; reference: string; status: string; source: string; startsAt: Date; endsAt: Date; createdAt: Date; completedAt: Date | null; cancelledAt: Date | null;
  practitionerId: string; practitionerName: string; clinicId: string; clinicName: string; branchName: string; cityName: string; stateName: string;
  patientId: string; patientName: string; patientMobile: string | null; offeringName: string; totalPaise: number | null; paymentMode: string; isTest: boolean;
};

export type BookingFilters = { stateId?: string; cityId?: string; practitionerId?: string; clinicId?: string; patientId?: string; bookingId?: string; source?: string; status?: string; dateType?: "created" | "appointment" | "completed"; from?: string; to?: string; q?: string; page?: number; pageSize?: number };

export async function listBookings(f: BookingFilters): Promise<{ rows: BookingRow[]; total: number; byStatus: Record<string, number> }> {
  const where: SQL[] = [];
  if (f.stateId) where.push(sql`br.state_id = ${f.stateId}`);
  if (f.cityId) where.push(sql`br.city_id = ${f.cityId}`);
  if (f.practitionerId) where.push(sql`b.practitioner_id = ${f.practitionerId}`);
  if (f.clinicId) where.push(sql`br.clinic_id = ${f.clinicId}`);
  if (f.patientId) where.push(sql`b.patient_id = ${f.patientId}`);
  if (f.bookingId) where.push(sql`b.id = ${f.bookingId}`);
  if (f.source) where.push(sql`b.source = ${f.source}::booking_source`);
  if (f.status) where.push(sql`b.status = ${f.status}::booking_status`);
  if (f.q?.trim()) where.push(sql`b.reference ILIKE ${"%" + f.q.trim() + "%"}`);
  const col = f.dateType === "appointment" ? sql`b.starts_at` : f.dateType === "completed" ? sql`b.completed_at` : sql`b.created_at`;
  if (f.from) where.push(sql`${col} >= (${f.from}::date)::timestamp AT TIME ZONE 'Asia/Kolkata'`);
  if (f.to) where.push(sql`${col} < ((${f.to}::date + 1))::timestamp AT TIME ZONE 'Asia/Kolkata'`);
  const whereSql = where.length ? sql`WHERE ${sql.join(where, sql` AND `)}` : sql``;
  const pageSize = f.pageSize ?? 50;
  const page = Math.max(1, f.page ?? 1);
  const from = sql`FROM bookings b JOIN practitioners p ON p.id = b.practitioner_id JOIN branches br ON br.id = b.branch_id JOIN clinics c ON c.id = br.clinic_id JOIN cities ci ON ci.id = br.city_id JOIN states st ON st.id = br.state_id JOIN patients pt ON pt.id = b.patient_id JOIN offerings o ON o.id = b.offering_id LEFT JOIN booking_price_snapshots ps ON ps.id = b.price_snapshot_id`;
  const [rows, total, byStatus] = await Promise.all([
    db().execute<BookingRow>(sql`
      SELECT b.id, b.reference, b.status, b.source, b.starts_at AS "startsAt", b.ends_at AS "endsAt", b.created_at AS "createdAt", b.completed_at AS "completedAt", b.cancelled_at AS "cancelledAt",
        p.id AS "practitionerId", p.display_name AS "practitionerName", c.id AS "clinicId", c.name AS "clinicName", br.name AS "branchName", ci.name AS "cityName", st.name AS "stateName",
        pt.id AS "patientId", pt.display_name AS "patientName", pt.mobile AS "patientMobile", o.display_name AS "offeringName", ps.total_paise AS "totalPaise", b.payment_mode AS "paymentMode", (pt.is_test_account OR p.is_test_account) AS "isTest"
      ${from} ${whereSql} ORDER BY ${col} DESC NULLS LAST LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`),
    db().execute<{ n: string }>(sql`SELECT count(*) AS n ${from} ${whereSql}`),
    db().execute<{ status: string; n: string }>(sql`SELECT b.status::text, count(*) AS n ${from} ${whereSql} GROUP BY 1`),
  ]);
  return { rows: rows.rows.map((r) => ({ ...r, totalPaise: r.totalPaise == null ? null : Number(r.totalPaise) })), total: Number(total.rows[0]?.n ?? 0), byStatus: Object.fromEntries(byStatus.rows.map((r) => [r.status, Number(r.n)])) };
}
