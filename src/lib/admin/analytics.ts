import { sql } from "drizzle-orm";
import { db } from "@/db/client";

/**
 * Admin metrics per Section 16 "Metric definitions" (ANA-01, ANA-03).
 * Computed from authoritative rows at request time; test accounts are
 * excluded; Asia/Kolkata day boundaries; small cohorts are suppressed by the
 * page.
 */

export type DateType = "created" | "appointment" | "completed";

export type Analytics = {
  refreshedAt: Date;
  profiles: { published: number; claimed: number; verified: number; bookable: number };
  bookingsByStatus: { status: string; n: number; valuePaise: number }[];
  completedVisits: number;
  cancellation: { confirmedCohort: number; patient: number; provider: number };
  noShow: { noShow: number; completed: number };
  bookingValuePaise: number;
  conversion: { confirmed: number; starts: number };
  turnaround: { medianHours: number | null; p90Hours: number | null; decided: number };
  bySource: { source: string; n: number }[];
};

const col = (t: DateType) => (t === "appointment" ? sql`b.starts_at` : t === "completed" ? sql`b.completed_at` : sql`b.created_at`);

export async function loadAnalytics(from: string, to: string, dateType: DateType): Promise<Analytics> {
  const d = db();
  const range = (c: ReturnType<typeof sql>) => sql`${c} >= (${from}::date)::timestamp AT TIME ZONE 'Asia/Kolkata' AND ${c} < ((${to}::date + 1))::timestamp AT TIME ZONE 'Asia/Kolkata'`;
  const base = sql`FROM bookings b JOIN patients pt ON pt.id = b.patient_id JOIN practitioners p ON p.id = b.practitioner_id LEFT JOIN booking_price_snapshots ps ON ps.id = b.price_snapshot_id WHERE NOT pt.is_test_account AND NOT p.is_test_account`;
  const [profiles, byStatus, completed, cancel, noShow, conv, turnaround, bySource] = await Promise.all([
    d.execute<{ published: string; claimed: string; verified: string; bookable: string }>(sql`
      SELECT count(*) AS published, count(*) FILTER (WHERE claim_state = 'claimed') AS claimed,
        count(*) FILTER (WHERE EXISTS (SELECT 1 FROM credentials c WHERE c.practitioner_id = p.id AND c.status IN ('registration_checked','document_reviewed'))) AS verified,
        count(*) FILTER (WHERE booking_eligible AND NOT booking_paused) AS bookable
      FROM practitioners p WHERE listing_status = 'published' AND suspended_at IS NULL AND NOT is_test_account`),
    d.execute<{ status: string; n: string; value: string | null }>(sql`SELECT b.status::text, count(*) AS n, coalesce(sum(ps.total_paise), 0) AS value ${base} AND ${range(col(dateType))} GROUP BY 1 ORDER BY 1`),
    d.execute<{ n: string }>(sql`SELECT count(*) AS n ${base} AND b.status = 'completed' AND ${range(sql`b.starts_at`)}`),
    d.execute<{ cohort: string; patient: string; provider: string }>(sql`
      SELECT count(*) FILTER (WHERE b.status IN ('confirmed','completed','patient_cancelled','provider_cancelled','no_show')) AS cohort,
        count(*) FILTER (WHERE b.status = 'patient_cancelled') AS patient, count(*) FILTER (WHERE b.status = 'provider_cancelled') AS provider
      ${base} AND ${range(col(dateType))}`),
    d.execute<{ no_show: string; completed: string }>(sql`SELECT count(*) FILTER (WHERE b.status = 'no_show') AS no_show, count(*) FILTER (WHERE b.status = 'completed') AS completed ${base} AND b.ends_at < now() AND ${range(sql`b.starts_at`)}`),
    d.execute<{ confirmed: string; starts: string }>(sql`
      SELECT (SELECT count(*) ${base} AND b.source = 'platform' AND b.status IN ('confirmed','completed','patient_cancelled','provider_cancelled','no_show') AND ${range(sql`b.created_at`)}) AS confirmed,
             (SELECT count(*) FROM analytics.events e WHERE e.event_type = 'booking_start' AND ${range(sql`e.occurred_at`)}) AS starts`),
    d.execute<{ median: string | null; p90: string | null; n: string }>(sql`
      SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM (decided_at - submitted_at)) / 3600) AS median,
             percentile_cont(0.9) WITHIN GROUP (ORDER BY extract(epoch FROM (decided_at - submitted_at)) / 3600) AS p90, count(*) AS n
      FROM verification_cases WHERE decided_at IS NOT NULL AND case_type IN ('listing_review','profile_change') AND decided_at >= (${from}::date)::timestamp AT TIME ZONE 'Asia/Kolkata' AND decided_at < ((${to}::date + 1))::timestamp AT TIME ZONE 'Asia/Kolkata'`),
    d.execute<{ source: string; n: string }>(sql`SELECT b.source::text, count(*) AS n ${base} AND ${range(col(dateType))} GROUP BY 1 ORDER BY 1`),
  ]);
  const statuses = byStatus.rows.map((r) => ({ status: r.status, n: Number(r.n), valuePaise: Number(r.value ?? 0) }));
  return {
    refreshedAt: new Date(),
    profiles: { published: Number(profiles.rows[0]?.published ?? 0), claimed: Number(profiles.rows[0]?.claimed ?? 0), verified: Number(profiles.rows[0]?.verified ?? 0), bookable: Number(profiles.rows[0]?.bookable ?? 0) },
    bookingsByStatus: statuses,
    completedVisits: Number(completed.rows[0]?.n ?? 0),
    cancellation: { confirmedCohort: Number(cancel.rows[0]?.cohort ?? 0), patient: Number(cancel.rows[0]?.patient ?? 0), provider: Number(cancel.rows[0]?.provider ?? 0) },
    noShow: { noShow: Number(noShow.rows[0]?.no_show ?? 0), completed: Number(noShow.rows[0]?.completed ?? 0) },
    bookingValuePaise: statuses.filter((s) => s.status === "confirmed" || s.status === "completed").reduce((a, s) => a + s.valuePaise, 0),
    conversion: { confirmed: Number(conv.rows[0]?.confirmed ?? 0), starts: Number(conv.rows[0]?.starts ?? 0) },
    turnaround: { medianHours: turnaround.rows[0]?.median == null ? null : Number(turnaround.rows[0].median), p90Hours: turnaround.rows[0]?.p90 == null ? null : Number(turnaround.rows[0].p90), decided: Number(turnaround.rows[0]?.n ?? 0) },
    bySource: bySource.rows.map((r) => ({ source: r.source, n: Number(r.n) })),
  };
}

/** ANA-03: cohorts under five are suppressed to reduce re-identification. Zero stays zero. */
export function suppress(n: number): string {
  return n > 0 && n < 5 ? "<5" : String(n);
}
