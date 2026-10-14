"use server";

import { sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ApiError } from "@/lib/api";
import { countAffectedBookings, istToUtc, mutateSchedule, WORKSPACE_TZ } from "@/lib/workspace/calendar";
import { requireManage } from "@/lib/workspace/context";
import { done, failTo, list, opt, str } from "@/lib/workspace/forms";

/**
 * Schedule inputs (CAL-05, CAL-06, PRO-15). Every mutation locks
 * calendar_resources, writes, and increments schedule_version in one
 * transaction (CAL-09). Existing confirmed appointments are never moved or
 * cancelled here; the preview count tells the practitioner what is affected.
 */

const PAGE = "/workspace/calendar";
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const RuleSchema = z
  .object({
    branchId: z.uuid("Choose a clinic"),
    weekdays: z.array(z.coerce.number().int().min(0).max(6)).min(1, "Choose at least one weekday"),
    localStart: z.string().regex(TIME, "Start time must be HH:MM"),
    localEnd: z.string().regex(TIME, "End time must be HH:MM"),
    effectiveFrom: z.string().regex(DATE, "Use YYYY-MM-DD"),
    effectiveTo: z.string().regex(DATE, "Use YYYY-MM-DD").optional(),
  })
  .refine((r) => r.localEnd > r.localStart, { message: "End time must be after start time", path: ["localEnd"] })
  .refine((r) => !r.effectiveTo || r.effectiveTo >= r.effectiveFrom, { message: "Effective-to must not be before effective-from", path: ["effectiveTo"] });

export async function addRuleAction(formData: FormData) {
  try {
    const { viewer, practitioner } = await requireManage();
    const input = RuleSchema.parse({
      branchId: str(formData, "branchId"),
      weekdays: list(formData, "weekdays"),
      localStart: str(formData, "localStart"),
      localEnd: str(formData, "localEnd"),
      effectiveFrom: opt(formData, "effectiveFrom") ?? new Date().toLocaleDateString("en-CA", { timeZone: WORKSPACE_TZ }),
      effectiveTo: opt(formData, "effectiveTo"),
    });
    await mutateSchedule(practitioner.id, viewer.userId, "calendar.rule.add", async ({ tx, resourceId, nextVersion }) => {
      const pb = await tx.execute<{ id: string }>(sql`SELECT id FROM practitioner_branches WHERE practitioner_id = ${practitioner.id} AND branch_id = ${input.branchId} AND state IN ('pending', 'approved') AND active_to IS NULL`);
      if (!pb.rows[0]) throw new ApiError("INVALID_INPUT", "You are not associated with this clinic");
      for (const weekday of input.weekdays) {
        const overlap = await tx.execute<{ id: string }>(sql`
          SELECT id FROM availability_rules WHERE resource_id = ${resourceId} AND branch_id = ${input.branchId} AND weekday = ${weekday}
            AND (effective_to IS NULL OR effective_to >= ${input.effectiveFrom}::date) AND effective_from <= ${input.effectiveTo ?? "9999-12-31"}::date
            AND local_start < ${input.localEnd}::time AND local_end > ${input.localStart}::time LIMIT 1`);
        if (overlap.rows[0]) throw new ApiError("CONFLICT", `A window already overlaps ${input.localStart}–${input.localEnd} on weekday ${weekday} at this clinic`);
        await tx.execute(sql`
          INSERT INTO availability_rules (resource_id, branch_id, weekday, local_start, local_end, timezone, effective_from, effective_to, schedule_version, created_by_user_id)
          VALUES (${resourceId}, ${input.branchId}, ${weekday}, ${input.localStart}::time, ${input.localEnd}::time, ${WORKSPACE_TZ}, ${input.effectiveFrom}::date, ${input.effectiveTo ?? null}, ${nextVersion}, ${viewer.userId})`);
      }
    });
    revalidatePath(PAGE);
    done(PAGE, { ok: `Weekly hours added for ${input.weekdays.length} day(s). Times are ${WORKSPACE_TZ}.` });
  } catch (err) {
    failTo(`${PAGE}#weekly`, err);
  }
}

/** Removing a window ends it today (effective_to) rather than deleting history; a reduction with future bookings opens a task (CAL-09). */
export async function removeRuleAction(formData: FormData) {
  try {
    const { viewer, practitioner } = await requireManage();
    const ruleId = str(formData, "ruleId");
    const affected = await mutateSchedule(practitioner.id, viewer.userId, "calendar.rule.end", async ({ tx, resourceId }) => {
      const r = await tx.execute<{ id: string; branch_id: string; weekday: number; local_start: string; local_end: string }>(sql`
        SELECT id, branch_id, weekday, local_start::text AS local_start, local_end::text AS local_end FROM availability_rules WHERE id = ${ruleId} AND resource_id = ${resourceId}`);
      const rule = r.rows[0];
      if (!rule) throw new ApiError("NOT_FOUND", "Window not found");
      // A window that has not started yet is removed outright; a live one is ended today so history stays intact.
      const deleted = await tx.execute(sql`DELETE FROM availability_rules WHERE id = ${rule.id} AND effective_from > current_date`);
      if (deleted.rowCount === 0) {
        await tx.execute(sql`UPDATE availability_rules SET effective_to = least(coalesce(effective_to, current_date), current_date) WHERE id = ${rule.id}`);
      }
      const n = await tx.execute<{ n: string | number }>(sql`
        SELECT count(*) AS n FROM bookings WHERE practitioner_id = ${practitioner.id} AND branch_id = ${rule.branch_id} AND status = 'confirmed' AND starts_at > now()
          AND extract(dow from starts_at AT TIME ZONE ${WORKSPACE_TZ}) = ${rule.weekday}
          AND (starts_at AT TIME ZONE ${WORKSPACE_TZ})::time >= ${rule.local_start}::time AND (ends_at AT TIME ZONE ${WORKSPACE_TZ})::time <= ${rule.local_end}::time`);
      const count = Number(n.rows[0]?.n ?? 0);
      if (count > 0) {
        await tx.execute(sql`INSERT INTO resolution_tasks (kind, practitioner_id, branch_id, details) VALUES ('schedule_reduced', ${practitioner.id}, ${rule.branch_id}, ${JSON.stringify({ ruleId: rule.id, futureBookings: count })}::jsonb)`);
      }
      return count;
    });
    revalidatePath(PAGE);
    done(PAGE, { ok: affected > 0 ? `Window ended. ${affected} future appointment(s) fall inside it and are preserved; a resolution task was created.` : "Window ended from today." });
  } catch (err) {
    failTo(`${PAGE}#weekly`, err);
  }
}

const ExceptionSchema = z
  .object({
    kind: z.enum(["leave", "manual_block", "date_override"]),
    branchId: z.uuid().optional(),
    startDate: z.string().regex(DATE, "Use YYYY-MM-DD"),
    startTime: z.string().regex(TIME).optional(),
    endDate: z.string().regex(DATE, "Use YYYY-MM-DD").optional(),
    endTime: z.string().regex(TIME).optional(),
    reason: z.string().trim().max(200).optional(),
    windows: z.array(z.object({ branchId: z.uuid(), start: z.string().regex(TIME), end: z.string().regex(TIME) }).refine((w) => w.end > w.start, { message: "Window end must be after start" })).max(4),
  });

export async function addExceptionAction(formData: FormData) {
  try {
    const { viewer, practitioner } = await requireManage();
    const windows = [0, 1, 2, 3]
      .map((i) => ({ branchId: str(formData, `w${i}Branch`), start: str(formData, `w${i}Start`), end: str(formData, `w${i}End`) }))
      .filter((w) => w.start && w.end);
    const input = ExceptionSchema.parse({
      kind: str(formData, "kind"),
      branchId: opt(formData, "branchId"),
      startDate: str(formData, "startDate"),
      startTime: opt(formData, "startTime"),
      endDate: opt(formData, "endDate"),
      endTime: opt(formData, "endTime"),
      reason: opt(formData, "reason"),
      windows,
    });
    // Leave spans whole days; blocks use times; a date override replaces one local day (CAL-06).
    const startsAt = input.kind === "manual_block" ? istToUtc(input.startDate, input.startTime ?? "00:00") : istToUtc(input.startDate, "00:00");
    const endDate = input.kind === "date_override" ? input.startDate : input.endDate ?? input.startDate;
    const endsAt = input.kind === "manual_block" ? istToUtc(endDate, input.endTime ?? "23:59") : new Date(istToUtc(endDate, "00:00").getTime() + 24 * 60 * 60 * 1000);
    if (endsAt <= startsAt) throw new ApiError("INVALID_INPUT", "End must be after start");
    // Leave applies to every clinic; blocks may be scoped to one branch (CAL-05).
    const branchId = input.kind === "manual_block" ? input.branchId ?? null : null;
    const affected = await countAffectedBookings(practitioner.id, startsAt, endsAt, branchId);
    await mutateSchedule(practitioner.id, viewer.userId, `calendar.exception.${input.kind}`, async ({ tx, resourceId, nextVersion }) => {
      await tx.execute(sql`
        INSERT INTO schedule_exceptions (resource_id, branch_id, kind, starts_at, ends_at, local_date, replacement_windows, internal_reason, schedule_version, created_by_user_id)
        VALUES (${resourceId}, ${branchId}, ${input.kind}::exception_kind, ${startsAt.toISOString()}::timestamptz, ${endsAt.toISOString()}::timestamptz,
          ${input.kind === "date_override" ? input.startDate : null}, ${input.kind === "date_override" ? JSON.stringify(input.windows) : null}::jsonb, ${input.reason ?? null}, ${nextVersion}, ${viewer.userId})`);
      if (affected > 0) {
        await tx.execute(sql`INSERT INTO resolution_tasks (kind, practitioner_id, branch_id, details) VALUES (${input.kind === "leave" ? "leave_conflict" : "schedule_reduced"}::resolution_task_kind, ${practitioner.id}, ${branchId}, ${JSON.stringify({ kind: input.kind, startsAt, endsAt, affected })}::jsonb)`);
      }
    });
    revalidatePath(PAGE);
    done(PAGE, { ok: affected > 0 ? `Saved. ${affected} confirmed appointment(s) overlap this period; they are kept and a resolution task was created (PRO-15).` : "Saved. No confirmed appointments are affected." });
  } catch (err) {
    failTo(`${PAGE}#exceptions`, err);
  }
}

export async function removeExceptionAction(formData: FormData) {
  try {
    const { viewer, practitioner } = await requireManage();
    const id = str(formData, "exceptionId");
    await mutateSchedule(practitioner.id, viewer.userId, "calendar.exception.remove", async ({ tx, resourceId }) => {
      const res = await tx.execute(sql`DELETE FROM schedule_exceptions WHERE id = ${id} AND resource_id = ${resourceId} AND kind <> 'external_busy'`);
      if (res.rowCount === 0) throw new ApiError("NOT_FOUND", "Entry not found");
    });
    revalidatePath(PAGE);
    done(PAGE, { ok: "Entry removed" });
  } catch (err) {
    failTo(`${PAGE}#exceptions`, err);
  }
}
