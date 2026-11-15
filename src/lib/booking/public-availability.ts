import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { computeSlots, loadOfferingContext, unbookableReason } from "./slots";
import { addDays, todayLocal } from "./time";

/**
 * Public calendar on a profile (CAL-10, CAL-11): open times for the next week,
 * built by the same slot rules as the booking flow, so leave, blocks and
 * existing appointments are already removed and no reason is ever exposed.
 * Display only. A time shown here authorises nothing: an instant-booking
 * service still goes through the hold transaction, and every other service
 * turns the chosen time into a request the physiotherapist confirms.
 */

export const AVAILABILITY_DAYS = 7;

export type AvailabilityPlace = {
  offeringId: string;
  offeringName: string;
  placeLabel: string;
  durationMin: number;
  /** True when the time can be booked online straight away; false means "request this time". */
  instant: boolean;
  days: { date: string; times: { startsAt: string; localTime: string }[] }[];
};

/** One calendar per place the practitioner works (first published service there). Empty when no weekly hours are set. */
export async function getPublicAvailability(practitionerId: string): Promise<AvailabilityPlace[]> {
  const rows = await db().execute<{ offering_id: string; has_rules: boolean }>(sql`
    SELECT DISTINCT ON (pb.id) o.id AS offering_id,
      EXISTS (SELECT 1 FROM availability_rules r JOIN calendar_resources cr ON cr.id = r.resource_id
              WHERE cr.practitioner_id = pb.practitioner_id AND r.branch_id = pb.branch_id) AS has_rules
    FROM practitioner_branches pb
    JOIN branches b ON b.id = pb.branch_id AND b.status = 'published'
    JOIN clinics c ON c.id = b.clinic_id AND c.status = 'published'
    JOIN offerings o ON o.practitioner_branch_id = pb.id AND o.active
    JOIN services sv ON sv.id = o.service_id
    WHERE pb.practitioner_id = ${practitionerId} AND pb.state = 'approved' AND pb.active_to IS NULL
    ORDER BY pb.id, sv.sort_order, o.created_at
    LIMIT 3`);
  const showTestAccounts = process.env.SHOW_TEST_ACCOUNTS === "1";
  const from = todayLocal();
  const to = addDays(from, AVAILABILITY_DAYS - 1);
  const places: AvailabilityPlace[] = [];
  for (const row of rows.rows) {
    if (!row.has_rules) continue;
    const ctx = await loadOfferingContext(db(), row.offering_id);
    if (!ctx || !ctx.offeringActive || ctx.listingStatus !== "published" || ctx.suspended) continue;
    const slots = await computeSlots(db(), ctx, from, to);
    const byDate = new Map<string, { startsAt: string; localTime: string }[]>();
    for (const s of slots) byDate.set(s.localDate, [...(byDate.get(s.localDate) ?? []), { startsAt: s.startsAt, localTime: s.localTime }]);
    places.push({
      offeringId: ctx.offeringId,
      offeringName: ctx.offeringName,
      placeLabel: ctx.mode === "clinic" ? ctx.clinicName : ctx.mode === "online" ? "Online sessions" : "Home visits",
      durationMin: ctx.terms.durationMin,
      instant: unbookableReason(ctx, { showTestAccounts }) === null,
      days: Array.from({ length: AVAILABILITY_DAYS }, (_, i) => addDays(from, i)).map((date) => ({ date, times: byDate.get(date) ?? [] })),
    });
  }
  return places;
}
