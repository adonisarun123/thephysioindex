import { createHmac } from "node:crypto";
import { sql } from "drizzle-orm";
import { headers } from "next/headers";
import { after } from "next/server";
import { db } from "@/db/client";

/**
 * First-party, pseudonymous analytics (ANA-02, DAT-17).
 *
 * Only the top of the funnel is recorded as events: search, profile view and
 * booking start. Holds, confirmations, cancellations and outcomes are read
 * from the authoritative booking tables, so there is one source of truth and
 * CSV and on-screen totals reconcile (ANA-03).
 *
 * Never recorded: names, contact details, free-text queries, appointment
 * reasons, IP addresses or user agents. Signed-in visitors get a keyed hash of
 * their account id; anonymous visitors get none (no tracking cookie). Known
 * bots and link previewers are skipped. Nothing here is sent to any third
 * party.
 */

export type EventType = "search" | "profile_view" | "booking_start";

/** Properties are a closed set of non-identifying fields. */
export type EventProps = {
  hasQuery?: boolean;
  specialty?: string;
  language?: string;
  bookableOnly?: boolean;
  resultBucket?: "0" | "1-5" | "6-20" | "21+";
  page?: "first" | "next";
  offeringSelected?: boolean;
};

const BOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|telegram|headless|lighthouse|pingdom|uptime|curl|wget|python-requests|axios|node-fetch/i;

export function isBot(userAgent: string | null): boolean {
  return !userAgent || BOT.test(userAgent);
}

/** Stable keyed hash of an account id; not reversible without the server secret. */
export function pseudonym(userId: string | null | undefined): string | null {
  if (!userId) return null;
  const key = process.env.ANALYTICS_SALT ?? process.env.BETTER_AUTH_SECRET ?? "";
  if (!key) return null;
  return createHmac("sha256", key).update(`tpi-analytics:${userId}`).digest("hex").slice(0, 32);
}

export function resultBucket(n: number): EventProps["resultBucket"] {
  return n === 0 ? "0" : n <= 5 ? "1-5" : n <= 20 ? "6-20" : "21+";
}

type TrackInput = {
  practitionerId?: string | null;
  stateSlug?: string | null;
  citySlug?: string | null;
  userId?: string | null;
  source?: string | null;
  properties?: EventProps;
};

/**
 * Record an event after the response is sent. Never throws and never delays
 * the page; outside a request (scripts, tests) it does nothing.
 */
export async function track(type: EventType, input: TrackInput = {}): Promise<void> {
  let ua: string | null = null;
  try {
    ua = (await headers()).get("user-agent");
  } catch {
    return; // no request scope
  }
  if (isBot(ua)) return;
  const pid = pseudonym(input.userId);
  try {
    after(async () => {
      try {
        await recordEvent(type, { ...input, pseudonymousId: pid });
      } catch (err) {
        console.error("[analytics] dropped event:", err instanceof Error ? err.message : err);
      }
    });
  } catch {
    // not in a request scope
  }
}

/** Direct insert; used by `track` and by tests. */
export async function recordEvent(type: EventType, e: TrackInput & { pseudonymousId?: string | null }): Promise<void> {
  await db().execute(sql`
    INSERT INTO analytics.events (event_type, pseudonymous_id, practitioner_id, state_id, city_id, source, properties)
    VALUES (
      ${type},
      ${e.pseudonymousId ?? null},
      ${e.practitionerId ?? null},
      (SELECT s.id FROM states s WHERE s.slug = ${e.stateSlug ?? null}),
      (SELECT c.id FROM cities c JOIN states s ON s.id = c.state_id WHERE c.slug = ${e.citySlug ?? null} AND s.slug = ${e.stateSlug ?? null}),
      ${e.source ?? null},
      ${JSON.stringify(e.properties ?? {})}::jsonb
    )`);
}

// ---------------------------------------------------------------- utilisation

export type Utilisation = { availableMinutes: number; bookedMinutes: number; ratio: number | null };

/**
 * Section 16 utilisation: booked service minutes ÷ published available
 * service minutes for local dates [from, to] (inclusive, IST).
 *
 * Available = weekly rules (or that day's date override for the branch) plus
 * extra hours, minus leave, manual blocks and external busy time, with
 * overlapping windows merged. Booked = service time of confirmed, completed
 * and no-show bookings; before/after buffers are NOT counted as booked, so
 * a fully booked calendar with buffers reads below 100 %.
 * Test practitioners are excluded when `practitionerId` is null (platform total).
 */
export async function utilisation(from: string, to: string, practitionerId: string | null): Promise<Utilisation> {
  const scope = practitionerId ? sql`cr.practitioner_id = ${practitionerId}` : sql`NOT p.is_test_account`;
  const res = await db().execute<{ available: string | null; booked: string | null }>(sql`
    WITH bounds AS (
      SELECT tstzrange((${from}::date)::timestamp AT TIME ZONE 'Asia/Kolkata', ((${to}::date + 1))::timestamp AT TIME ZONE 'Asia/Kolkata') AS r
    ),
    res AS (
      SELECT cr.id, cr.practitioner_id FROM calendar_resources cr JOIN practitioners p ON p.id = cr.practitioner_id WHERE ${scope}
    ),
    days AS (SELECT d::date AS day FROM generate_series(${from}::date, ${to}::date, interval '1 day') d),
    windows AS (
      SELECT ar.resource_id, tstzrange((dy.day + ar.local_start) AT TIME ZONE 'Asia/Kolkata', (dy.day + ar.local_end) AT TIME ZONE 'Asia/Kolkata') AS w
      FROM days dy
      JOIN availability_rules ar ON ar.weekday = extract(dow FROM dy.day) AND dy.day >= ar.effective_from AND (ar.effective_to IS NULL OR dy.day <= ar.effective_to)
      JOIN res ON res.id = ar.resource_id
      WHERE NOT EXISTS (
        SELECT 1 FROM schedule_exceptions x
        WHERE x.resource_id = ar.resource_id AND x.kind = 'date_override' AND x.local_date = dy.day AND (x.branch_id IS NULL OR x.branch_id = ar.branch_id))
      UNION ALL
      SELECT x.resource_id, tstzrange((x.local_date + (w ->> 'start')::time) AT TIME ZONE 'Asia/Kolkata', (x.local_date + (w ->> 'end')::time) AT TIME ZONE 'Asia/Kolkata')
      FROM schedule_exceptions x
      JOIN res ON res.id = x.resource_id
      CROSS JOIN LATERAL jsonb_array_elements(coalesce(x.replacement_windows, '[]'::jsonb)) w
      WHERE x.kind = 'date_override' AND x.local_date BETWEEN ${from}::date AND ${to}::date
      UNION ALL
      SELECT x.resource_id, tstzrange(x.starts_at, x.ends_at)
      FROM schedule_exceptions x JOIN res ON res.id = x.resource_id
      WHERE x.kind = 'extra_hours'
    ),
    avail AS (
      SELECT w.resource_id, range_agg(w.w) * tstzmultirange((SELECT r FROM bounds)) AS mr
      FROM windows w WHERE NOT isempty(w.w) GROUP BY w.resource_id
    ),
    blocked AS (
      SELECT x.resource_id, range_agg(tstzrange(x.starts_at, x.ends_at)) AS mr
      FROM schedule_exceptions x JOIN res ON res.id = x.resource_id
      WHERE x.kind IN ('leave', 'manual_block', 'external_busy') AND tstzrange(x.starts_at, x.ends_at) && (SELECT r FROM bounds)
      GROUP BY x.resource_id
    ),
    net AS (
      SELECT a.resource_id, a.mr - coalesce(b.mr, '{}'::tstzmultirange) AS mr FROM avail a LEFT JOIN blocked b ON b.resource_id = a.resource_id
    ),
    available AS (
      SELECT coalesce(sum(extract(epoch FROM (upper(r) - lower(r))) / 60), 0) AS minutes FROM net CROSS JOIN LATERAL unnest(net.mr) r
    ),
    booked AS (
      SELECT coalesce(sum(extract(epoch FROM (b.ends_at - b.starts_at)) / 60), 0) AS minutes
      FROM bookings b JOIN res ON res.practitioner_id = b.practitioner_id JOIN patients pt ON pt.id = b.patient_id
      WHERE b.status IN ('confirmed', 'completed', 'no_show') AND b.starts_at <@ (SELECT r FROM bounds)
        AND (${practitionerId}::uuid IS NOT NULL OR NOT pt.is_test_account)
    )
    SELECT (SELECT minutes FROM available) AS available, (SELECT minutes FROM booked) AS booked`);
  const available = Math.round(Number(res.rows[0]?.available ?? 0));
  const booked = Math.round(Number(res.rows[0]?.booked ?? 0));
  return { availableMinutes: available, bookedMinutes: booked, ratio: available > 0 ? booked / available : null };
}

// ---------------------------------------------------------------- practitioner funnel

export type PractitionerFunnel = { profileViews: number; bookingStarts: number; confirmed: number; refreshedAt: Date };

/** ANA-03 practitioner dashboard: last N days, computed on request (well within the 5-minute freshness target). */
export async function practitionerFunnel(practitionerId: string, days = 30): Promise<PractitionerFunnel> {
  const res = await db().execute<{ views: string; starts: string; confirmed: string }>(sql`
    SELECT
      (SELECT count(*) FROM analytics.events WHERE practitioner_id = ${practitionerId} AND event_type = 'profile_view' AND occurred_at >= now() - make_interval(days => ${days})) AS views,
      (SELECT count(*) FROM analytics.events WHERE practitioner_id = ${practitionerId} AND event_type = 'booking_start' AND occurred_at >= now() - make_interval(days => ${days})) AS starts,
      (SELECT count(*) FROM bookings WHERE practitioner_id = ${practitionerId} AND source = 'platform' AND created_at >= now() - make_interval(days => ${days})
         AND status IN ('confirmed', 'completed', 'patient_cancelled', 'provider_cancelled', 'no_show')) AS confirmed`);
  const r = res.rows[0];
  return { profileViews: Number(r?.views ?? 0), bookingStarts: Number(r?.starts ?? 0), confirmed: Number(r?.confirmed ?? 0), refreshedAt: new Date() };
}
