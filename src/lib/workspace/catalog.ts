import { sql } from "drizzle-orm";
import { db } from "@/db/client";

/** Controlled vocabularies and geography lists for workspace forms (PRO-08, DIR-07). */

export type Option = { id: string; label: string; hint?: string | null };

export async function listSpecialtyOptions(): Promise<Option[]> {
  const res = await db().execute<{ id: string; label: string; description: string | null }>(sql`SELECT id, label, description FROM specialties WHERE active ORDER BY sort_order, label`);
  return res.rows.map((r) => ({ id: r.id, label: r.label, hint: r.description }));
}

export async function listLanguageOptions(): Promise<Option[]> {
  const res = await db().execute<{ id: string; label: string; native_label: string | null }>(sql`SELECT id, label, native_label FROM languages WHERE active ORDER BY sort_order, label`);
  return res.rows.map((r) => ({ id: r.id, label: r.label, hint: r.native_label }));
}

export async function listServiceOptions(): Promise<(Option & { kind: string })[]> {
  const res = await db().execute<{ id: string; label: string; description: string | null; kind: string }>(sql`SELECT id, label, description, kind::text AS kind FROM services WHERE active ORDER BY sort_order, label`);
  return res.rows.map((r) => ({ id: r.id, label: r.label, hint: r.description, kind: r.kind }));
}

export type AuthorityOption = Option & { kind: string; jurisdiction: string | null };

export async function listAuthorityOptions(): Promise<AuthorityOption[]> {
  const res = await db().execute<{ id: string; name: string; short_name: string | null; kind: string; jurisdiction: string | null }>(sql`
    SELECT a.id, a.name, a.short_name, a.kind::text AS kind, s.name AS jurisdiction
    FROM credential_authorities a LEFT JOIN states s ON s.id = a.jurisdiction_state_id
    WHERE a.active ORDER BY a.kind, s.name NULLS FIRST, a.name`);
  return res.rows.map((r) => ({ id: r.id, label: r.short_name ? `${r.name} (${r.short_name})` : r.name, kind: r.kind, jurisdiction: r.jurisdiction }));
}

/** Default credential type for an authority kind (VER-01: none substitutes for another). */
export function credentialTypeForAuthority(kind: string): "statutory_registration" | "enrolment" | "degree" | "association_membership" | "certification" {
  switch (kind) {
    case "statutory_regulator":
      return "statutory_registration";
    case "enrolment_body":
      return "enrolment";
    case "degree_awarding":
      return "degree";
    case "professional_association":
      return "association_membership";
    default:
      return "certification";
  }
}

export async function listStateOptions(): Promise<Option[]> {
  const res = await db().execute<{ id: string; name: string }>(sql`SELECT id, name FROM states WHERE status = 'active' ORDER BY sort_order, name`);
  return res.rows.map((r) => ({ id: r.id, label: r.name }));
}

export async function listCityOptions(stateId: string): Promise<Option[]> {
  const res = await db().execute<{ id: string; name: string }>(sql`SELECT id, name FROM cities WHERE state_id = ${stateId} AND status = 'active' ORDER BY is_metro DESC, name`);
  return res.rows.map((r) => ({ id: r.id, label: r.name }));
}

export async function listLocalityOptions(cityId: string): Promise<Option[]> {
  const res = await db().execute<{ id: string; name: string }>(sql`SELECT id, name FROM localities WHERE city_id = ${cityId} AND status = 'active' ORDER BY name`);
  return res.rows.map((r) => ({ id: r.id, label: r.name }));
}

export type BranchHit = { branchId: string; branchName: string; clinicId: string; clinicName: string; address: string; localityName: string; cityName: string; stateName: string; pinCode: string };

/** Existing clinic branches by clinic name (and optional city) for "join an existing clinic" (LOC-02). */
export async function searchBranches(q: string, cityName?: string): Promise<BranchHit[]> {
  const term = q.trim();
  if (term.length < 2) return [];
  const res = await db().execute<Record<string, string>>(sql`
    SELECT b.id AS branch_id, b.name AS branch_name, c.id AS clinic_id, c.name AS clinic_name,
      concat_ws(', ', b.address_line1, b.address_line2) AS address, l.name AS locality_name, ci.name AS city_name, st.name AS state_name, b.pin_code
    FROM branches b JOIN clinics c ON c.id = b.clinic_id
    JOIN localities l ON l.id = b.locality_id JOIN cities ci ON ci.id = b.city_id JOIN states st ON st.id = b.state_id
    WHERE c.status <> 'archived' AND b.status <> 'archived'
      AND (lower(c.name) % lower(${term}) OR lower(c.name) LIKE lower(${`%${term}%`}))
      ${cityName ? sql`AND (lower(ci.name) = lower(${cityName}) OR EXISTS (SELECT 1 FROM geo_aliases ga WHERE ga.target_type = 'city' AND ga.target_id = ci.id AND ga.alias_normalised = regexp_replace(lower(${cityName}), '[^a-z0-9]', '', 'g')))` : sql``}
    ORDER BY similarity(lower(c.name), lower(${term})) DESC, c.name, b.name
    LIMIT 15`);
  return res.rows.map((r) => ({
    branchId: r.branch_id,
    branchName: r.branch_name,
    clinicId: r.clinic_id,
    clinicName: r.clinic_name,
    address: r.address,
    localityName: r.locality_name,
    cityName: r.city_name,
    stateName: r.state_name,
    pinCode: r.pin_code,
  }));
}

export type OfferingBounds = { durationMin: [number, number]; intervalMin: [number, number]; bufferMin: [number, number]; minNoticeMin: [number, number]; horizonDays: [number, number] };
export type OfferingDefaults = { durationMin: number; intervalMin: number; bufferBeforeMin: number; bufferAfterMin: number; minNoticeMin: number; horizonDays: number; bounds: OfferingBounds };

/** CAL-03 defaults and admin bounds, read from platform_config at runtime. */
export async function offeringDefaults(): Promise<OfferingDefaults> {
  const res = await db().execute<{ key: string; value: unknown }>(sql`SELECT key, value FROM platform_config WHERE key LIKE 'offering.%'`);
  const m = Object.fromEntries(res.rows.map((r) => [r.key, r.value]));
  const n = (k: string, fallback: number) => (typeof m[k] === "number" ? (m[k] as number) : fallback);
  const bounds = (m["offering.bounds"] as Partial<OfferingBounds> | undefined) ?? {};
  return {
    durationMin: n("offering.default_duration_min", 30),
    intervalMin: n("offering.default_interval_min", 15),
    bufferBeforeMin: n("offering.default_buffer_before_min", 0),
    bufferAfterMin: n("offering.default_buffer_after_min", 10),
    minNoticeMin: n("offering.default_min_notice_min", 120),
    horizonDays: n("offering.default_horizon_days", 60),
    bounds: {
      durationMin: bounds.durationMin ?? [10, 180],
      intervalMin: bounds.intervalMin ?? [5, 60],
      bufferMin: bounds.bufferMin ?? [0, 60],
      minNoticeMin: bounds.minNoticeMin ?? [0, 2880],
      horizonDays: bounds.horizonDays ?? [1, 180],
    },
  };
}

/** Current policy versions needed for consent capture (PRO-03). */
export async function currentPolicyVersions(): Promise<{ providerTerms: string; privacyNotice: string; cancellation: string }> {
  const res = await db().execute<{ type: string; version: string }>(sql`
    SELECT DISTINCT ON (type) type::text AS type, version FROM policies
    WHERE key = 'default' AND type IN ('provider_terms', 'privacy_notice', 'cancellation') AND superseded_at IS NULL
    ORDER BY type, effective_at DESC`);
  const m = Object.fromEntries(res.rows.map((r) => [r.type, r.version]));
  return { providerTerms: m.provider_terms ?? "provider-2026-10", privacyNotice: m.privacy_notice ?? "privacy-2026-10", cancellation: m.cancellation ?? "cancel-2026-10" };
}
