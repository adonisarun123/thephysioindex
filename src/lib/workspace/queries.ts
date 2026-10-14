import { sql } from "drizzle-orm";
import { db } from "@/db/client";

/** Scoped read models for the practitioner workspace (Section 15). Every query is bound to one practitioner id. */

export type OfferingRow = {
  id: string;
  displayName: string;
  description: string | null;
  serviceLabel: string;
  serviceId: string;
  active: boolean;
  version: number | null;
  durationMin: number;
  intervalMin: number;
  bufferBeforeMin: number;
  bufferAfterMin: number;
  basePricePaise: number;
  taxPaise: number;
  extraChargesPaise: number;
  priceNote: string | null;
  bookingHorizonDays: number;
  minNoticeMin: number;
};

export type AssociationRow = {
  id: string;
  branchId: string;
  branchName: string;
  clinicId: string;
  clinicName: string;
  address: string;
  localityName: string;
  cityName: string;
  stateName: string;
  pinCode: string;
  branchPhone: string | null;
  state: string;
  bookable: boolean;
  activeFrom: string;
  activeTo: string | null;
  showBranchPhone: boolean;
  offerings: OfferingRow[];
};

export async function listAssociations(practitionerId: string): Promise<AssociationRow[]> {
  const res = await db().execute<Record<string, unknown>>(sql`
    SELECT pb.id, pb.branch_id, b.name AS branch_name, c.id AS clinic_id, c.name AS clinic_name,
      concat_ws(', ', b.address_line1, b.address_line2) AS address, l.name AS locality_name, ci.name AS city_name, st.name AS state_name, b.pin_code, b.public_phone,
      pb.state::text AS state, pb.bookable, pb.active_from, pb.active_to,
      coalesce((pb.public_contact_rules ->> 'showBranchPhone')::boolean, true) AS show_branch_phone,
      (SELECT coalesce(json_agg(json_build_object(
          'id', o.id, 'displayName', o.display_name, 'description', o.description, 'serviceLabel', sv.label, 'serviceId', sv.id, 'active', o.active,
          'version', ov.version, 'durationMin', ov.duration_min, 'intervalMin', ov.interval_min, 'bufferBeforeMin', ov.buffer_before_min, 'bufferAfterMin', ov.buffer_after_min,
          'basePricePaise', ov.base_price_paise, 'taxPaise', ov.tax_paise, 'extraChargesPaise', ov.extra_charges_paise, 'priceNote', ov.price_note,
          'bookingHorizonDays', ov.booking_horizon_days, 'minNoticeMin', ov.min_notice_min
        ) ORDER BY sv.sort_order, o.display_name), '[]'::json)
        FROM offerings o JOIN services sv ON sv.id = o.service_id LEFT JOIN offering_versions ov ON ov.id = o.current_version_id
        WHERE o.practitioner_branch_id = pb.id) AS offerings
    FROM practitioner_branches pb
    JOIN branches b ON b.id = pb.branch_id JOIN clinics c ON c.id = b.clinic_id
    JOIN localities l ON l.id = b.locality_id JOIN cities ci ON ci.id = b.city_id JOIN states st ON st.id = b.state_id
    WHERE pb.practitioner_id = ${practitionerId}
    ORDER BY (pb.state = 'ended'), pb.created_at`);
  return res.rows.map((r) => ({
    id: r.id as string,
    branchId: r.branch_id as string,
    branchName: r.branch_name as string,
    clinicId: r.clinic_id as string,
    clinicName: r.clinic_name as string,
    address: r.address as string,
    localityName: r.locality_name as string,
    cityName: r.city_name as string,
    stateName: r.state_name as string,
    pinCode: r.pin_code as string,
    branchPhone: (r.public_phone as string | null) ?? null,
    state: r.state as string,
    bookable: Boolean(r.bookable),
    activeFrom: String(r.active_from),
    activeTo: r.active_to ? String(r.active_to) : null,
    showBranchPhone: Boolean(r.show_branch_phone),
    offerings: ((r.offerings as OfferingRow[]) ?? []).map((o) => ({ ...o, basePricePaise: Number(o.basePricePaise), taxPaise: Number(o.taxPaise), extraChargesPaise: Number(o.extraChargesPaise) })),
  }));
}

export type CredentialRow = { id: string; type: string; authorityName: string; authorityKind: string; numberOriginal: string | null; issueDate: string | null; expiresOn: string | null; status: string; lastCheckedAt: string | null };

export async function listCredentials(practitionerId: string): Promise<CredentialRow[]> {
  const res = await db().execute<Record<string, unknown>>(sql`
    SELECT c.id, c.type::text AS type, a.name AS authority_name, a.kind::text AS authority_kind, c.number_original, c.issue_date, c.expires_on, c.status::text AS status, c.last_checked_at
    FROM credentials c JOIN credential_authorities a ON a.id = c.authority_id
    WHERE c.practitioner_id = ${practitionerId} ORDER BY c.type, c.created_at`);
  return res.rows.map((r) => ({
    id: r.id as string,
    type: r.type as string,
    authorityName: r.authority_name as string,
    authorityKind: r.authority_kind as string,
    numberOriginal: (r.number_original as string | null) ?? null,
    issueDate: r.issue_date ? String(r.issue_date) : null,
    expiresOn: r.expires_on ? String(r.expires_on) : null,
    status: r.status as string,
    lastCheckedAt: r.last_checked_at ? String(r.last_checked_at) : null,
  }));
}

export type RuleRow = { id: string; branchId: string; branchName: string; offeringId: string | null; weekday: number; localStart: string; localEnd: string; effectiveFrom: string; effectiveTo: string | null };
export type ExceptionRow = { id: string; branchId: string | null; branchName: string | null; kind: string; startsAt: string; endsAt: string; localDate: string | null; replacementWindows: { branchId: string; start: string; end: string }[] | null; internalReason: string | null };

export async function getCalendar(practitionerId: string): Promise<{ resourceId: string; scheduleVersion: number; rules: RuleRow[]; exceptions: ExceptionRow[] } | null> {
  const cr = await db().execute<{ id: string; schedule_version: string | number }>(sql`SELECT id, schedule_version FROM calendar_resources WHERE practitioner_id = ${practitionerId}`);
  const resource = cr.rows[0];
  if (!resource) return null;
  const [rules, exceptions] = await Promise.all([
    db().execute<Record<string, unknown>>(sql`
      SELECT r.id, r.branch_id, b.name AS branch_name, r.offering_id, r.weekday, r.local_start::text AS local_start, r.local_end::text AS local_end, r.effective_from, r.effective_to
      FROM availability_rules r JOIN branches b ON b.id = r.branch_id
      WHERE r.resource_id = ${resource.id} AND (r.effective_to IS NULL OR r.effective_to >= current_date)
      ORDER BY r.weekday, r.local_start`),
    db().execute<Record<string, unknown>>(sql`
      SELECT e.id, e.branch_id, b.name AS branch_name, e.kind::text AS kind, e.starts_at, e.ends_at, e.local_date, e.replacement_windows, e.internal_reason
      FROM schedule_exceptions e LEFT JOIN branches b ON b.id = e.branch_id
      WHERE e.resource_id = ${resource.id} AND e.ends_at >= now() - interval '1 day'
      ORDER BY e.starts_at LIMIT 100`),
  ]);
  return {
    resourceId: resource.id,
    scheduleVersion: Number(resource.schedule_version),
    rules: rules.rows.map((r) => ({
      id: r.id as string,
      branchId: r.branch_id as string,
      branchName: r.branch_name as string,
      offeringId: (r.offering_id as string | null) ?? null,
      weekday: Number(r.weekday),
      localStart: String(r.local_start).slice(0, 5),
      localEnd: String(r.local_end).slice(0, 5),
      effectiveFrom: String(r.effective_from),
      effectiveTo: r.effective_to ? String(r.effective_to) : null,
    })),
    exceptions: exceptions.rows.map((r) => ({
      id: r.id as string,
      branchId: (r.branch_id as string | null) ?? null,
      branchName: (r.branch_name as string | null) ?? null,
      kind: r.kind as string,
      startsAt: new Date(r.starts_at as string).toISOString(),
      endsAt: new Date(r.ends_at as string).toISOString(),
      localDate: r.local_date ? String(r.local_date) : null,
      replacementWindows: (r.replacement_windows as ExceptionRow["replacementWindows"]) ?? null,
      internalReason: (r.internal_reason as string | null) ?? null,
    })),
  };
}

export type BookingRow = { id: string; reference: string; status: string; source: string; startsAt: string; endsAt: string; branchName: string; offeringName: string; patientName: string; paymentReported: string };

export async function listBookings(practitionerId: string, f: { status?: string; from?: string; to?: string; limit?: number }): Promise<BookingRow[]> {
  const res = await db().execute<Record<string, unknown>>(sql`
    SELECT bk.id, bk.reference, bk.status::text AS status, bk.source::text AS source, bk.starts_at, bk.ends_at, b.name AS branch_name, o.display_name AS offering_name, pt.display_name AS patient_name, bk.payment_reported::text AS payment_reported
    FROM bookings bk JOIN branches b ON b.id = bk.branch_id JOIN offerings o ON o.id = bk.offering_id JOIN patients pt ON pt.id = bk.patient_id
    WHERE bk.practitioner_id = ${practitionerId}
      ${f.status ? sql`AND bk.status = ${f.status}::booking_status` : sql``}
      ${f.from ? sql`AND bk.starts_at >= (${f.from}::date::timestamp AT TIME ZONE 'Asia/Kolkata')` : sql``}
      ${f.to ? sql`AND bk.starts_at < ((${f.to}::date + 1)::timestamp AT TIME ZONE 'Asia/Kolkata')` : sql``}
    ORDER BY bk.starts_at DESC LIMIT ${Math.min(200, f.limit ?? 50)}`);
  return res.rows.map((r) => ({
    id: r.id as string,
    reference: r.reference as string,
    status: r.status as string,
    source: r.source as string,
    startsAt: new Date(r.starts_at as string).toISOString(),
    endsAt: new Date(r.ends_at as string).toISOString(),
    branchName: r.branch_name as string,
    offeringName: r.offering_name as string,
    patientName: r.patient_name as string,
    paymentReported: r.payment_reported as string,
  }));
}

export async function getBooking(practitionerId: string, id: string): Promise<(BookingRow & { timezone: string; appointmentReason: string | null; patientMobile: string | null; notes: { note: string; createdAt: string }[] }) | null> {
  const res = await db().execute<Record<string, unknown>>(sql`
    SELECT bk.id, bk.reference, bk.status::text AS status, bk.source::text AS source, bk.starts_at, bk.ends_at, bk.timezone, bk.appointment_reason, b.name AS branch_name, o.display_name AS offering_name,
      pt.display_name AS patient_name, pt.mobile AS patient_mobile, bk.payment_reported::text AS payment_reported,
      (SELECT coalesce(json_agg(json_build_object('note', n.note, 'createdAt', n.created_at) ORDER BY n.created_at), '[]'::json) FROM booking_notes n WHERE n.booking_id = bk.id) AS notes
    FROM bookings bk JOIN branches b ON b.id = bk.branch_id JOIN offerings o ON o.id = bk.offering_id JOIN patients pt ON pt.id = bk.patient_id
    WHERE bk.practitioner_id = ${practitionerId} AND bk.id = ${id}`);
  const r = res.rows[0];
  if (!r) return null;
  return {
    id: r.id as string,
    reference: r.reference as string,
    status: r.status as string,
    source: r.source as string,
    startsAt: new Date(r.starts_at as string).toISOString(),
    endsAt: new Date(r.ends_at as string).toISOString(),
    timezone: r.timezone as string,
    appointmentReason: (r.appointment_reason as string | null) ?? null,
    branchName: r.branch_name as string,
    offeringName: r.offering_name as string,
    patientName: r.patient_name as string,
    patientMobile: (r.patient_mobile as string | null) ?? null,
    paymentReported: r.payment_reported as string,
    notes: (r.notes as { note: string; createdAt: string }[]) ?? [],
  };
}

export async function bookingCountsByStatus(practitionerId: string): Promise<Record<string, number>> {
  const res = await db().execute<{ status: string; n: string | number }>(sql`SELECT status::text AS status, count(*) AS n FROM bookings WHERE practitioner_id = ${practitionerId} GROUP BY status`);
  return Object.fromEntries(res.rows.map((r) => [r.status, Number(r.n)]));
}

export type OfferRow = { id: string; title: string; code: string | null; state: string; version: number | null; type: string | null; value: number | null; startsAt: string | null; endsAt: string | null; terms: string | null; moderationState: string | null; moderationReason: string | null; redemptions: number };

export async function listOffers(practitionerId: string): Promise<OfferRow[]> {
  const res = await db().execute<Record<string, unknown>>(sql`
    SELECT of.id, of.title, of.code, of.state::text AS state, ov.version, ov.type::text AS type, ov.value, ov.starts_at, ov.ends_at, ov.terms, ov.moderation_state::text AS moderation_state, ov.moderation_reason,
      (SELECT count(*) FROM offer_redemptions rd WHERE rd.offer_id = of.id AND rd.state = 'consumed') AS redemptions
    FROM offers of LEFT JOIN offer_versions ov ON ov.id = of.current_version_id
    WHERE of.scope_type = 'practitioner' AND of.practitioner_id = ${practitionerId}
    ORDER BY of.created_at DESC`);
  return res.rows.map((r) => ({
    id: r.id as string,
    title: r.title as string,
    code: (r.code as string | null) ?? null,
    state: r.state as string,
    version: r.version == null ? null : Number(r.version),
    type: (r.type as string | null) ?? null,
    value: r.value == null ? null : Number(r.value),
    startsAt: r.starts_at ? new Date(r.starts_at as string).toISOString() : null,
    endsAt: r.ends_at ? new Date(r.ends_at as string).toISOString() : null,
    terms: (r.terms as string | null) ?? null,
    moderationState: (r.moderation_state as string | null) ?? null,
    moderationReason: (r.moderation_reason as string | null) ?? null,
    redemptions: Number(r.redemptions ?? 0),
  }));
}

export type TeamMember = { assignmentId: string; userId: string; name: string | null; mobile: string | null; email: string | null; role: string; permissions: string[]; grantedAt: string };
export type Invitation = { id: string; mobile: string | null; email: string | null; role: string; permissions: string[]; state: string; expiresAt: string; createdAt: string };

export async function listTeam(practitionerId: string): Promise<{ members: TeamMember[]; invitations: Invitation[] }> {
  const [m, i] = await Promise.all([
    db().execute<Record<string, unknown>>(sql`
      SELECT ra.id, ra.user_id, u.display_name, u.mobile, u.email, ra.role::text AS role, ra.permissions, ra.created_at
      FROM role_assignments ra JOIN users u ON u.id = ra.user_id
      WHERE ra.scope_type = 'practitioner' AND ra.scope_id = ${practitionerId} AND ra.revoked_at IS NULL ORDER BY ra.created_at`),
    db().execute<Record<string, unknown>>(sql`
      SELECT id, invitee_mobile, invitee_email, role::text AS role, permissions, state::text AS state, expires_at, created_at
      FROM staff_invitations WHERE scope_type = 'practitioner' AND scope_id = ${practitionerId} ORDER BY created_at DESC LIMIT 50`),
  ]);
  return {
    members: m.rows.map((r) => ({
      assignmentId: r.id as string,
      userId: r.user_id as string,
      name: (r.display_name as string | null) ?? null,
      mobile: (r.mobile as string | null) ?? null,
      email: (r.email as string | null) ?? null,
      role: r.role as string,
      permissions: (r.permissions as string[]) ?? [],
      grantedAt: String(r.created_at),
    })),
    invitations: i.rows.map((r) => ({
      id: r.id as string,
      mobile: (r.invitee_mobile as string | null) ?? null,
      email: (r.invitee_email as string | null) ?? null,
      role: r.role as string,
      permissions: (r.permissions as string[]) ?? [],
      state: r.state as string,
      expiresAt: String(r.expires_at),
      createdAt: String(r.created_at),
    })),
  };
}

export type ConsentState = { profilePublication: string | null; providerTerms: string | null };

/** Latest granted (not later withdrawn) consent versions for the practitioner subject (PRO-03). */
export async function consentState(practitionerId: string): Promise<ConsentState> {
  const res = await db().execute<{ purpose: string; action: string; notice_version: string }>(sql`
    SELECT DISTINCT ON (purpose) purpose::text AS purpose, action::text AS action, notice_version
    FROM consent_records WHERE subject_type = 'practitioner' AND subject_id = ${practitionerId} AND purpose IN ('profile_publication', 'provider_terms')
    ORDER BY purpose, captured_at DESC`);
  const pick = (p: string) => {
    const r = res.rows.find((x) => x.purpose === p);
    return r && r.action === "granted" ? r.notice_version : null;
  };
  return { profilePublication: pick("profile_publication"), providerTerms: pick("provider_terms") };
}

export async function notificationPrefs(userId: string) {
  const res = await db().execute<{ transactional_sms: boolean; transactional_email: boolean; whatsapp_opt_in: boolean; marketing_opt_in: boolean; preferred_language: string }>(sql`
    SELECT transactional_sms, transactional_email, whatsapp_opt_in, marketing_opt_in, preferred_language FROM notification_preferences WHERE user_id = ${userId}`);
  const r = res.rows[0];
  return { transactionalSms: r?.transactional_sms ?? true, transactionalEmail: r?.transactional_email ?? true, whatsappOptIn: r?.whatsapp_opt_in ?? false, marketingOptIn: r?.marketing_opt_in ?? false, preferredLanguage: r?.preferred_language ?? "en" };
}

export async function openClosureRequest(practitionerId: string): Promise<boolean> {
  const res = await db().execute<{ n: string | number }>(sql`SELECT count(*) AS n FROM privacy_requests WHERE request_type = 'erasure' AND subject_type = 'practitioner' AND subject_id = ${practitionerId} AND state NOT IN ('completed', 'rejected')`);
  return Number(res.rows[0]?.n ?? 0) > 0;
}
