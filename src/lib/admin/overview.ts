import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { getConfig } from "@/lib/config";
import { isOverdue } from "./format";

/** Overview read models: funnel, queue ageing, trend windows, recent audit. One round trip per panel. */

export type Overview = {
  funnel: { listingStatus: string; n: number }[];
  claimed: number;
  verified: number;
  bookable: number;
  queues: { caseType: string; open: number; oldestAt: Date | null; overdue: number }[];
  bookingsToday: { status: string; n: number }[];
  trend: { publishedLast7: number; publishedPrior7: number; decidedLast7: number; decidedPrior7: number; bookingsLast7: number; bookingsPrior7: number };
  recentAudit: { id: string; action: string; objectType: string; objectId: string | null; actorName: string | null; reason: string | null; occurredAt: Date }[];
  staffCount: number;
  openTasks: number;
  target: number;
};

export async function loadOverview(): Promise<Overview> {
  const d = db();
  const [funnel, totals, openCases, bookingsToday, trend, recentAudit, staff, tasks, target] = await Promise.all([
    d.execute<{ listingStatus: string; n: string }>(sql`SELECT listing_status::text AS "listingStatus", count(*) AS n FROM practitioners WHERE NOT is_test_account GROUP BY 1`),
    d.execute<{ claimed: string; verified: string; bookable: string }>(sql`
      SELECT count(*) FILTER (WHERE claim_state = 'claimed') AS claimed,
             count(*) FILTER (WHERE EXISTS (SELECT 1 FROM credentials c WHERE c.practitioner_id = p.id AND c.status IN ('registration_checked','document_reviewed'))) AS verified,
             count(*) FILTER (WHERE booking_eligible AND NOT booking_paused) AS bookable
      FROM practitioners p WHERE listing_status = 'published' AND NOT is_test_account`),
    d.execute<{ caseType: string; submittedAt: Date; firstResponseAt: Date | null }>(sql`SELECT case_type::text AS "caseType", submitted_at AS "submittedAt", first_response_at AS "firstResponseAt" FROM verification_cases WHERE state IN ('open','in_review','awaiting_evidence')`),
    d.execute<{ status: string; n: string }>(sql`SELECT status::text, count(*) AS n FROM bookings b JOIN patients pt ON pt.id = b.patient_id WHERE NOT pt.is_test_account AND (b.starts_at AT TIME ZONE 'Asia/Kolkata')::date = (now() AT TIME ZONE 'Asia/Kolkata')::date GROUP BY 1`),
    d.execute<{ k: string; n: string }>(sql`
      SELECT 'publishedLast7' AS k, count(*) AS n FROM practitioners WHERE published_at >= now() - interval '7 days' AND NOT is_test_account
      UNION ALL SELECT 'publishedPrior7', count(*) FROM practitioners WHERE published_at >= now() - interval '14 days' AND published_at < now() - interval '7 days' AND NOT is_test_account
      UNION ALL SELECT 'decidedLast7', count(*) FROM verification_cases WHERE decided_at >= now() - interval '7 days'
      UNION ALL SELECT 'decidedPrior7', count(*) FROM verification_cases WHERE decided_at >= now() - interval '14 days' AND decided_at < now() - interval '7 days'
      UNION ALL SELECT 'bookingsLast7', count(*) FROM bookings WHERE created_at >= now() - interval '7 days'
      UNION ALL SELECT 'bookingsPrior7', count(*) FROM bookings WHERE created_at >= now() - interval '14 days' AND created_at < now() - interval '7 days'`),
    d.execute<Overview["recentAudit"][number]>(sql`
      SELECT a.id, a.action, a.object_type AS "objectType", a.object_id AS "objectId", coalesce(u.display_name, u.email) AS "actorName", a.reason, a.occurred_at AS "occurredAt"
      FROM audit_events a LEFT JOIN users u ON u.id = a.actor_user_id ORDER BY a.occurred_at DESC LIMIT 10`),
    d.execute<{ n: string }>(sql`SELECT count(DISTINCT user_id) AS n FROM role_assignments WHERE revoked_at IS NULL AND role IN ('verification_reviewer','support_agent','analyst','super_admin')`),
    d.execute<{ n: string }>(sql`SELECT count(*) AS n FROM resolution_tasks WHERE state IN ('open','in_progress')`),
    getConfig<number>("admin.first_response_target_business_days", 2),
  ]);
  const byType = new Map<string, { open: number; oldestAt: Date | null; overdue: number }>();
  for (const c of openCases.rows) {
    const cur = byType.get(c.caseType) ?? { open: 0, oldestAt: null, overdue: 0 };
    cur.open += 1;
    const s = new Date(c.submittedAt);
    if (!cur.oldestAt || s < cur.oldestAt) cur.oldestAt = s;
    if (isOverdue(c.submittedAt, c.firstResponseAt, target)) cur.overdue += 1;
    byType.set(c.caseType, cur);
  }
  const t = Object.fromEntries(trend.rows.map((r) => [r.k, Number(r.n)])) as Record<string, number>;
  return {
    funnel: funnel.rows.map((r) => ({ listingStatus: r.listingStatus, n: Number(r.n) })),
    claimed: Number(totals.rows[0]?.claimed ?? 0),
    verified: Number(totals.rows[0]?.verified ?? 0),
    bookable: Number(totals.rows[0]?.bookable ?? 0),
    queues: [...byType.entries()].map(([caseType, x]) => ({ caseType, ...x })).sort((a, b) => b.overdue - a.overdue || b.open - a.open),
    bookingsToday: bookingsToday.rows.map((r) => ({ status: r.status, n: Number(r.n) })),
    trend: { publishedLast7: t.publishedLast7 ?? 0, publishedPrior7: t.publishedPrior7 ?? 0, decidedLast7: t.decidedLast7 ?? 0, decidedPrior7: t.decidedPrior7 ?? 0, bookingsLast7: t.bookingsLast7 ?? 0, bookingsPrior7: t.bookingsPrior7 ?? 0 },
    recentAudit: recentAudit.rows,
    staffCount: Number(staff.rows[0]?.n ?? 0),
    openTasks: Number(tasks.rows[0]?.n ?? 0),
    target,
  };
}
