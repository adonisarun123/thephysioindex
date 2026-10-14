import { sql } from "drizzle-orm";
import { db } from "@/db/client";

/** Master-data read models (ADM-05): geography, taxonomy, authorities, policies, templates, config, flags, staff. */

export type StateRow = { id: string; code: string; name: string; slug: string; kind: string; status: string; sortOrder: number; cities: number; practitioners: number };
export async function listStatesAdmin(): Promise<StateRow[]> {
  const res = await db().execute<StateRow>(sql`
    SELECT s.id, s.code, s.name, s.slug, s.kind, s.status, s.sort_order AS "sortOrder",
      (SELECT count(*)::int FROM cities c WHERE c.state_id = s.id AND c.status = 'active') AS cities,
      (SELECT count(DISTINCT pb.practitioner_id)::int FROM practitioner_branches pb JOIN branches b ON b.id = pb.branch_id WHERE b.state_id = s.id AND pb.state = 'approved') AS practitioners
    FROM states s ORDER BY s.sort_order, s.name`);
  return res.rows;
}

export type CityRow = { id: string; stateId: string; name: string; slug: string; status: string; isMetro: boolean; tier: number | null; latitude: number | null; longitude: number | null; mergedIntoCityId: string | null; localities: number; branches: number; aliases: string[] | null };
export async function listCitiesAdmin(stateId: string): Promise<CityRow[]> {
  const res = await db().execute<CityRow>(sql`
    SELECT c.id, c.state_id AS "stateId", c.name, c.slug, c.status, c.is_metro AS "isMetro", c.tier, c.latitude, c.longitude, c.merged_into_city_id AS "mergedIntoCityId",
      (SELECT count(*)::int FROM localities l WHERE l.city_id = c.id AND l.status = 'active') AS localities, (SELECT count(*)::int FROM branches b WHERE b.city_id = c.id) AS branches,
      (SELECT array_agg(alias ORDER BY alias) FROM geo_aliases ga WHERE ga.target_type = 'city' AND ga.target_id = c.id) AS aliases
    FROM cities c WHERE c.state_id = ${stateId} ORDER BY c.status = 'active' DESC, c.name`);
  return res.rows;
}

export async function getCityAdmin(cityId: string) {
  const res = await db().execute<CityRow & { stateName: string; stateCode: string }>(sql`SELECT c.id, c.state_id AS "stateId", c.name, c.slug, c.status, c.is_metro AS "isMetro", c.tier, c.latitude, c.longitude, c.merged_into_city_id AS "mergedIntoCityId", s.name AS "stateName", s.code AS "stateCode", 0 AS localities, 0 AS branches, NULL::text[] AS aliases FROM cities c JOIN states s ON s.id = c.state_id WHERE c.id = ${cityId}`);
  return res.rows[0] ?? null;
}

export type LocalityRow = { id: string; cityId: string; name: string; slug: string; status: string; latitude: number | null; longitude: number | null; pinCodes: string[] | null; mergedIntoLocalityId: string | null; branches: number; aliases: { id: string; alias: string; kind: string }[] };
export async function listLocalitiesAdmin(cityId: string): Promise<LocalityRow[]> {
  const res = await db().execute<LocalityRow>(sql`
    SELECT l.id, l.city_id AS "cityId", l.name, l.slug, l.status, l.latitude, l.longitude, l.pin_codes AS "pinCodes", l.merged_into_locality_id AS "mergedIntoLocalityId",
      (SELECT count(*)::int FROM branches b WHERE b.locality_id = l.id) AS branches,
      coalesce((SELECT json_agg(json_build_object('id', ga.id, 'alias', ga.alias, 'kind', ga.kind) ORDER BY ga.alias) FROM geo_aliases ga WHERE ga.target_type = 'locality' AND ga.target_id = l.id), '[]'::json) AS aliases
    FROM localities l WHERE l.city_id = ${cityId} ORDER BY l.status = 'active' DESC, l.name`);
  return res.rows;
}

export async function pendingLocalityProposals(): Promise<number> {
  const res = await db().execute<{ n: string }>(sql`SELECT count(*) AS n FROM locality_proposals WHERE state = 'pending'`);
  return Number(res.rows[0]?.n ?? 0);
}

export type TaxonomyRow = { id: string; code: string; label: string; slug: string | null; description: string | null; active: boolean; sortOrder: number; extra: string | null; usage: number };
export async function listTaxonomy(kind: "specialties" | "services" | "languages"): Promise<TaxonomyRow[]> {
  if (kind === "specialties") {
    const r = await db().execute<TaxonomyRow>(sql`SELECT s.id, s.code, s.label, s.slug, s.description, s.active, s.sort_order AS "sortOrder", CASE WHEN s.requires_evidence THEN 'requires evidence' ELSE NULL END AS extra, (SELECT count(*)::int FROM practitioner_specialties ps WHERE ps.specialty_id = s.id) AS usage FROM specialties s ORDER BY s.sort_order, s.label`);
    return r.rows;
  }
  if (kind === "services") {
    const r = await db().execute<TaxonomyRow>(sql`SELECT s.id, s.code, s.label, s.slug, s.description, s.active, s.sort_order AS "sortOrder", s.kind::text AS extra, (SELECT count(*)::int FROM offerings o WHERE o.service_id = s.id) AS usage FROM services s ORDER BY s.sort_order, s.label`);
    return r.rows;
  }
  const r = await db().execute<TaxonomyRow>(sql`SELECT l.id, l.code, l.label, NULL AS slug, l.native_label AS description, l.active, l.sort_order AS "sortOrder", NULL AS extra, (SELECT count(*)::int FROM practitioner_languages pl WHERE pl.language_id = l.id) AS usage FROM languages l ORDER BY l.sort_order, l.label`);
  return r.rows;
}

export type AuthorityRow = { id: string; name: string; shortName: string | null; kind: string; jurisdictionStateId: string | null; stateName: string | null; officialUrl: string | null; lookupUrl: string | null; policyVersion: string; acceptedForBooking: boolean; publicLabel: string | null; active: boolean; credentials: number };
export async function listAuthorities(): Promise<AuthorityRow[]> {
  const res = await db().execute<AuthorityRow>(sql`
    SELECT a.id, a.name, a.short_name AS "shortName", a.kind, a.jurisdiction_state_id AS "jurisdictionStateId", s.name AS "stateName", a.official_url AS "officialUrl", a.lookup_url AS "lookupUrl", a.policy_version AS "policyVersion", a.accepted_for_booking AS "acceptedForBooking", a.public_label AS "publicLabel", a.active,
      (SELECT count(*)::int FROM credentials c WHERE c.authority_id = a.id) AS credentials
    FROM credential_authorities a LEFT JOIN states s ON s.id = a.jurisdiction_state_id ORDER BY s.name NULLS FIRST, a.kind, a.name`);
  return res.rows;
}

export type PolicyRow = { id: string; type: string; key: string; version: string; title: string; scopeType: string; stateId: string | null; stateName: string | null; content: Record<string, unknown>; bodyMarkdown: string | null; effectiveAt: Date; supersededAt: Date | null; approvedBy: string | null; createdAt: Date };
export async function listPolicies(type?: string): Promise<PolicyRow[]> {
  const res = await db().execute<PolicyRow>(sql`
    SELECT p.id, p.type, p.key, p.version, p.title, p.scope_type AS "scopeType", p.state_id AS "stateId", s.name AS "stateName", p.content, p.body_markdown AS "bodyMarkdown", p.effective_at AS "effectiveAt", p.superseded_at AS "supersededAt", coalesce(u.display_name, u.email) AS "approvedBy", p.created_at AS "createdAt"
    FROM policies p LEFT JOIN states s ON s.id = p.state_id LEFT JOIN users u ON u.id = p.approved_by_user_id ${type ? sql`WHERE p.type = ${type}::policy_type` : sql``} ORDER BY p.type, p.key, p.effective_at DESC`);
  return res.rows;
}

export type TemplateRow = { id: string; eventType: string; channel: string; language: string; version: number; subject: string | null; body: string; active: boolean; providerTemplateId: string | null; updatedAt: Date };
export async function listTemplates(): Promise<TemplateRow[]> {
  const res = await db().execute<TemplateRow>(sql`SELECT id, event_type AS "eventType", channel, language, version, subject, body, active, provider_template_id AS "providerTemplateId", updated_at AS "updatedAt" FROM notification_templates ORDER BY event_type, channel, language, version DESC`);
  return res.rows;
}

export type ConfigRow = { key: string; value: unknown; description: string; srsRef: string | null; updatedBy: string | null; updatedAt: Date; history: { previousValue: unknown; newValue: unknown; actor: string | null; reason: string | null; occurredAt: Date }[] };
export async function listConfig(): Promise<ConfigRow[]> {
  const res = await db().execute<ConfigRow>(sql`
    SELECT c.key, c.value, c.description, c.srs_ref AS "srsRef", coalesce(u.display_name, u.email) AS "updatedBy", c.updated_at AS "updatedAt",
      coalesce((SELECT json_agg(json_build_object('previousValue', h.previous_value, 'newValue', h.new_value, 'actor', coalesce(hu.display_name, hu.email), 'reason', h.reason, 'occurredAt', h.occurred_at) ORDER BY h.occurred_at DESC) FROM (SELECT * FROM config_history WHERE key = c.key ORDER BY occurred_at DESC LIMIT 5) h LEFT JOIN users hu ON hu.id = h.actor_user_id), '[]'::json) AS history
    FROM platform_config c LEFT JOIN users u ON u.id = c.updated_by_user_id ORDER BY c.key`);
  return res.rows;
}

export type FlagRow = { key: string; enabled: boolean; description: string; owner: string | null; updatedBy: string | null; updatedAt: Date; lastEvent: { enabled: boolean; actor: string | null; reason: string | null; occurredAt: Date } | null };
export async function listFlags(): Promise<FlagRow[]> {
  const res = await db().execute<FlagRow>(sql`
    SELECT f.key, f.enabled, f.description, f.owner, coalesce(u.display_name, u.email) AS "updatedBy", f.updated_at AS "updatedAt",
      (SELECT json_build_object('enabled', e.enabled, 'actor', coalesce(eu.display_name, eu.email), 'reason', e.reason, 'occurredAt', e.occurred_at) FROM feature_flag_events e LEFT JOIN users eu ON eu.id = e.actor_user_id WHERE e.key = f.key ORDER BY e.occurred_at DESC LIMIT 1) AS "lastEvent"
    FROM feature_flags f LEFT JOIN users u ON u.id = f.updated_by_user_id ORDER BY f.key`);
  return res.rows;
}

export type StaffRow = { id: string; name: string | null; email: string | null; mobile: string | null; status: string; lastSeenAt: Date | null; twoFactor: boolean; roles: { id: string; role: string; grantedBy: string | null; reason: string | null; createdAt: Date; expiresAt: Date | null }[]; pendingEscalation: string | null };
export async function listStaff(): Promise<StaffRow[]> {
  const res = await db().execute<StaffRow>(sql`
    SELECT u.id, u.display_name AS name, u.email, u.mobile, u.status, u.last_seen_at AS "lastSeenAt", coalesce(au.two_factor_enabled, false) AS "twoFactor",
      coalesce((SELECT json_agg(json_build_object('id', ra.id, 'role', ra.role, 'grantedBy', coalesce(g.display_name, g.email), 'reason', ra.reason, 'createdAt', ra.created_at, 'expiresAt', ra.expires_at) ORDER BY ra.created_at) FROM role_assignments ra LEFT JOIN users g ON g.id = ra.granted_by_user_id WHERE ra.user_id = u.id AND ra.revoked_at IS NULL AND ra.scope_type = 'global' AND ra.role IN ('verification_reviewer','support_agent','analyst','super_admin')), '[]'::json) AS roles,
      (SELECT vc.id FROM verification_cases vc WHERE vc.case_type = 'role_escalation' AND vc.subject_id = u.id AND vc.state IN ('open','in_review') LIMIT 1) AS "pendingEscalation"
    FROM users u LEFT JOIN auth."user" au ON au.id::text = u.auth_subject
    WHERE EXISTS (SELECT 1 FROM role_assignments ra WHERE ra.user_id = u.id AND ra.role IN ('verification_reviewer','support_agent','analyst','super_admin')) OR au.kind = 'staff'
    ORDER BY u.status, coalesce(u.display_name, u.email)`);
  return res.rows;
}
