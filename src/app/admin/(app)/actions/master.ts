"use server";

import { revalidatePath } from "next/cache";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { withTransaction } from "@/db/client";
import { ApiError } from "@/lib/api";
import { audit } from "@/lib/audit";
import { requireStaff } from "@/lib/auth/session";
import { act, parseForm, zBool, zJson, zOpt, zOptInt, zReason, zReq } from "@/lib/admin/forms";
import { actorRole } from "@/lib/admin/practitioner-ops";
import { slugify } from "@/lib/slug";

/** Taxonomy: specialties, services, languages. Codes are immutable (PRO-08). */
const taxonomySchema = z.object({
  kind: z.enum(["specialties", "services", "languages"]),
  id: zOpt(40),
  code: zOpt(60),
  label: zReq(120),
  description: zOpt(1000),
  active: zBool,
  sortOrder: zOptInt(0, 9999),
  extra: zOpt(40), // specialties: requiresEvidence flag; services: kind
  reason: zReason,
});

export async function upsertTaxonomyAction(fd: FormData) {
  const v = await requireStaff("super_admin");
  const i = parseForm(taxonomySchema, fd);
  await act(`/admin/taxonomy?tab=${i.kind}`, async () => {
    await withTransaction(async (_c, tx) => {
      const table = sql.raw(i.kind);
      if (i.id) {
        const before = await tx.execute<{ label: string; active: boolean }>(sql`SELECT label, active FROM ${table} WHERE id = ${i.id} FOR UPDATE`);
        if (!before.rows[0]) throw new ApiError("NOT_FOUND", "Record not found");
        if (i.kind === "specialties") await tx.execute(sql`UPDATE specialties SET label = ${i.label}, description = ${i.description ?? null}, active = ${i.active}, sort_order = coalesce(${i.sortOrder ?? null}, sort_order), requires_evidence = ${i.extra === "requires_evidence"} WHERE id = ${i.id}`);
        else if (i.kind === "services") await tx.execute(sql`UPDATE services SET label = ${i.label}, description = ${i.description ?? null}, active = ${i.active}, sort_order = coalesce(${i.sortOrder ?? null}, sort_order), kind = coalesce(${i.extra ?? null}, kind::text)::service_kind WHERE id = ${i.id}`);
        else await tx.execute(sql`UPDATE languages SET label = ${i.label}, native_label = ${i.description ?? null}, active = ${i.active}, sort_order = coalesce(${i.sortOrder ?? null}, sort_order) WHERE id = ${i.id}`);
        await audit({ actorUserId: v.userId, actorRole: actorRole(v), action: `taxonomy.${i.kind}.update`, objectType: i.kind, objectId: i.id, reason: i.reason, changedFields: { label: { from: before.rows[0].label, to: i.label }, active: { from: before.rows[0].active, to: i.active } } }, tx);
      } else {
        if (!i.code || !/^[a-z0-9_\-]{2,60}$/.test(i.code)) throw new ApiError("INVALID_INPUT", "Code must be 2–60 lowercase letters, digits, _ or -");
        let id: string;
        if (i.kind === "specialties") id = (await tx.execute<{ id: string }>(sql`INSERT INTO specialties (code, label, slug, description, active, sort_order, requires_evidence) VALUES (${i.code}, ${i.label}, ${slugify(i.label)}, ${i.description ?? null}, ${i.active}, ${i.sortOrder ?? 0}, ${i.extra === "requires_evidence"}) RETURNING id`)).rows[0].id;
        else if (i.kind === "services") id = (await tx.execute<{ id: string }>(sql`INSERT INTO services (code, label, slug, kind, description, active, sort_order) VALUES (${i.code}, ${i.label}, ${slugify(i.label)}, ${i.extra || "other"}::service_kind, ${i.description ?? null}, ${i.active}, ${i.sortOrder ?? 0}) RETURNING id`)).rows[0].id;
        else id = (await tx.execute<{ id: string }>(sql`INSERT INTO languages (code, label, native_label, active, sort_order) VALUES (${i.code}, ${i.label}, ${i.description ?? null}, ${i.active}, ${i.sortOrder ?? 0}) RETURNING id`)).rows[0].id;
        await audit({ actorUserId: v.userId, actorRole: actorRole(v), action: `taxonomy.${i.kind}.create`, objectType: i.kind, objectId: id, reason: i.reason, changedFields: { code: i.code, label: i.label } }, tx);
      }
    });
    revalidatePath("/admin/taxonomy");
    return { notice: i.id ? "Updated" : "Added" };
  });
}

/** VER-01 / VER-03: credential authorities. */
const authoritySchema = z.object({
  id: zOpt(40),
  name: zReq(200, 2),
  shortName: zOpt(40),
  kind: z.enum(["statutory_regulator", "enrolment_body", "degree_awarding", "professional_association", "other"]),
  jurisdictionStateId: zOpt(40),
  officialUrl: zOpt(300),
  lookupUrl: zOpt(300),
  policyVersion: zOpt(40),
  acceptedForBooking: zBool,
  publicLabel: zOpt(80),
  active: zBool,
  reason: zReason,
});

export async function upsertAuthorityAction(fd: FormData) {
  const v = await requireStaff("super_admin");
  const i = parseForm(authoritySchema, fd);
  await act("/admin/authorities", async () => {
    await withTransaction(async (_c, tx) => {
      const stateId = i.jurisdictionStateId || null;
      if (i.id) {
        const before = await tx.execute<{ accepted_for_booking: boolean; active: boolean; name: string }>(sql`SELECT accepted_for_booking, active, name FROM credential_authorities WHERE id = ${i.id} FOR UPDATE`);
        if (!before.rows[0]) throw new ApiError("NOT_FOUND", "Authority not found");
        await tx.execute(sql`UPDATE credential_authorities SET name = ${i.name}, short_name = ${i.shortName ?? null}, kind = ${i.kind}::authority_kind, jurisdiction_state_id = ${stateId}::uuid, official_url = ${i.officialUrl ?? null}, lookup_url = ${i.lookupUrl ?? null},
          policy_version = coalesce(${i.policyVersion ?? null}, policy_version), accepted_for_booking = ${i.acceptedForBooking}, public_label = ${i.publicLabel ?? null}, active = ${i.active} WHERE id = ${i.id}`);
        await audit({ actorUserId: v.userId, actorRole: actorRole(v), action: "authority.update", objectType: "credential_authority", objectId: i.id, reason: i.reason, changedFields: { name: { from: before.rows[0].name, to: i.name }, acceptedForBooking: { from: before.rows[0].accepted_for_booking, to: i.acceptedForBooking }, active: { from: before.rows[0].active, to: i.active } } }, tx);
      } else {
        const r = await tx.execute<{ id: string }>(sql`INSERT INTO credential_authorities (name, short_name, kind, jurisdiction_state_id, official_url, lookup_url, policy_version, accepted_for_booking, public_label, active)
          VALUES (${i.name}, ${i.shortName ?? null}, ${i.kind}::authority_kind, ${stateId}::uuid, ${i.officialUrl ?? null}, ${i.lookupUrl ?? null}, ${i.policyVersion ?? "2026-10"}, ${i.acceptedForBooking}, ${i.publicLabel ?? null}, ${i.active}) RETURNING id`);
        await audit({ actorUserId: v.userId, actorRole: actorRole(v), action: "authority.create", objectType: "credential_authority", objectId: r.rows[0].id, reason: i.reason, changedFields: { name: i.name, kind: i.kind } }, tx);
      }
    });
    revalidatePath("/admin/authorities");
    return { notice: i.id ? "Authority updated" : "Authority added" };
  });
}

/** VER-03: jurisdiction policy per state; a change creates a new version and supersedes the current one. */
const jurisdictionSchema = z.object({
  stateId: zOpt(40),
  bookingEnabled: zBool,
  acceptedCredentialKinds: z.union([z.string(), z.array(z.string())]).optional(),
  exceptionAllowed: zBool,
  note: zOpt(1000),
  reason: zReason,
});

export async function upsertJurisdictionPolicyAction(fd: FormData) {
  const v = await requireStaff("super_admin");
  const i = parseForm(jurisdictionSchema, fd);
  await act("/admin/authorities#jurisdiction", async () => {
    const kinds = (Array.isArray(i.acceptedCredentialKinds) ? i.acceptedCredentialKinds : i.acceptedCredentialKinds ? [i.acceptedCredentialKinds] : []).filter((k) => ["statutory_regulator", "enrolment_body", "degree_awarding", "professional_association", "other"].includes(k));
    if (i.bookingEnabled && kinds.length === 0) throw new ApiError("INVALID_INPUT", "Choose at least one accepted credential kind before enabling booking");
    await withTransaction(async (_c, tx) => {
      const stateId = i.stateId || null;
      const st = stateId ? await tx.execute<{ code: string; name: string }>(sql`SELECT code, name FROM states WHERE id = ${stateId}`) : null;
      if (stateId && !st?.rows[0]) throw new ApiError("NOT_FOUND", "State not found");
      const key = stateId ? `state-${st!.rows[0].code.toLowerCase()}` : "national-default";
      const title = stateId ? `${st!.rows[0].name} jurisdiction policy` : "National default jurisdiction policy";
      const prev = await tx.execute<{ id: string; version: string }>(sql`SELECT id, version FROM policies WHERE type = 'jurisdiction' AND key = ${key} AND superseded_at IS NULL ORDER BY effective_at DESC LIMIT 1 FOR UPDATE`);
      const n = await tx.execute<{ n: string }>(sql`SELECT count(*) AS n FROM policies WHERE type = 'jurisdiction' AND key = ${key}`);
      const version = `juris-${new Date().toISOString().slice(0, 10)}-v${Number(n.rows[0].n) + 1}`;
      const content = { bookingEnabled: i.bookingEnabled, acceptedCredentialKinds: kinds, exceptionAllowed: i.exceptionAllowed, note: i.note ?? null, validatedBy: v.email ?? v.userId };
      if (prev.rows[0]) await tx.execute(sql`UPDATE policies SET superseded_at = now() WHERE id = ${prev.rows[0].id}`);
      const r = await tx.execute<{ id: string }>(sql`INSERT INTO policies (type, key, version, title, scope_type, state_id, content, approved_by_user_id) VALUES ('jurisdiction', ${key}, ${version}, ${title}, ${stateId ? "state" : "global"}, ${stateId}::uuid, ${JSON.stringify(content)}::jsonb, ${v.userId}) RETURNING id`);
      // Authorities in this jurisdiction carry the policy version they were last validated under (VER-03).
      await tx.execute(sql`UPDATE credential_authorities SET policy_version = ${version} WHERE jurisdiction_state_id IS NOT DISTINCT FROM ${stateId}::uuid`);
      await audit({ actorUserId: v.userId, actorRole: actorRole(v), action: "policy.jurisdiction.version", objectType: "policy", objectId: r.rows[0].id, reason: i.reason, changedFields: { key, version, previousVersion: prev.rows[0]?.version ?? null, content } }, tx);
    });
    revalidatePath("/admin/authorities");
    revalidatePath("/admin/policies");
    return { notice: "New jurisdiction policy version published; previous version superseded" };
  });
}

/** Policies never change in place: a new version supersedes the current one at effective_at (ADM-05). */
const policySchema = z.object({
  type: z.enum(["cancellation", "provider_terms", "patient_terms", "privacy_notice", "jurisdiction", "ranking", "offer_terms"]),
  key: z.string().trim().regex(/^[a-z0-9\-]{2,60}$/, "key: lowercase letters, digits and hyphens"),
  version: z.string().trim().regex(/^[a-zA-Z0-9.\-]{2,40}$/, "version: letters, digits, dots and hyphens"),
  title: zReq(200),
  stateId: zOpt(40),
  effectiveAt: zOpt(40),
  content: zJson,
  bodyMarkdown: zOpt(50_000),
  reason: zReason,
});

export async function createPolicyVersionAction(fd: FormData) {
  const v = await requireStaff("super_admin");
  const i = parseForm(policySchema, fd);
  await act("/admin/policies/new", async () => {
    if (typeof i.content !== "object" || i.content === null || Array.isArray(i.content)) throw new ApiError("INVALID_INPUT", "Content must be a JSON object");
    const effectiveAt = i.effectiveAt ? new Date(i.effectiveAt) : new Date();
    if (Number.isNaN(effectiveAt.getTime())) throw new ApiError("INVALID_INPUT", "Invalid effective date");
    const id = await withTransaction(async (_c, tx) => {
      const prev = await tx.execute<{ id: string; version: string }>(sql`SELECT id, version FROM policies WHERE type = ${i.type}::policy_type AND key = ${i.key} AND superseded_at IS NULL ORDER BY effective_at DESC LIMIT 1 FOR UPDATE`);
      if (prev.rows[0] && effectiveAt.getTime() <= Date.now()) await tx.execute(sql`UPDATE policies SET superseded_at = ${effectiveAt} WHERE id = ${prev.rows[0].id}`);
      const r = await tx.execute<{ id: string }>(sql`INSERT INTO policies (type, key, version, title, scope_type, state_id, content, body_markdown, effective_at, approved_by_user_id)
        VALUES (${i.type}::policy_type, ${i.key}, ${i.version}, ${i.title}, ${i.stateId ? "state" : "global"}, ${i.stateId || null}::uuid, ${JSON.stringify(i.content)}::jsonb, ${i.bodyMarkdown ?? null}, ${effectiveAt}, ${v.userId}) RETURNING id`);
      await audit({ actorUserId: v.userId, actorRole: actorRole(v), action: "policy.version.create", objectType: "policy", objectId: r.rows[0].id, reason: i.reason, changedFields: { type: i.type, key: i.key, version: i.version, effectiveAt, supersedes: prev.rows[0]?.version ?? null, futureEffective: effectiveAt.getTime() > Date.now() } }, tx);
      return r.rows[0].id;
    });
    revalidatePath("/admin/policies");
    revalidatePath("/policies", "layout");
    return { path: `/admin/policies?type=${i.type}&highlight=${id}`, notice: effectiveAt.getTime() > Date.now() ? "Version scheduled; the current version stays in force until the effective date (supersede it then)." : "Version published and the previous version superseded" };
  });
}

/** Notification templates: a body change creates a new version; the old one is deactivated (ADM-05). */
const templateSchema = z.object({
  id: zOpt(40),
  eventType: z.string().trim().regex(/^[a-z0-9_.]{3,80}$/, "event type: lowercase, dots and underscores"),
  channel: z.enum(["in_app", "sms", "email", "whatsapp"]),
  language: z.string().trim().regex(/^[a-z]{2}(-[A-Z]{2})?$/, "language: BCP-47 like en or hi-IN").default("en"),
  subject: zOpt(200),
  body: zReq(4000),
  providerTemplateId: zOpt(100),
  active: zBool,
  reason: zReason,
});

export async function upsertTemplateAction(fd: FormData) {
  const v = await requireStaff("super_admin");
  const i = parseForm(templateSchema, fd);
  await act("/admin/policies/templates", async () => {
    await withTransaction(async (_c, tx) => {
      const prev = i.id ? await tx.execute<{ id: string; body: string; subject: string | null; version: number; active: boolean }>(sql`SELECT id, body, subject, version, active FROM notification_templates WHERE id = ${i.id} FOR UPDATE`) : null;
      if (prev && !prev.rows[0]) throw new ApiError("NOT_FOUND", "Template not found");
      const bodyChanged = !prev || prev.rows[0].body !== i.body || (prev.rows[0].subject ?? null) !== (i.subject ?? null);
      if (prev && !bodyChanged) {
        await tx.execute(sql`UPDATE notification_templates SET active = ${i.active}, provider_template_id = ${i.providerTemplateId ?? null} WHERE id = ${i.id}`);
        await audit({ actorUserId: v.userId, actorRole: actorRole(v), action: "template.update", objectType: "notification_template", objectId: i.id!, reason: i.reason, changedFields: { active: { from: prev.rows[0].active, to: i.active } } }, tx);
        return;
      }
      const maxV = await tx.execute<{ v: number | null }>(sql`SELECT max(version) AS v FROM notification_templates WHERE event_type = ${i.eventType} AND channel = ${i.channel}::channel AND language = ${i.language}`);
      const version = Number(maxV.rows[0]?.v ?? 0) + 1;
      if (i.active) await tx.execute(sql`UPDATE notification_templates SET active = false WHERE event_type = ${i.eventType} AND channel = ${i.channel}::channel AND language = ${i.language} AND active`);
      const r = await tx.execute<{ id: string }>(sql`INSERT INTO notification_templates (event_type, channel, language, version, subject, body, active, provider_template_id) VALUES (${i.eventType}, ${i.channel}::channel, ${i.language}, ${version}, ${i.subject ?? null}, ${i.body}, ${i.active}, ${i.providerTemplateId ?? null}) RETURNING id`);
      await audit({ actorUserId: v.userId, actorRole: actorRole(v), action: "template.version.create", objectType: "notification_template", objectId: r.rows[0].id, reason: i.reason, changedFields: { eventType: i.eventType, channel: i.channel, language: i.language, version, supersedes: prev?.rows[0]?.version ?? null } }, tx);
    });
    revalidatePath("/admin/policies/templates");
    return { notice: "Template saved (new version when the text changed)" };
  });
}

/** Config and flags (OPS-03): every change writes history with a reason. */
export async function updateConfigAction(fd: FormData) {
  const v = await requireStaff("super_admin");
  const i = parseForm(z.object({ key: zReq(120), value: zJson, description: zOpt(500), reason: zReason }), fd);
  await act(`/admin/config#cfg-${encodeURIComponent(i.key)}`, async () => {
    await withTransaction(async (_c, tx) => {
      const before = await tx.execute<{ value: unknown; description: string }>(sql`SELECT value, description FROM platform_config WHERE key = ${i.key} FOR UPDATE`);
      if (!before.rows[0]) throw new ApiError("NOT_FOUND", "Config key not found; keys are seeded, not created here");
      await tx.execute(sql`UPDATE platform_config SET value = ${JSON.stringify(i.value)}::jsonb, description = coalesce(${i.description ?? null}, description), updated_by_user_id = ${v.userId} WHERE key = ${i.key}`);
      await tx.execute(sql`INSERT INTO config_history (key, previous_value, new_value, actor_user_id, reason) VALUES (${i.key}, ${JSON.stringify(before.rows[0].value)}::jsonb, ${JSON.stringify(i.value)}::jsonb, ${v.userId}, ${i.reason})`);
      await audit({ actorUserId: v.userId, actorRole: actorRole(v), action: "config.update", objectType: "platform_config", reason: i.reason, changedFields: { key: i.key, from: before.rows[0].value, to: i.value } }, tx);
    });
    revalidatePath("/admin/config");
    return { notice: `${i.key} updated` };
  });
}

export async function toggleFlagAction(fd: FormData) {
  const v = await requireStaff("super_admin");
  const i = parseForm(z.object({ key: zReq(120), enabled: zBool, reason: zReason }), fd);
  await act(`/admin/config#flags`, async () => {
    await withTransaction(async (_c, tx) => {
      const before = await tx.execute<{ enabled: boolean }>(sql`SELECT enabled FROM feature_flags WHERE key = ${i.key} FOR UPDATE`);
      if (!before.rows[0]) throw new ApiError("NOT_FOUND", "Flag not found");
      await tx.execute(sql`UPDATE feature_flags SET enabled = ${i.enabled}, updated_by_user_id = ${v.userId} WHERE key = ${i.key}`);
      await tx.execute(sql`INSERT INTO feature_flag_events (key, enabled, actor_user_id, reason) VALUES (${i.key}, ${i.enabled}, ${v.userId}, ${i.reason})`);
      await audit({ actorUserId: v.userId, actorRole: actorRole(v), action: "flag.toggle", objectType: "feature_flag", reason: i.reason, changedFields: { key: i.key, from: before.rows[0].enabled, to: i.enabled } }, tx);
    });
    revalidatePath("/admin/config");
    return { notice: `${i.key} ${i.enabled ? "enabled" : "disabled"}` };
  });
}
