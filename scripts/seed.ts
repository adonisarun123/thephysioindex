/**
 * Idempotent master-data seed (DIR-07, DIR-08, PRO-08, VER-01, Section 30).
 * Safe to re-run: every write is an upsert keyed on the natural identifier.
 *
 *   npm run db:seed
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: [".env.local", ".env"] });
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../src/db/schema";
import { CITIES, LOCALITIES, STATES } from "../src/db/seed/geography";
import {
  CREDENTIAL_AUTHORITIES,
  FEATURE_FLAGS,
  LANGUAGES,
  NOTIFICATION_TEMPLATES,
  PLATFORM_CONFIG,
  POLICIES,
  SERVICES,
  SPECIALTIES,
} from "../src/db/seed/master-data";
import { normaliseAlias, slugify } from "../src/lib/slug";

async function main() {
  const url = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!url) throw new Error("No database URL configured");
  const pool = new Pool({ connectionString: url, max: 2, application_name: "thephysioindex-seed" });
  const db = drizzle(pool, { schema });
  const started = Date.now();
  const counts: Record<string, number> = {};

  // ---- States ----
  const stateIds = new Map<string, string>();
  for (const s of STATES) {
    const [row] = await db
      .insert(schema.states)
      .values({ code: s.code, name: s.name, slug: slugify(s.name), kind: s.kind, sortOrder: s.kind === "state" ? 0 : 1 })
      .onConflictDoUpdate({ target: schema.states.code, set: { name: s.name, kind: s.kind } })
      .returning({ id: schema.states.id });
    stateIds.set(s.code, row.id);
    for (const alias of [s.name, ...(s.aliases ?? [])]) {
      await upsertAlias(db, "state", row.id, alias, alias === s.name ? "spelling" : "former_name");
    }
  }
  counts.states = stateIds.size;

  // ---- Cities ----
  const cityIds = new Map<string, string>();
  for (const c of CITIES) {
    const stateId = stateIds.get(c.state);
    if (!stateId) throw new Error(`unknown state ${c.state} for city ${c.name}`);
    const [row] = await db
      .insert(schema.cities)
      .values({
        stateId,
        name: c.name,
        slug: slugify(c.name),
        isMetro: c.tier === 1,
        tier: c.tier,
        latitude: c.lat,
        longitude: c.lng,
      })
      .onConflictDoUpdate({
        target: [schema.cities.stateId, schema.cities.slug],
        set: { name: c.name, isMetro: c.tier === 1, tier: c.tier, latitude: c.lat, longitude: c.lng },
      })
      .returning({ id: schema.cities.id });
    cityIds.set(`${c.state}/${c.name}`, row.id);
    for (const alias of [c.name, ...(c.aliases ?? [])]) {
      await upsertAlias(db, "city", row.id, alias, alias === c.name ? "spelling" : "former_name");
    }
  }
  counts.cities = cityIds.size;

  // ---- Localities (metros) ----
  let localityCount = 0;
  for (const [cityKey, list] of Object.entries(LOCALITIES)) {
    const cityId = cityIds.get(cityKey);
    if (!cityId) throw new Error(`unknown city key ${cityKey}`);
    const seen = new Set<string>();
    for (const entry of list) {
      const [name, ...aliases] = entry.split("|").map((s) => s.trim());
      const slug = slugify(name);
      if (seen.has(slug)) continue; // duplicate within the hand-written list
      seen.add(slug);
      const [row] = await db
        .insert(schema.localities)
        .values({ cityId, name, slug })
        .onConflictDoUpdate({ target: [schema.localities.cityId, schema.localities.slug], set: { name } })
        .returning({ id: schema.localities.id });
      localityCount++;
      for (const alias of [name, ...aliases]) {
        await upsertAlias(db, "locality", row.id, alias, alias === name ? "spelling" : "colloquial");
      }
    }
  }
  counts.localities = localityCount;

  // ---- Specialties, languages, services ----
  for (const [i, s] of SPECIALTIES.entries()) {
    await db
      .insert(schema.specialties)
      .values({ code: s.code, label: s.label, slug: slugify(s.label), description: s.description, requiresEvidence: s.requiresEvidence ?? false, sortOrder: i })
      .onConflictDoUpdate({ target: schema.specialties.code, set: { label: s.label, description: s.description, requiresEvidence: s.requiresEvidence ?? false, sortOrder: i } });
  }
  counts.specialties = SPECIALTIES.length;

  for (const [i, l] of LANGUAGES.entries()) {
    await db
      .insert(schema.languages)
      .values({ code: l.code, label: l.label, nativeLabel: l.nativeLabel, sortOrder: i })
      .onConflictDoUpdate({ target: schema.languages.code, set: { label: l.label, nativeLabel: l.nativeLabel, sortOrder: i } });
  }
  counts.languages = LANGUAGES.length;

  for (const [i, s] of SERVICES.entries()) {
    await db
      .insert(schema.services)
      .values({ code: s.code, label: s.label, slug: slugify(s.label), kind: s.kind, description: s.description, sortOrder: i })
      .onConflictDoUpdate({ target: schema.services.code, set: { label: s.label, kind: s.kind, description: s.description, sortOrder: i } });
  }
  counts.services = SERVICES.length;

  // ---- Credential authorities ----
  for (const a of CREDENTIAL_AUTHORITIES) {
    const jurisdictionStateId = a.jurisdictionState ? stateIds.get(a.jurisdictionState) : undefined;
    const existing = await db.execute(sql`
      SELECT id FROM credential_authorities
      WHERE name = ${a.name}
        AND coalesce(jurisdiction_state_id, '00000000-0000-0000-0000-000000000000'::uuid)
          = coalesce(${jurisdictionStateId ?? null}::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
    `);
    if (existing.rows.length === 0) {
      await db.insert(schema.credentialAuthorities).values({
        name: a.name,
        shortName: a.shortName,
        kind: a.kind,
        jurisdictionStateId,
        officialUrl: a.officialUrl,
        lookupUrl: a.lookupUrl,
        acceptedForBooking: a.acceptedForBooking,
        publicLabel: a.publicLabel,
      });
    }
  }
  counts.credentialAuthorities = CREDENTIAL_AUTHORITIES.length;

  // ---- Platform config, flags, policies, templates ----
  for (const c of PLATFORM_CONFIG) {
    await db
      .insert(schema.platformConfig)
      .values({ key: c.key, value: c.value, description: c.description, srsRef: c.srsRef })
      .onConflictDoNothing(); // never overwrite an owner-tuned value
  }
  counts.platformConfig = PLATFORM_CONFIG.length;

  for (const f of FEATURE_FLAGS) {
    await db
      .insert(schema.featureFlags)
      .values({ key: f.key, enabled: f.enabled, description: f.description, owner: f.owner })
      .onConflictDoUpdate({ target: schema.featureFlags.key, set: { description: f.description, owner: f.owner } });
  }
  counts.featureFlags = FEATURE_FLAGS.length;

  for (const p of POLICIES) {
    await db
      .insert(schema.policies)
      .values({
        type: p.type,
        key: p.key,
        version: p.version,
        title: p.title,
        stateId: p.stateCode ? stateIds.get(p.stateCode) : undefined,
        content: p.content,
        bodyMarkdown: p.bodyMarkdown,
      })
      .onConflictDoNothing();
  }
  counts.policies = POLICIES.length;

  for (const t of NOTIFICATION_TEMPLATES) {
    await db
      .insert(schema.notificationTemplates)
      .values({ eventType: t.eventType, channel: t.channel, language: "en", version: 1, subject: t.subject, body: t.body })
      .onConflictDoUpdate({
        target: [schema.notificationTemplates.eventType, schema.notificationTemplates.channel, schema.notificationTemplates.language, schema.notificationTemplates.version],
        set: { subject: t.subject, body: t.body },
      });
  }
  counts.notificationTemplates = NOTIFICATION_TEMPLATES.length;

  console.log(`[seed] done in ${Date.now() - started} ms`, counts);
  await pool.end();
}

async function upsertAlias(
  db: ReturnType<typeof drizzle<typeof schema>>,
  targetType: "state" | "city" | "locality",
  targetId: string,
  alias: string,
  kind: "spelling" | "former_name" | "abbreviation" | "local_language" | "colloquial",
) {
  await db
    .insert(schema.geoAliases)
    .values({ targetType, targetId, alias, aliasNormalised: normaliseAlias(alias), kind })
    .onConflictDoNothing();
}

main().catch((err) => {
  console.error("[seed] failed", err);
  process.exit(1);
});
