import { sql, type SQL } from "drizzle-orm";
import { db } from "@/db/client";

export type DeliveryRow = {
  id: string;
  createdAt: Date;
  scheduledFor: Date;
  sentAt: Date | null;
  state: string;
  channel: string;
  template: string;
  recipientType: string;
  address: string | null;
  bookingId: string | null;
  bookingReference: string | null;
  attempts: number;
  lastError: string | null;
};

/** Delivery records for the operations queue (MSG-01). Addresses are returned for masking in the page. */
export async function listDeliveries(f: { state?: string; page?: number; pageSize?: number }): Promise<{ rows: DeliveryRow[]; total: number; counts: Record<string, number> }> {
  const where: SQL[] = [];
  if (f.state) where.push(sql`d.state = ${f.state}::delivery_state`);
  const whereSql = where.length ? sql`WHERE ${sql.join(where, sql` AND `)}` : sql``;
  const pageSize = f.pageSize ?? 50;
  const page = Math.max(1, f.page ?? 1);
  const [rows, total, counts] = await Promise.all([
    db().execute<DeliveryRow>(sql`
      SELECT d.id, d.created_at AS "createdAt", d.scheduled_for AS "scheduledFor", d.sent_at AS "sentAt", d.state, d.channel, t.event_type AS template,
        d.recipient_type AS "recipientType",
        CASE WHEN d.recipient_type = 'patient' THEN (SELECT p.mobile FROM patients p WHERE p.id = d.recipient_id)
             WHEN d.channel = 'email' THEN (SELECT u.email FROM users u WHERE u.id = d.recipient_id)
             ELSE (SELECT u.mobile FROM users u WHERE u.id = d.recipient_id) END AS address,
        d.booking_id AS "bookingId", b.reference AS "bookingReference", d.attempts, d.last_error AS "lastError"
      FROM notification_deliveries d
      LEFT JOIN notification_templates t ON t.id = d.template_id
      LEFT JOIN bookings b ON b.id = d.booking_id
      ${whereSql}
      ORDER BY d.scheduled_for DESC, d.id LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`),
    db().execute<{ n: string }>(sql`SELECT count(*) AS n FROM notification_deliveries d ${whereSql}`),
    db().execute<{ state: string; n: string }>(sql`SELECT state::text AS state, count(*) AS n FROM notification_deliveries GROUP BY 1`),
  ]);
  return { rows: rows.rows, total: Number(total.rows[0]?.n ?? 0), counts: Object.fromEntries(counts.rows.map((r) => [r.state, Number(r.n)])) };
}
