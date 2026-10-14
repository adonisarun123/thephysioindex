import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import type { QueueCounts } from "./nav";

/** All sidebar counts in one round trip (ADM-02). */
export async function queueCounts(): Promise<QueueCounts> {
  const res = await db().execute<{ key: string; n: number | string }>(sql`
    SELECT case_type::text AS key, count(*) AS n FROM verification_cases WHERE state IN ('open','in_review','awaiting_evidence') GROUP BY case_type
    UNION ALL SELECT 'enquiries', count(*) FROM enquiries WHERE status = 'new'
    UNION ALL SELECT 'signups', count(*) FROM practitioner_signups WHERE status = 'new'
    UNION ALL SELECT 'support', count(*) FROM support_cases WHERE state IN ('open','in_progress')
    UNION ALL SELECT 'privacy', count(*) FROM privacy_requests WHERE state IN ('received','verified','in_progress')
    UNION ALL SELECT 'content_blog', count(*) FROM content_articles WHERE kind = 'blog' AND status = 'in_review'
    UNION ALL SELECT 'content_condition', count(*) FROM content_articles WHERE kind = 'condition' AND status = 'in_review'
    UNION ALL SELECT 'content_news', count(*) FROM content_articles WHERE kind = 'news' AND status = 'in_review'
    UNION ALL SELECT 'bookings_today', count(*) FROM bookings WHERE status = 'confirmed' AND (starts_at AT TIME ZONE 'Asia/Kolkata')::date = (now() AT TIME ZONE 'Asia/Kolkata')::date
  `);
  return Object.fromEntries(res.rows.map((r) => [r.key, Number(r.n)]));
}
