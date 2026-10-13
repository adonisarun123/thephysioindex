/**
 * Idempotent master-data seed (DIR-07, DIR-08, PRO-08, VER-01, Section 30).
 * Safe to re-run: every write is a bulk upsert keyed on the natural identifier.
 * Bulk statements matter: the Vercel build runs far from the database.
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

type AliasRow = typeof schema.geoAliases.$inferInsert;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function main() {
  const url = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!url) throw new Error("No database URL configured");
  const pool = new Pool({ connectionString: url, max: 2, application_name: "thephysioindex-seed" });
  const db = drizzle(pool, { schema });
  const started = Date.now();
  const counts: Record<string, number> = {};
  const aliasRows: AliasRow[] = [];
  const pushAlias = (targetType: AliasRow["targetType"], targetId: string, alias: string, kind: AliasRow["kind"]) =>
    aliasRows.push({ targetType, targetId, alias, aliasNormalised: normaliseAlias(alias), kind });

  // ---- States (one statement) ----
  const stateRows = await db
    .insert(schema.states)
    .values(STATES.map((s) => ({ code: s.code, name: s.name, slug: slugify(s.name), kind: s.kind, sortOrder: s.kind === "state" ? 0 : 1 })))
    .onConflictDoUpdate({ target: schema.states.code, set: { name: sql`excluded.name`, kind: sql`excluded.kind` } })
    .returning({ id: schema.states.id, code: schema.states.code });
  const stateIds = new Map(stateRows.map((r) => [r.code, r.id]));
  for (const s of STATES) {
    const id = stateIds.get(s.code)!;
    pushAlias("state", id, s.name, "spelling");
    for (const a of s.aliases ?? []) pushAlias("state", id, a, "former_name");
  }
  counts.states = stateIds.size;

  // ---- Cities (one statement) ----
  const cityRows = await db
    .insert(schema.cities)
    .values(
      CITIES.map((c) => {
        const stateId = stateIds.get(c.state);
        if (!stateId) throw new Error(`unknown state ${c.state} for city ${c.name}`);
        return { stateId, name: c.name, slug: slugify(c.name), isMetro: c.tier === 1, tier: c.tier, latitude: c.lat, longitude: c.lng };
      }),
    )
    .onConflictDoUpdate({
      target: [schema.cities.stateId, schema.cities.slug],
      set: { name: sql`excluded.name`, isMetro: sql`excluded.is_metro`, tier: sql`excluded.tier`, latitude: sql`excluded.latitude`, longitude: sql`excluded.longitude` },
    })
    .returning({ id: schema.cities.id, stateId: schema.cities.stateId, slug: schema.cities.slug });
  const cityIdBySlug = new Map(cityRows.map((r) => [`${r.stateId}/${r.slug}`, r.id]));
  const cityIds = new Map<string, string>();
  for (const c of CITIES) {
    const id = cityIdBySlug.get(`${stateIds.get(c.state)}/${slugify(c.name)}`)!;
    cityIds.set(`${c.state}/${c.name}`, id);
    pushAlias("city", id, c.name, "spelling");
    for (const a of c.aliases ?? []) pushAlias("city", id, a, "former_name");
  }
  counts.cities = cityIds.size;

  // ---- Localities (one statement per metro) ----
  let localityCount = 0;
  for (const [cityKey, list] of Object.entries(LOCALITIES)) {
    const cityId = cityIds.get(cityKey);
    if (!cityId) throw new Error(`unknown city key ${cityKey}`);
    const seen = new Set<string>();
    const parsed: { name: string; slug: string; aliases: string[] }[] = [];
    for (const entry of list) {
      const [name, ...aliases] = entry.split("|").map((s) => s.trim());
      const slug = slugify(name);
      if (seen.has(slug)) continue; // duplicate within the hand-written list
      seen.add(slug);
      parsed.push({ name, slug, aliases });
    }
    const rows = await db
      .insert(schema.localities)
      .values(parsed.map((p) => ({ cityId, name: p.name, slug: p.slug })))
      .onConflictDoUpdate({ target: [schema.localities.cityId, schema.localities.slug], set: { name: sql`excluded.name` } })
      .returning({ id: schema.localities.id, slug: schema.localities.slug });
    const idBySlug = new Map(rows.map((r) => [r.slug, r.id]));
    for (const p of parsed) {
      const id = idBySlug.get(p.slug)!;
      pushAlias("locality", id, p.name, "spelling");
      for (const a of p.aliases) pushAlias("locality", id, a, "colloquial");
    }
    localityCount += parsed.length;
  }
  counts.localities = localityCount;

  // ---- Aliases (chunked bulk insert) ----
  for (const part of chunk(aliasRows, 500)) {
    await db.insert(schema.geoAliases).values(part).onConflictDoNothing();
  }
  counts.aliases = aliasRows.length;

  // ---- Specialties, languages, services ----
  await db
    .insert(schema.specialties)
    .values(SPECIALTIES.map((s, i) => ({ code: s.code, label: s.label, slug: slugify(s.label), description: s.description, requiresEvidence: s.requiresEvidence ?? false, sortOrder: i })))
    .onConflictDoUpdate({
      target: schema.specialties.code,
      set: { label: sql`excluded.label`, description: sql`excluded.description`, requiresEvidence: sql`excluded.requires_evidence`, sortOrder: sql`excluded.sort_order` },
    });
  counts.specialties = SPECIALTIES.length;

  await db
    .insert(schema.languages)
    .values(LANGUAGES.map((l, i) => ({ code: l.code, label: l.label, nativeLabel: l.nativeLabel, sortOrder: i })))
    .onConflictDoUpdate({ target: schema.languages.code, set: { label: sql`excluded.label`, nativeLabel: sql`excluded.native_label`, sortOrder: sql`excluded.sort_order` } });
  counts.languages = LANGUAGES.length;

  await db
    .insert(schema.services)
    .values(SERVICES.map((s, i) => ({ code: s.code, label: s.label, slug: slugify(s.label), kind: s.kind, description: s.description, sortOrder: i })))
    .onConflictDoUpdate({ target: schema.services.code, set: { label: sql`excluded.label`, kind: sql`excluded.kind`, description: sql`excluded.description`, sortOrder: sql`excluded.sort_order` } });
  counts.services = SERVICES.length;

  // ---- Credential authorities (insert missing only; ops owns edits, VER-03) ----
  const existingAuthorities = await db
    .select({ name: schema.credentialAuthorities.name, jurisdictionStateId: schema.credentialAuthorities.jurisdictionStateId })
    .from(schema.credentialAuthorities);
  const have = new Set(existingAuthorities.map((a) => `${a.name}|${a.jurisdictionStateId ?? ""}`));
  const newAuthorities = CREDENTIAL_AUTHORITIES.map((a) => ({
    name: a.name,
    shortName: a.shortName,
    kind: a.kind,
    jurisdictionStateId: a.jurisdictionState ? stateIds.get(a.jurisdictionState) : undefined,
    officialUrl: a.officialUrl,
    lookupUrl: a.lookupUrl,
    acceptedForBooking: a.acceptedForBooking,
    publicLabel: a.publicLabel,
  })).filter((a) => !have.has(`${a.name}|${a.jurisdictionStateId ?? ""}`));
  if (newAuthorities.length) await db.insert(schema.credentialAuthorities).values(newAuthorities);
  counts.credentialAuthorities = CREDENTIAL_AUTHORITIES.length;

  // ---- Platform config, flags, policies, templates ----
  await db
    .insert(schema.platformConfig)
    .values(PLATFORM_CONFIG.map((c) => ({ key: c.key, value: c.value, description: c.description, srsRef: c.srsRef })))
    .onConflictDoNothing(); // never overwrite an owner-tuned value
  counts.platformConfig = PLATFORM_CONFIG.length;

  await db
    .insert(schema.featureFlags)
    .values(FEATURE_FLAGS.map((f) => ({ key: f.key, enabled: f.enabled, description: f.description, owner: f.owner })))
    .onConflictDoUpdate({ target: schema.featureFlags.key, set: { description: sql`excluded.description`, owner: sql`excluded.owner` } });
  counts.featureFlags = FEATURE_FLAGS.length;

  await db
    .insert(schema.policies)
    .values(
      POLICIES.map((p) => ({
        type: p.type,
        key: p.key,
        version: p.version,
        title: p.title,
        stateId: p.stateCode ? stateIds.get(p.stateCode) : undefined,
        content: p.content,
        bodyMarkdown: p.bodyMarkdown,
      })),
    )
    .onConflictDoNothing();
  counts.policies = POLICIES.length;

  await db
    .insert(schema.notificationTemplates)
    .values(NOTIFICATION_TEMPLATES.map((t) => ({ eventType: t.eventType, channel: t.channel, language: "en", version: 1, subject: t.subject, body: t.body })))
    .onConflictDoUpdate({
      target: [schema.notificationTemplates.eventType, schema.notificationTemplates.channel, schema.notificationTemplates.language, schema.notificationTemplates.version],
      set: { subject: sql`excluded.subject`, body: sql`excluded.body` },
    });
  counts.notificationTemplates = NOTIFICATION_TEMPLATES.length;

  console.log(`[seed] done in ${Date.now() - started} ms`, counts);
  await pool.end();
}

main().catch((err) => {
  console.error("[seed] failed", err);
  process.exit(1);
});
