import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import type { LineItem } from "@/db/schema/scheduling";
import { hashToken } from "./engine";
import { loadOfferingContext, unbookableReason, UNBOOKABLE_MESSAGES, type OfferingContext } from "./slots";

/** Read models for the patient booking flow and dashboard (BKG-13). Scoped to the viewer's authority. */

const SHOW_TEST = () => process.env.SHOW_TEST_ACCOUNTS === "1";

export type BookableOffering = {
  ctx: OfferingContext;
  serviceLabel: string;
  serviceKind: string;
  bookable: boolean;
  reason: string | null;
};

export async function listOfferingsForBooking(practitionerPublicId: string): Promise<{ practitioner: { id: string; name: string; slug: string; publicId: string } | null; offerings: BookableOffering[] }> {
  const p = await db().execute<{ id: string; display_name: string; slug: string; public_id: string; is_test_account: boolean; listing_status: string }>(sql`
    SELECT id, display_name, slug, public_id, is_test_account, listing_status::text AS listing_status FROM practitioners WHERE public_id = ${practitionerPublicId}`);
  const pr = p.rows[0];
  if (!pr || (pr.is_test_account && !SHOW_TEST()) || pr.listing_status !== "published") return { practitioner: null, offerings: [] };
  const ids = await db().execute<{ id: string; label: string; kind: string }>(sql`
    SELECT o.id, s.label, s.kind::text AS kind FROM offerings o JOIN services s ON s.id = o.service_id
    JOIN practitioner_branches pb ON pb.id = o.practitioner_branch_id
    WHERE o.practitioner_id = ${pr.id} AND o.active AND o.current_version_id IS NOT NULL AND pb.state = 'approved' AND pb.active_to IS NULL
    ORDER BY s.sort_order, o.display_name`);
  const offerings: BookableOffering[] = [];
  for (const row of ids.rows) {
    const ctx = await loadOfferingContext(db(), row.id);
    if (!ctx) continue;
    const reason = unbookableReason(ctx, { showTestAccounts: SHOW_TEST() });
    if (reason === "hidden" || reason === "location_unavailable") continue;
    offerings.push({ ctx, serviceLabel: row.label, serviceKind: row.kind, bookable: reason === null, reason: reason ? UNBOOKABLE_MESSAGES[reason] : null });
  }
  return { practitioner: { id: pr.id, name: pr.display_name, slug: pr.slug, publicId: pr.public_id }, offerings };
}

export type HoldView = {
  reservationId: string;
  offeringId: string;
  offeringName: string;
  practitionerName: string;
  practitionerPath: string;
  clinicName: string;
  branchName: string;
  address: string;
  patientName: string;
  startsAt: string;
  endsAt: string;
  expiresAt: string;
  expired: boolean;
  totalPaise: number;
  lineItems: LineItem[];
  offerExplanation: string | null;
  policyVersion: string;
  policyText: string | null;
};

/** The viewer's own active hold, read by token hash (never by reservation ID alone). */
export async function getHoldForViewer(holdToken: string, userId: string): Promise<HoldView | null> {
  const res = await db().execute<Record<string, unknown>>(sql`
    SELECT r.id, r.offering_id, o.display_name AS offering_name, p.display_name AS practitioner_name, p.slug, p.public_id,
      c.name AS clinic_name, b.name AS branch_name, concat_ws(', ', b.address_line1, b.address_line2, l.name, ci.name, b.pin_code) AS address,
      pt.display_name AS patient_name, r.starts_at::text AS starts_at, r.ends_at::text AS ends_at, r.expires_at::text AS expires_at,
      (r.state <> 'held' OR r.expires_at <= now()) AS expired,
      s.total_paise, s.line_items, s.offer_explanation, s.policy_version,
      (SELECT body_markdown FROM policies WHERE type = 'cancellation' AND version = s.policy_version LIMIT 1) AS policy_text
    FROM reservations r
    JOIN offerings o ON o.id = r.offering_id JOIN practitioners p ON p.id = r.practitioner_id
    JOIN branches b ON b.id = r.branch_id JOIN clinics c ON c.id = b.clinic_id JOIN localities l ON l.id = b.locality_id JOIN cities ci ON ci.id = b.city_id
    JOIN patients pt ON pt.id = r.patient_id
    JOIN LATERAL (SELECT * FROM booking_price_snapshots WHERE reservation_id = r.id AND booking_id IS NULL ORDER BY created_at DESC LIMIT 1) s ON true
    WHERE r.hold_token_hash = ${hashToken(holdToken)} AND r.held_by_user_id = ${userId}`);
  const r = res.rows[0];
  if (!r) return null;
  return {
    reservationId: r.id as string,
    offeringId: r.offering_id as string,
    offeringName: r.offering_name as string,
    practitionerName: r.practitioner_name as string,
    practitionerPath: `/physiotherapist/${r.slug}-${r.public_id}`,
    clinicName: r.clinic_name as string,
    branchName: r.branch_name as string,
    address: r.address as string,
    patientName: r.patient_name as string,
    startsAt: new Date(r.starts_at as string).toISOString(),
    endsAt: new Date(r.ends_at as string).toISOString(),
    expiresAt: new Date(r.expires_at as string).toISOString(),
    expired: Boolean(r.expired),
    totalPaise: Number(r.total_paise),
    lineItems: r.line_items as LineItem[],
    offerExplanation: (r.offer_explanation as string | null) ?? null,
    policyVersion: r.policy_version as string,
    policyText: (r.policy_text as string | null) ?? null,
  };
}

export type PatientBooking = {
  id: string;
  reference: string;
  status: string;
  version: number;
  startsAt: string;
  endsAt: string;
  patientName: string;
  practitionerName: string;
  practitionerPath: string;
  offeringId: string;
  offeringName: string;
  clinicName: string;
  branchName: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  publicPhone: string | null;
  totalPaise: number;
  discountPaise: number;
  lineItems: LineItem[];
  offerExplanation: string | null;
  policyVersion: string;
  policyText: string | null;
  cutoffHours: number;
  cancellationRequested: boolean;
  cancellationReason: string | null;
};

const PATIENT_SCOPE = (userId: string) => sql`(
  pt.account_user_id = ${userId}
  OR EXISTS (SELECT 1 FROM guardian_links g WHERE g.patient_id = pt.id AND g.guardian_user_id = ${userId} AND g.revoked_at IS NULL AND g.verification_state <> 'revoked')
)`;

const BOOKING_SELECT = sql`
  SELECT bk.id, bk.reference, bk.status::text AS status, bk.version, bk.starts_at::text AS starts_at, bk.ends_at::text AS ends_at, pt.display_name AS patient_name,
    p.display_name AS practitioner_name, p.slug, p.public_id, bk.offering_id, o.display_name AS offering_name, c.name AS clinic_name, b.name AS branch_name,
    concat_ws(', ', b.address_line1, b.address_line2, l.name, ci.name, b.pin_code) AS address, b.latitude, b.longitude, b.public_phone,
    s.total_paise, s.discount_paise, s.line_items, s.offer_explanation, bk.policy_version, bk.cancellation_reason,
    (SELECT body_markdown FROM policies WHERE type = 'cancellation' AND version = bk.policy_version LIMIT 1) AS policy_text,
    coalesce((SELECT (content ->> 'selfServiceCutoffHours')::int FROM policies WHERE type = 'cancellation' AND version = bk.policy_version LIMIT 1),
             (SELECT (value #>> '{}')::int FROM platform_config WHERE key = 'booking.self_service_cutoff_hours'), 12) AS cutoff_hours,
    EXISTS (SELECT 1 FROM resolution_tasks t WHERE t.booking_id = bk.id AND t.kind = 'cancellation_request_after_cutoff' AND t.state IN ('open', 'in_progress')) AS cancellation_requested
  FROM bookings bk
  JOIN patients pt ON pt.id = bk.patient_id JOIN practitioners p ON p.id = bk.practitioner_id JOIN offerings o ON o.id = bk.offering_id
  JOIN branches b ON b.id = bk.branch_id JOIN clinics c ON c.id = b.clinic_id JOIN localities l ON l.id = b.locality_id JOIN cities ci ON ci.id = b.city_id
  LEFT JOIN booking_price_snapshots s ON s.id = bk.price_snapshot_id`;

function toPatientBooking(r: Record<string, unknown>): PatientBooking {
  return {
    id: r.id as string,
    reference: r.reference as string,
    status: r.status as string,
    version: Number(r.version),
    startsAt: new Date(r.starts_at as string).toISOString(),
    endsAt: new Date(r.ends_at as string).toISOString(),
    patientName: r.patient_name as string,
    practitionerName: r.practitioner_name as string,
    practitionerPath: `/physiotherapist/${r.slug}-${r.public_id}`,
    offeringId: r.offering_id as string,
    offeringName: r.offering_name as string,
    clinicName: r.clinic_name as string,
    branchName: r.branch_name as string,
    address: r.address as string,
    latitude: r.latitude == null ? null : Number(r.latitude),
    longitude: r.longitude == null ? null : Number(r.longitude),
    publicPhone: (r.public_phone as string | null) ?? null,
    totalPaise: Number(r.total_paise ?? 0),
    discountPaise: Number(r.discount_paise ?? 0),
    lineItems: (r.line_items as LineItem[]) ?? [],
    offerExplanation: (r.offer_explanation as string | null) ?? null,
    policyVersion: r.policy_version as string,
    policyText: (r.policy_text as string | null) ?? null,
    cutoffHours: Number(r.cutoff_hours ?? 12),
    cancellationRequested: Boolean(r.cancellation_requested),
    cancellationReason: (r.cancellation_reason as string | null) ?? null,
  };
}

export async function listPatientBookings(userId: string, limit = 50): Promise<PatientBooking[]> {
  const res = await db().execute<Record<string, unknown>>(sql`${BOOKING_SELECT} WHERE ${PATIENT_SCOPE(userId)} ORDER BY bk.starts_at DESC LIMIT ${limit}`);
  return res.rows.map(toPatientBooking);
}

export async function getPatientBooking(userId: string, bookingId: string): Promise<PatientBooking | null> {
  const res = await db().execute<Record<string, unknown>>(sql`${BOOKING_SELECT} WHERE bk.id = ${bookingId} AND ${PATIENT_SCOPE(userId)}`);
  return res.rows[0] ? toPatientBooking(res.rows[0]) : null;
}
