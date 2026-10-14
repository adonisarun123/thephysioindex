import { sql } from "drizzle-orm";
import { z } from "zod";
import { db, withTransaction } from "@/db/client";
import { audit } from "@/lib/audit";
import { ApiError } from "@/lib/api";
import { offeringDefaults, type OfferingDefaults } from "./catalog";

/**
 * Offerings and immutable offering versions (CAL-02, CAL-03, OFR-01, OFR-02).
 * Every edit creates a new offering_versions row and repoints
 * offerings.current_version_id; bookings keep referencing the version they
 * accepted.
 */

export const OfferingInputSchema = z.object({
  serviceId: z.uuid("Choose a service"),
  displayName: z.string().trim().min(2, "Display name is too short").max(120),
  description: z.string().trim().max(400).optional().or(z.literal("")),
  basePricePaise: z.number().int().min(0, "Fee cannot be negative").max(10_000_000),
  taxPaise: z.number().int().min(0).max(10_000_000).default(0),
  extraChargesPaise: z.number().int().min(0).max(10_000_000).default(0),
  priceNote: z.string().trim().max(200).optional().or(z.literal("")),
  durationMin: z.number().int(),
  intervalMin: z.number().int(),
  bufferBeforeMin: z.number().int(),
  bufferAfterMin: z.number().int(),
  minNoticeMin: z.number().int(),
  bookingHorizonDays: z.number().int(),
});

export type OfferingInput = z.infer<typeof OfferingInputSchema>;

/** CAL-03: duration, interval and buffers are validated independently against admin bounds. */
export function assertWithinBounds(input: OfferingInput, d: OfferingDefaults): void {
  const check = (label: string, value: number, [lo, hi]: [number, number]) => {
    if (value < lo || value > hi) throw new ApiError("INVALID_INPUT", `${label} must be between ${lo} and ${hi}`);
  };
  check("Duration (minutes)", input.durationMin, d.bounds.durationMin);
  check("Start interval (minutes)", input.intervalMin, d.bounds.intervalMin);
  check("Buffer before (minutes)", input.bufferBeforeMin, d.bounds.bufferMin);
  check("Buffer after (minutes)", input.bufferAfterMin, d.bounds.bufferMin);
  check("Minimum notice (minutes)", input.minNoticeMin, d.bounds.minNoticeMin);
  check("Booking horizon (days)", input.bookingHorizonDays, d.bounds.horizonDays);
}

export async function createOffering(practitionerId: string, actorUserId: string, associationId: string, input: OfferingInput): Promise<string> {
  const defaults = await offeringDefaults();
  assertWithinBounds(input, defaults);
  return withTransaction(async (_c, tx) => {
    const pb = await tx.execute<{ id: string; branch_id: string }>(sql`SELECT id, branch_id FROM practitioner_branches WHERE id = ${associationId} AND practitioner_id = ${practitionerId} AND state IN ('pending', 'approved')`);
    const a = pb.rows[0];
    if (!a) throw new ApiError("NOT_FOUND", "Clinic association not found");
    const dup = await tx.execute<{ id: string }>(sql`SELECT id FROM offerings WHERE practitioner_branch_id = ${a.id} AND service_id = ${input.serviceId} AND mode = 'clinic'`);
    if (dup.rows[0]) throw new ApiError("CONFLICT", "This service already exists at this clinic; edit it instead");
    const off = await tx.execute<{ id: string }>(sql`
      INSERT INTO offerings (practitioner_branch_id, practitioner_id, branch_id, service_id, mode, display_name, description, active)
      VALUES (${a.id}, ${practitionerId}, ${a.branch_id}, ${input.serviceId}, 'clinic', ${input.displayName}, ${input.description || null}, true) RETURNING id`);
    const offeringId = off.rows[0].id;
    const versionId = await insertVersion(tx, offeringId, 1, input, actorUserId, defaults);
    await tx.execute(sql`UPDATE offerings SET current_version_id = ${versionId} WHERE id = ${offeringId}`);
    await audit({ actorUserId, action: "offering.create", objectType: "offering", objectId: offeringId, changedFields: { versionId, basePricePaise: input.basePricePaise } }, tx);
    return offeringId;
  });
}

/** New immutable version; the previous version remains for bookings that accepted it (CAL-02). */
export async function reviseOffering(practitionerId: string, actorUserId: string, offeringId: string, input: OfferingInput): Promise<string> {
  const defaults = await offeringDefaults();
  assertWithinBounds(input, defaults);
  return withTransaction(async (_c, tx) => {
    const cur = await tx.execute<{ id: string; max_version: number | string | null }>(sql`
      SELECT o.id, (SELECT max(version) FROM offering_versions v WHERE v.offering_id = o.id) AS max_version
      FROM offerings o WHERE o.id = ${offeringId} AND o.practitioner_id = ${practitionerId} FOR UPDATE`);
    const o = cur.rows[0];
    if (!o) throw new ApiError("NOT_FOUND", "Offering not found");
    const version = Number(o.max_version ?? 0) + 1;
    const versionId = await insertVersion(tx, offeringId, version, input, actorUserId, defaults);
    await tx.execute(sql`UPDATE offerings SET current_version_id = ${versionId}, display_name = ${input.displayName}, description = ${input.description || null} WHERE id = ${offeringId}`);
    await audit({ actorUserId, action: "offering.revise", objectType: "offering", objectId: offeringId, changedFields: { version, basePricePaise: input.basePricePaise } }, tx);
    return versionId;
  });
}

async function insertVersion(tx: ReturnType<typeof db>, offeringId: string, version: number, i: OfferingInput, actorUserId: string, d: OfferingDefaults): Promise<string> {
  const policy = await tx.execute<{ id: string }>(sql`SELECT id FROM policies WHERE type = 'cancellation' AND key = 'default' AND superseded_at IS NULL ORDER BY effective_at DESC LIMIT 1`);
  const res = await tx.execute<{ id: string }>(sql`
    INSERT INTO offering_versions (offering_id, version, duration_min, interval_min, buffer_before_min, buffer_after_min, base_price_paise, tax_paise, extra_charges_paise, price_note,
      booking_horizon_days, min_notice_min, booking_mode, cancellation_policy_id, created_by_user_id)
    VALUES (${offeringId}, ${version}, ${i.durationMin ?? d.durationMin}, ${i.intervalMin ?? d.intervalMin}, ${i.bufferBeforeMin ?? d.bufferBeforeMin}, ${i.bufferAfterMin ?? d.bufferAfterMin},
      ${i.basePricePaise}, ${i.taxPaise}, ${i.extraChargesPaise}, ${i.priceNote || null}, ${i.bookingHorizonDays ?? d.horizonDays}, ${i.minNoticeMin ?? d.minNoticeMin}, 'instant', ${policy.rows[0]?.id ?? null}, ${actorUserId})
    RETURNING id`);
  return res.rows[0].id;
}

export async function setOfferingActive(practitionerId: string, actorUserId: string, offeringId: string, active: boolean): Promise<void> {
  const res = await db().execute(sql`UPDATE offerings SET active = ${active} WHERE id = ${offeringId} AND practitioner_id = ${practitionerId}`);
  if (res.rowCount === 0) throw new ApiError("NOT_FOUND", "Offering not found");
  await audit({ actorUserId, action: active ? "offering.activate" : "offering.deactivate", objectType: "offering", objectId: offeringId });
}
