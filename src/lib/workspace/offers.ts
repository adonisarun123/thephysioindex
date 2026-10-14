import { sql } from "drizzle-orm";
import { z } from "zod";
import { db, withTransaction } from "@/db/client";
import { audit } from "@/lib/audit";
import { ApiError } from "@/lib/api";
import { openCase } from "./cases";
import { uuidArray } from "@/lib/sql";

/** Practitioner offers (OFR-03, OFR-06). Drafts → submitted → moderation; pause/resume for approved or active offers. */

export const OfferInputSchema = z
  .object({
    title: z.string().trim().min(3, "Title is too short").max(120),
    code: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{3,20}$/, "Code: 3–20 letters or digits").optional(),
    type: z.enum(["fixed", "percentage"]),
    /** Fixed: paise. Percentage: basis points (1250 = 12.5 %). */
    value: z.number().int().positive("Value must be positive"),
    startsAt: z.date(),
    endsAt: z.date(),
    eligibleOfferingIds: z.array(z.uuid()).optional(),
    minSpendPaise: z.number().int().min(0).default(0),
    maxDiscountPaise: z.number().int().positive().optional(),
    totalCap: z.number().int().positive().optional(),
    perPatientCap: z.number().int().positive().default(1),
    firstVisitOnly: z.boolean().default(false),
    automatic: z.boolean().default(true),
    terms: z.string().trim().min(20, "Terms must explain the conditions (at least 20 characters)").max(1500),
    regularPriceConfirmed: z.literal(true, { error: "Confirm that the regular price is genuine (OFR-06)" }),
  })
  .refine((o) => o.endsAt > o.startsAt, { message: "End must be after start", path: ["endsAt"] })
  .refine((o) => o.type !== "percentage" || o.value <= 10000, { message: "Percentage cannot exceed 100 %", path: ["value"] })
  .refine((o) => !/guarantee|cure|100% recovery/i.test(o.terms), { message: "Terms must not promise recovery outcomes (OFR-06)", path: ["terms"] });

export type OfferInput = z.infer<typeof OfferInputSchema>;

export async function createOfferDraft(practitionerId: string, actorUserId: string, input: OfferInput): Promise<string> {
  return withTransaction(async (_c, tx) => {
    if (input.eligibleOfferingIds?.length) {
      const own = await tx.execute<{ n: string | number }>(sql`SELECT count(*) AS n FROM offerings WHERE practitioner_id = ${practitionerId} AND id = ANY(${uuidArray(input.eligibleOfferingIds)})`);
      if (Number(own.rows[0]?.n) !== input.eligibleOfferingIds.length) throw new ApiError("INVALID_INPUT", "Eligible services must be your own offerings");
    }
    const offer = await tx.execute<{ id: string }>(sql`
      INSERT INTO offers (scope_type, practitioner_id, code, title, state, created_by_user_id)
      VALUES ('practitioner', ${practitionerId}, ${input.code ?? null}, ${input.title}, 'draft', ${actorUserId}) RETURNING id`);
    const offerId = offer.rows[0].id;
    const v = await tx.execute<{ id: string }>(sql`
      INSERT INTO offer_versions (offer_id, version, type, value, starts_at, ends_at, eligible_offering_ids, min_spend_paise, max_discount_paise, total_cap, per_patient_cap, first_visit_only, automatic, terms, regular_price_confirmed)
      VALUES (${offerId}, 1, ${input.type}::offer_type, ${input.value}, ${input.startsAt.toISOString()}::timestamptz, ${input.endsAt.toISOString()}::timestamptz,
        ${input.eligibleOfferingIds?.length ? uuidArray(input.eligibleOfferingIds) : sql`NULL::uuid[]`}, ${input.minSpendPaise}, ${input.maxDiscountPaise ?? null}, ${input.totalCap ?? null},
        ${input.firstVisitOnly ? 1 : input.perPatientCap}, ${input.firstVisitOnly}, ${input.automatic}, ${input.terms}, true) RETURNING id`);
    await tx.execute(sql`UPDATE offers SET current_version_id = ${v.rows[0].id} WHERE id = ${offerId}`);
    await audit({ actorUserId, action: "offer.create", objectType: "offer", objectId: offerId, changedFields: { type: input.type, value: input.value } }, tx);
    return offerId;
  });
}

/** OFR-06: offers pass moderation before publication. */
export async function submitOffer(practitionerId: string, actorUserId: string, offerId: string): Promise<void> {
  await withTransaction(async (_c, tx) => {
    const o = await tx.execute<{ id: string; current_version_id: string | null; ends_at: string }>(sql`
      SELECT of.id, of.current_version_id, ov.ends_at FROM offers of LEFT JOIN offer_versions ov ON ov.id = of.current_version_id
      WHERE of.id = ${offerId} AND of.practitioner_id = ${practitionerId} AND of.state IN ('draft', 'rejected') FOR UPDATE OF of`);
    const row = o.rows[0];
    if (!row || !row.current_version_id) throw new ApiError("NOT_FOUND", "Draft offer not found");
    if (new Date(row.ends_at) <= new Date()) throw new ApiError("INVALID_INPUT", "This offer has already expired; extend its end date first");
    await tx.execute(sql`UPDATE offers SET state = 'submitted' WHERE id = ${row.id}`);
    await openCase({ caseType: "offer_review", subjectType: "offer_version", subjectId: row.current_version_id, practitionerId, submittedByUserId: actorUserId }, tx);
    await audit({ actorUserId, action: "offer.submit", objectType: "offer", objectId: row.id }, tx);
  });
}

export async function setOfferPaused(practitionerId: string, actorUserId: string, offerId: string, paused: boolean): Promise<void> {
  const from = paused ? sql`('approved', 'active')` : sql`('paused')`;
  const to = paused ? "paused" : "active";
  const res = await db().execute(sql`UPDATE offers SET state = ${to}::offer_state WHERE id = ${offerId} AND practitioner_id = ${practitionerId} AND state IN ${from}`);
  if (res.rowCount === 0) throw new ApiError("CONFLICT", paused ? "Only approved or active offers can be paused" : "Only paused offers can be resumed");
  await audit({ actorUserId, action: paused ? "offer.pause" : "offer.resume", objectType: "offer", objectId: offerId });
}
