import { sql } from "drizzle-orm";
import { db, withTransaction, type Db } from "@/db/client";
import { audit } from "@/lib/audit";
import { ApiError } from "@/lib/api";

/**
 * Schedule inputs (CAL-05, CAL-06, CAL-09). Every change runs in one
 * transaction that locks the practitioner's calendar_resources row first and
 * increments schedule_version, so new reservations always see the latest
 * schedule (CAL-09, BKG-07). No network calls happen while the lock is held.
 */

export const WORKSPACE_TZ = "Asia/Kolkata";

export type ScheduleCtx = { tx: Db; resourceId: string; nextVersion: number };

export async function mutateSchedule<T>(practitionerId: string, actorUserId: string, action: string, fn: (ctx: ScheduleCtx) => Promise<T>): Promise<T> {
  return withTransaction(async (_client, tx) => {
    const locked = await tx.execute<{ id: string; schedule_version: string | number }>(sql`SELECT id, schedule_version FROM calendar_resources WHERE practitioner_id = ${practitionerId} FOR UPDATE`);
    const row = locked.rows[0];
    if (!row) throw new ApiError("NOT_FOUND", "Calendar not initialised for this profile");
    const nextVersion = Number(row.schedule_version) + 1;
    const result = await fn({ tx, resourceId: row.id, nextVersion });
    await tx.execute(sql`UPDATE calendar_resources SET schedule_version = ${nextVersion} WHERE id = ${row.id}`);
    await tx.execute(sql`
      INSERT INTO outbox_events (aggregate_type, aggregate_id, aggregate_version, event_type, payload)
      VALUES ('calendar_resource', ${row.id}::uuid, ${nextVersion}, 'schedule.updated', ${JSON.stringify({ practitionerId, scheduleVersion: nextVersion, action })}::jsonb)`);
    await audit({ actorUserId, action, objectType: "calendar_resource", objectId: row.id, changedFields: { scheduleVersion: nextVersion } }, tx);
    return result;
  });
}

/** Confirmed bookings overlapping an interval — the CAL-09 preview before a leave or block is saved. */
export async function countAffectedBookings(practitionerId: string, startsAt: Date, endsAt: Date, branchId?: string | null): Promise<number> {
  const res = await db().execute<{ n: string | number }>(sql`
    SELECT count(*) AS n FROM bookings
    WHERE practitioner_id = ${practitionerId} AND status = 'confirmed'
      AND tstzrange(starts_at, ends_at, '[)') && tstzrange(${startsAt.toISOString()}::timestamptz, ${endsAt.toISOString()}::timestamptz, '[)')
      ${branchId ? sql`AND branch_id = ${branchId}` : sql``}`);
  return Number(res.rows[0]?.n ?? 0);
}

/** Confirmed future bookings on a weekday/time window at a branch — preview for removing a recurring rule (CAL-09). */
export async function countBookingsMatchingRule(practitionerId: string, branchId: string, weekday: number, localStart: string, localEnd: string): Promise<number> {
  const res = await db().execute<{ n: string | number }>(sql`
    SELECT count(*) AS n FROM bookings
    WHERE practitioner_id = ${practitionerId} AND branch_id = ${branchId} AND status = 'confirmed' AND starts_at > now()
      AND extract(dow from starts_at AT TIME ZONE ${WORKSPACE_TZ}) = ${weekday}
      AND (starts_at AT TIME ZONE ${WORKSPACE_TZ})::time >= ${localStart}::time
      AND (ends_at AT TIME ZONE ${WORKSPACE_TZ})::time <= ${localEnd}::time`);
  return Number(res.rows[0]?.n ?? 0);
}

/** Local Asia/Kolkata wall-clock date + time → UTC instant. IST has no DST, so a fixed offset is exact. */
export function istToUtc(date: string, time: string): Date {
  const d = new Date(`${date}T${time.length === 5 ? `${time}:00` : time}+05:30`);
  if (Number.isNaN(d.getTime())) throw new ApiError("INVALID_INPUT", "Invalid date or time");
  return d;
}

export function formatIst(d: Date | string, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }): string {
  return new Date(d).toLocaleString("en-IN", { ...opts, timeZone: WORKSPACE_TZ });
}

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
