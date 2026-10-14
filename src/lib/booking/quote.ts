import { sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import type { LineItem } from "@/db/schema/scheduling";
import { ApiError } from "@/lib/api";
import { formatPaise, percentageDiscountPaise } from "@/lib/money";

/**
 * Price calculation and offer selection (OFR-02..OFR-05).
 * Money is integer paise throughout. Exactly one offer may apply (OFR-04).
 */

export type OfferTerms = {
  offerId: string;
  offerVersionId: string;
  title: string;
  type: "fixed" | "percentage";
  value: number; // paise, or basis points for percentage
  maxDiscountPaise: number | null;
  minSpendPaise: number;
  totalCap: number | null;
  perPatientCap: number;
  firstVisitOnly: boolean;
  automatic: boolean;
  code: string | null;
  endsAt: string;
};

export type Quote = {
  offeringVersionId: string;
  basePaise: number;
  discountPaise: number;
  taxPaise: number;
  extraPaise: number;
  totalPaise: number;
  lineItems: LineItem[];
  offer: { offerId: string; offerVersionId: string; explanation: string } | null;
  policyVersion: string;
};

export function discountFor(basePaise: number, o: Pick<OfferTerms, "type" | "value" | "maxDiscountPaise" | "minSpendPaise">): number {
  if (basePaise < o.minSpendPaise) return 0;
  let d = o.type === "fixed" ? o.value : percentageDiscountPaise(basePaise, o.value);
  if (o.maxDiscountPaise !== null) d = Math.min(d, o.maxDiscountPaise);
  return Math.max(0, Math.min(d, basePaise)); // final service price never negative (OFR-03)
}

export function explainOffer(o: Pick<OfferTerms, "title" | "type" | "value" | "maxDiscountPaise" | "minSpendPaise" | "firstVisitOnly">): string {
  const pct = o.value / 100;
  const amount = o.type === "fixed" ? `${formatPaise(o.value, { showPaise: true })} off` : `${Number.isInteger(pct) ? pct : pct.toFixed(2)}% off`;
  const parts = [`${o.title}: ${amount} the service fee`];
  if (o.maxDiscountPaise !== null && o.type === "percentage") parts.push(`up to ${formatPaise(o.maxDiscountPaise, { showPaise: true })}`);
  if (o.minSpendPaise > 0) parts.push(`on fees of ${formatPaise(o.minSpendPaise, { showPaise: true })} or more`);
  if (o.firstVisitOnly) parts.push("first visit only");
  return parts.join(", ");
}

/** Line items for one offering version and an optional offer (OFR-01, OFR-02). */
export function priceLines(
  input: { offeringVersionId: string; offeringName: string; basePaise: number; taxPaise: number; extraPaise: number; policyVersion: string },
  offer: OfferTerms | null,
): Quote {
  const discount = offer ? discountFor(input.basePaise, offer) : 0;
  const applied = offer && discount > 0 ? offer : null;
  const lineItems: LineItem[] = [{ kind: "base", label: input.offeringName, amountPaise: input.basePaise }];
  if (applied) lineItems.push({ kind: "discount", label: applied.title, amountPaise: discount });
  if (input.taxPaise > 0) lineItems.push({ kind: "tax", label: "Taxes", amountPaise: input.taxPaise });
  if (input.extraPaise > 0) lineItems.push({ kind: "extra", label: "Additional charges", amountPaise: input.extraPaise });
  return {
    offeringVersionId: input.offeringVersionId,
    basePaise: input.basePaise,
    discountPaise: applied ? discount : 0,
    taxPaise: input.taxPaise,
    extraPaise: input.extraPaise,
    totalPaise: input.basePaise - (applied ? discount : 0) + input.taxPaise + input.extraPaise,
    lineItems,
    offer: applied
      ? { offerId: applied.offerId, offerVersionId: applied.offerVersionId, explanation: explainOffer(applied) }
      : null,
    policyVersion: input.policyVersion,
  };
}

type OfferRow = {
  offer_id: string; offer_version_id: string; title: string; type: "fixed" | "percentage"; value: number; max_discount_paise: string | number | null;
  min_spend_paise: string | number; total_cap: number | null; per_patient_cap: number; first_visit_only: boolean; automatic: boolean; code: string | null;
  ends_at: string; used_total: string | number; used_by_patient: string | number; patient_has_completed: boolean;
};

/**
 * Live, moderated offers for an offering with usage counts. Reserved and
 * consumed redemptions both count toward caps (OFR-04, OFR-05). Pass `lock`
 * inside the hold transaction: offer_versions rows are locked after the
 * calendar and patient locks, so cap checks cannot race (stable lock order).
 */
export async function loadOffers(
  d: Db,
  q: { practitionerId: string; clinicId: string; offeringId: string; patientId: string | null; code?: string | null; lock?: boolean },
): Promise<OfferTerms[]> {
  const rows = await d.execute<OfferRow>(sql`
    SELECT o.id AS offer_id, v.id AS offer_version_id, o.title, v.type::text AS type, v.value, v.max_discount_paise, v.min_spend_paise, v.total_cap,
           v.per_patient_cap, v.first_visit_only, v.automatic, o.code, v.ends_at::text AS ends_at,
           (SELECT count(*) FROM offer_redemptions r WHERE r.offer_version_id = v.id AND r.state IN ('reserved', 'consumed')) AS used_total,
           (SELECT count(*) FROM offer_redemptions r WHERE r.offer_id = o.id AND r.patient_id = ${q.patientId} AND r.state IN ('reserved', 'consumed')) AS used_by_patient,
           EXISTS (SELECT 1 FROM bookings bk WHERE bk.patient_id = ${q.patientId} AND bk.status = 'completed'
                   AND (CASE WHEN o.scope_type = 'clinic' THEN bk.branch_id IN (SELECT id FROM branches WHERE clinic_id = o.clinic_id) ELSE bk.practitioner_id = o.practitioner_id END)) AS patient_has_completed
    FROM offers o JOIN offer_versions v ON v.id = o.current_version_id
    WHERE o.state IN ('approved', 'active') AND v.moderation_state = 'approved'
      AND v.starts_at <= now() AND v.ends_at > now()
      AND ((o.scope_type = 'practitioner' AND o.practitioner_id = ${q.practitionerId}) OR (o.scope_type = 'clinic' AND o.clinic_id = ${q.clinicId}))
      AND (v.eligible_offering_ids IS NULL OR ${q.offeringId}::uuid = ANY(v.eligible_offering_ids))
      ${q.code ? sql`AND upper(o.code) = upper(${q.code})` : sql`AND v.automatic`}
    ORDER BY v.id
    ${q.lock ? sql`FOR UPDATE OF v` : sql``}`);
  return rows.rows
    .filter((r) => {
      if (r.total_cap !== null && Number(r.used_total) >= r.total_cap) return false;
      if (q.patientId && Number(r.used_by_patient) >= r.per_patient_cap) return false;
      // Without a patient (public display) a first-visit offer is shown with its qualifier.
      if (r.first_visit_only && q.patientId && r.patient_has_completed) return false;
      return true;
    })
    .map((r) => ({
      offerId: r.offer_id,
      offerVersionId: r.offer_version_id,
      title: r.title,
      type: r.type,
      value: Number(r.value),
      maxDiscountPaise: r.max_discount_paise === null ? null : Number(r.max_discount_paise),
      minSpendPaise: Number(r.min_spend_paise),
      totalCap: r.total_cap,
      perPatientCap: r.per_patient_cap,
      firstVisitOnly: r.first_visit_only,
      automatic: r.automatic,
      code: r.code,
      endsAt: r.ends_at,
    }));
}

/** Best automatic offer, or the entered code (which must be eligible). Ties: larger discount, then earlier end, then id. */
export function selectOffer(basePaise: number, offers: OfferTerms[], code?: string | null): OfferTerms | null {
  if (code) {
    const match = offers.find((o) => o.code && o.code.toUpperCase() === code.toUpperCase());
    if (!match || discountFor(basePaise, match) === 0) throw new ApiError("OFFER_INELIGIBLE", "This offer code does not apply to this appointment.");
    return match;
  }
  const ranked = offers
    .filter((o) => o.automatic)
    .map((o) => ({ o, d: discountFor(basePaise, o) }))
    .filter((x) => x.d > 0)
    .sort((a, b) => b.d - a.d || a.o.endsAt.localeCompare(b.o.endsAt) || a.o.offerVersionId.localeCompare(b.o.offerVersionId));
  return ranked[0]?.o ?? null;
}
