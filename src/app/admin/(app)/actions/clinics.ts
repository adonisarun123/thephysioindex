"use server";

import { revalidatePath } from "next/cache";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { withTransaction } from "@/db/client";
import { ApiError } from "@/lib/api";
import { audit } from "@/lib/audit";
import { requireStaff } from "@/lib/auth/session";
import { act, parseForm, zOpt, zReason, zReq, zUuid } from "@/lib/admin/forms";
import { actorRole } from "@/lib/admin/practitioner-ops";
import { textArray } from "@/lib/sql";

function revalidate(clinicId: string) {
  revalidatePath(`/admin/clinics/${clinicId}`);
  revalidatePath("/admin/clinics");
}

const clinicSchema = z.object({
  clinicId: zUuid,
  name: zReq(160, 2),
  legalName: zOpt(200),
  publicPhone: zOpt(20),
  publicEmail: zOpt(200),
  website: zOpt(300),
  about: zOpt(3000),
  status: z.enum(["draft", "published", "suspended", "archived"]),
  reason: zReason,
});

/** LOC-01: clinic record edits. Status changes are audited with a reason (ADM-05). */
export async function updateClinicAction(fd: FormData) {
  const v = await requireStaff("verification_reviewer");
  const i = parseForm(clinicSchema, fd);
  await act(`/admin/clinics/${i.clinicId}`, async () => {
    await withTransaction(async (_c, tx) => {
      const before = await tx.execute<{ status: string; name: string }>(sql`SELECT status, name FROM clinics WHERE id = ${i.clinicId} FOR UPDATE`);
      if (!before.rows[0]) throw new ApiError("NOT_FOUND", "Clinic not found");
      if (i.status === "suspended" || i.status === "archived") {
        // Suspending a clinic stops new reservations at all of its branches; practitioner-level tasks are created from the branch rows.
        await tx.execute(sql`UPDATE reservations r SET state = 'released', released_reason = ${"clinic " + i.status} FROM branches b WHERE b.id = r.branch_id AND b.clinic_id = ${i.clinicId} AND r.state = 'held'`);
      }
      await tx.execute(sql`UPDATE clinics SET name = ${i.name}, legal_name = ${i.legalName ?? null}, public_phone = ${i.publicPhone ?? null}, public_email = ${i.publicEmail ?? null}, website = ${i.website ?? null}, about = ${i.about ?? null}, status = ${i.status}::clinic_status WHERE id = ${i.clinicId}`);
      await audit({ actorUserId: v.userId, actorRole: actorRole(v), action: "clinic.update", objectType: "clinic", objectId: i.clinicId, reason: i.reason, changedFields: { status: { from: before.rows[0].status, to: i.status }, name: { from: before.rows[0].name, to: i.name } } }, tx);
    });
    revalidate(i.clinicId);
    return { notice: "Clinic updated" };
  });
}

const hoursSchema = z.string().trim().optional().transform((s, ctx) => {
  if (!s) return null;
  try {
    const parsed = JSON.parse(s) as Record<string, { open: string; close: string }[]>;
    for (const [day, windows] of Object.entries(parsed)) {
      if (!/^[0-6]$/.test(day) || !Array.isArray(windows)) throw new Error("bad");
      for (const w of windows) if (!/^\d{2}:\d{2}$/.test(w.open) || !/^\d{2}:\d{2}$/.test(w.close) || w.close <= w.open) throw new Error("bad");
    }
    return parsed;
  } catch {
    ctx.addIssue({ code: "custom", message: 'Working hours must be JSON like {"1":[{"open":"09:00","close":"18:00"}]}' });
    return z.NEVER;
  }
});

const branchSchema = z.object({
  clinicId: zUuid,
  branchId: zUuid,
  name: zReq(120),
  addressLine1: zReq(200),
  addressLine2: zOpt(200),
  localityId: zUuid,
  pinCode: z.string().regex(/^[1-9][0-9]{5}$/, "PIN must be six digits"),
  latitude: zOpt(20),
  longitude: zOpt(20),
  publicPhone: zOpt(20),
  directions: zOpt(1000),
  facilities: zOpt(1000),
  workingHours: hoursSchema,
  reason: zReason,
});

/** LOC-01 / DIR-15: moving a branch to another locality changes discovery placement only. */
export async function updateBranchAction(fd: FormData) {
  const v = await requireStaff("verification_reviewer");
  const i = parseForm(branchSchema, fd);
  await act(`/admin/clinics/${i.clinicId}#branch-${i.branchId}`, async () => {
    const lat = i.latitude ? Number(i.latitude) : null;
    const lng = i.longitude ? Number(i.longitude) : null;
    if ((lat != null && (Number.isNaN(lat) || lat < -90 || lat > 90)) || (lng != null && (Number.isNaN(lng) || lng < -180 || lng > 180))) throw new ApiError("INVALID_INPUT", "Coordinates out of range");
    await withTransaction(async (_c, tx) => {
      const before = await tx.execute<{ locality_id: string; city_id: string }>(sql`SELECT locality_id, city_id FROM branches WHERE id = ${i.branchId} AND clinic_id = ${i.clinicId} FOR UPDATE`);
      if (!before.rows[0]) throw new ApiError("NOT_FOUND", "Branch not found");
      const loc = await tx.execute<{ city_id: string; state_id: string }>(sql`SELECT l.city_id, c.state_id FROM localities l JOIN cities c ON c.id = l.city_id WHERE l.id = ${i.localityId} AND l.status = 'active'`);
      if (!loc.rows[0]) throw new ApiError("INVALID_INPUT", "Locality not found or inactive");
      const facilities = i.facilities ? i.facilities.split(",").map((s) => s.trim()).filter(Boolean) : null;
      await tx.execute(sql`UPDATE branches SET name = ${i.name}, address_line1 = ${i.addressLine1}, address_line2 = ${i.addressLine2 ?? null}, locality_id = ${i.localityId}, city_id = ${loc.rows[0].city_id}, state_id = ${loc.rows[0].state_id},
        pin_code = ${i.pinCode}, latitude = ${lat}, longitude = ${lng}, geocode_source = CASE WHEN ${lat != null} THEN 'staff' ELSE geocode_source END, public_phone = ${i.publicPhone ?? null}, directions = ${i.directions ?? null},
        facilities = ${textArray(facilities)}, working_hours = ${i.workingHours ? JSON.stringify(i.workingHours) : null}::jsonb WHERE id = ${i.branchId}`);
      await audit({ actorUserId: v.userId, actorRole: actorRole(v), action: "branch.update", objectType: "branch", objectId: i.branchId, reason: i.reason, changedFields: { localityId: { from: before.rows[0].locality_id, to: i.localityId }, cityId: { from: before.rows[0].city_id, to: loc.rows[0].city_id } } }, tx);
    });
    revalidate(i.clinicId);
    return { notice: "Branch updated" };
  });
}

export async function branchStatusAction(fd: FormData) {
  const v = await requireStaff("verification_reviewer");
  const { clinicId, branchId, status, reason } = parseForm(z.object({ clinicId: zUuid, branchId: zUuid, status: z.enum(["draft", "published", "suspended", "archived"]), reason: zReason }), fd);
  if (status === "suspended" || status === "archived") await requireStaff("super_admin");
  await act(`/admin/clinics/${clinicId}#branch-${branchId}`, async () => {
    await withTransaction(async (_c, tx) => {
      const before = await tx.execute<{ status: string }>(sql`SELECT status FROM branches WHERE id = ${branchId} AND clinic_id = ${clinicId} FOR UPDATE`);
      if (!before.rows[0]) throw new ApiError("NOT_FOUND", "Branch not found");
      await tx.execute(sql`UPDATE branches SET status = ${status}::branch_status WHERE id = ${branchId}`);
      let tasks = 0;
      if (status === "suspended" || status === "archived") {
        await tx.execute(sql`UPDATE reservations SET state = 'released', released_reason = ${"branch " + status} WHERE branch_id = ${branchId} AND state = 'held'`);
        const r = await tx.execute(sql`INSERT INTO resolution_tasks (kind, booking_id, practitioner_id, branch_id, due_at, details)
          SELECT 'other', b.id, b.practitioner_id, b.branch_id, b.starts_at, ${JSON.stringify({ cause: `branch_${status}`, reason })}::jsonb FROM bookings b WHERE b.branch_id = ${branchId} AND b.status IN ('confirmed','requested') AND b.starts_at > now()
            AND NOT EXISTS (SELECT 1 FROM resolution_tasks t WHERE t.booking_id = b.id AND t.state IN ('open','in_progress'))`);
        tasks = r.rowCount ?? 0;
      }
      await audit({ actorUserId: v.userId, actorRole: actorRole(v), action: `branch.${status}`, objectType: "branch", objectId: branchId, reason, changedFields: { status: { from: before.rows[0].status, to: status }, resolutionTasks: tasks } }, tx);
    });
    revalidate(clinicId);
    return { notice: `Branch ${status}` };
  });
}
