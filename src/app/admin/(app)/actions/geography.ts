"use server";

import { revalidatePath } from "next/cache";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { withTransaction } from "@/db/client";
import { ApiError } from "@/lib/api";
import { audit } from "@/lib/audit";
import { requireStaff } from "@/lib/auth/session";
import { act, parseForm, requireRecent, zBool, zOpt, zOptInt, zReason, zReq, zUuid } from "@/lib/admin/forms";
import { actorRole } from "@/lib/admin/practitioner-ops";
import { normaliseAlias, slugify } from "@/lib/slug";

function revalidateGeo() {
  revalidatePath("/admin/geography", "layout");
  revalidatePath("/physiotherapists", "layout");
}

/** DIR-07: states are controlled records; only name, kind, status and order change. */
export async function updateStateAction(fd: FormData) {
  const v = await requireStaff("super_admin");
  const i = parseForm(z.object({ stateId: zUuid, name: zReq(80, 2), kind: z.enum(["state", "union_territory"]), status: z.enum(["active", "inactive"]), sortOrder: zOptInt(0, 999), reason: zReason }), fd);
  await act("/admin/geography", async () => {
    await withTransaction(async (_c, tx) => {
      const before = await tx.execute<{ name: string; status: string }>(sql`SELECT name, status FROM states WHERE id = ${i.stateId} FOR UPDATE`);
      if (!before.rows[0]) throw new ApiError("NOT_FOUND", "State not found");
      await tx.execute(sql`UPDATE states SET name = ${i.name}, kind = ${i.kind}::state_kind, status = ${i.status}::geo_status, sort_order = coalesce(${i.sortOrder ?? null}, sort_order) WHERE id = ${i.stateId}`);
      if (before.rows[0].name !== i.name) await tx.execute(sql`INSERT INTO geo_aliases (target_type, target_id, alias, alias_normalised, kind) VALUES ('state', ${i.stateId}, ${before.rows[0].name}, ${normaliseAlias(before.rows[0].name)}, 'former_name') ON CONFLICT DO NOTHING`);
      await audit({ actorUserId: v.userId, actorRole: actorRole(v), action: "geo.state.update", objectType: "state", objectId: i.stateId, reason: i.reason, changedFields: { name: { from: before.rows[0].name, to: i.name }, status: { from: before.rows[0].status, to: i.status } } }, tx);
    });
    revalidateGeo();
    return { notice: "State updated" };
  });
}

const citySchema = z.object({ stateId: zUuid, cityId: zOpt(40), name: zReq(80, 2), status: z.enum(["active", "inactive"]).default("active"), isMetro: zBool, tier: zOptInt(1, 3), latitude: zOpt(20), longitude: zOpt(20), seoIntro: zOpt(2000), reason: zReason });

export async function upsertCityAction(fd: FormData) {
  const v = await requireStaff("super_admin");
  const i = parseForm(citySchema, fd);
  await act(`/admin/geography/${i.stateId}`, async () => {
    const lat = i.latitude ? Number(i.latitude) : null;
    const lng = i.longitude ? Number(i.longitude) : null;
    await withTransaction(async (_c, tx) => {
      if (i.cityId) {
        const before = await tx.execute<{ name: string; slug: string; status: string }>(sql`SELECT name, slug, status FROM cities WHERE id = ${i.cityId} AND state_id = ${i.stateId} FOR UPDATE`);
        if (!before.rows[0]) throw new ApiError("NOT_FOUND", "City not found");
        await tx.execute(sql`UPDATE cities SET name = ${i.name}, status = ${i.status}::geo_status, is_metro = ${i.isMetro}, tier = ${i.tier ?? null}, latitude = ${lat}, longitude = ${lng}, seo_intro = ${i.seoIntro ?? null} WHERE id = ${i.cityId}`);
        // Renames keep the slug (stable URLs, DIR-06) and record the former name as an alias (DIR-08).
        if (before.rows[0].name !== i.name) await tx.execute(sql`INSERT INTO geo_aliases (target_type, target_id, alias, alias_normalised, kind) VALUES ('city', ${i.cityId}, ${before.rows[0].name}, ${normaliseAlias(before.rows[0].name)}, 'former_name') ON CONFLICT DO NOTHING`);
        await audit({ actorUserId: v.userId, actorRole: actorRole(v), action: "geo.city.update", objectType: "city", objectId: i.cityId, reason: i.reason, changedFields: { name: { from: before.rows[0].name, to: i.name }, status: { from: before.rows[0].status, to: i.status } } }, tx);
      } else {
        const r = await tx.execute<{ id: string }>(sql`INSERT INTO cities (state_id, name, slug, status, is_metro, tier, latitude, longitude, seo_intro) VALUES (${i.stateId}, ${i.name}, ${slugify(i.name)}, ${i.status}::geo_status, ${i.isMetro}, ${i.tier ?? null}, ${lat}, ${lng}, ${i.seoIntro ?? null}) RETURNING id`);
        await audit({ actorUserId: v.userId, actorRole: actorRole(v), action: "geo.city.create", objectType: "city", objectId: r.rows[0].id, reason: i.reason, changedFields: { name: i.name } }, tx);
      }
    });
    revalidateGeo();
    return { notice: i.cityId ? "City updated" : "City added" };
  });
}

/** DIR-15: merge moves branches and localities, keeps the old slug as a redirect, marks the source merged. */
export async function mergeCityAction(fd: FormData) {
  const v = await requireStaff("super_admin");
  const i = parseForm(z.object({ stateId: zUuid, sourceCityId: zUuid, targetCityId: zUuid, reason: zReason }), fd);
  requireRecent(v, `/admin/geography/${i.stateId}`);
  await act(`/admin/geography/${i.stateId}`, async () => {
    if (i.sourceCityId === i.targetCityId) throw new ApiError("INVALID_INPUT", "Choose a different target city");
    const moved = await withTransaction(async (_c, tx) => {
      const [a, b] = [i.sourceCityId, i.targetCityId].sort();
      const rows = await tx.execute<{ id: string; name: string; slug: string; status: string; state_id: string; state_slug: string }>(sql`SELECT c.id, c.name, c.slug, c.status, c.state_id, s.slug AS state_slug FROM cities c JOIN states s ON s.id = c.state_id WHERE c.id IN (${a}, ${b}) ORDER BY c.id FOR UPDATE OF c`);
      const src = rows.rows.find((r) => r.id === i.sourceCityId);
      const tgt = rows.rows.find((r) => r.id === i.targetCityId);
      if (!src || !tgt) throw new ApiError("NOT_FOUND", "City not found");
      if (tgt.status !== "active") throw new ApiError("INVALID_INPUT", "Target city must be active");
      // Localities: move, renaming on slug collision so the unique index holds; branches follow their locality.
      const locs = await tx.execute<{ id: string; slug: string; name: string }>(sql`SELECT id, slug, name FROM localities WHERE city_id = ${src.id}`);
      for (const l of locs.rows) {
        const clash = await tx.execute<{ id: string }>(sql`SELECT id FROM localities WHERE city_id = ${tgt.id} AND slug = ${l.slug}`);
        if (clash.rows[0]) {
          await tx.execute(sql`UPDATE branches SET locality_id = ${clash.rows[0].id}, city_id = ${tgt.id} WHERE locality_id = ${l.id}`);
          await tx.execute(sql`UPDATE localities SET status = 'merged', merged_into_locality_id = ${clash.rows[0].id} WHERE id = ${l.id}`);
          await tx.execute(sql`INSERT INTO geo_slug_redirects (target_type, old_path, target_id) VALUES ('locality', ${`/physiotherapists/${src.state_slug}/${src.slug}/${l.slug}`}, ${clash.rows[0].id}) ON CONFLICT DO NOTHING`);
        } else {
          await tx.execute(sql`UPDATE localities SET city_id = ${tgt.id} WHERE id = ${l.id}`);
          await tx.execute(sql`UPDATE branches SET city_id = ${tgt.id} WHERE locality_id = ${l.id}`);
          await tx.execute(sql`INSERT INTO geo_slug_redirects (target_type, old_path, target_id) VALUES ('locality', ${`/physiotherapists/${src.state_slug}/${src.slug}/${l.slug}`}, ${l.id}) ON CONFLICT DO NOTHING`);
        }
      }
      const br = await tx.execute(sql`UPDATE branches SET city_id = ${tgt.id}, state_id = ${tgt.state_id} WHERE city_id = ${src.id}`);
      await tx.execute(sql`UPDATE analytics.events SET city_id = ${tgt.id} WHERE city_id = ${src.id}`).catch(() => undefined);
      await tx.execute(sql`UPDATE locality_proposals SET city_id = ${tgt.id} WHERE city_id = ${src.id} AND state = 'pending'`);
      await tx.execute(sql`UPDATE geo_aliases SET target_id = ${tgt.id} WHERE target_type = 'city' AND target_id = ${src.id} AND alias_normalised NOT IN (SELECT alias_normalised FROM geo_aliases WHERE target_type = 'city' AND target_id = ${tgt.id})`);
      await tx.execute(sql`DELETE FROM geo_aliases WHERE target_type = 'city' AND target_id = ${src.id}`);
      await tx.execute(sql`INSERT INTO geo_aliases (target_type, target_id, alias, alias_normalised, kind) VALUES ('city', ${tgt.id}, ${src.name}, ${normaliseAlias(src.name)}, 'former_name') ON CONFLICT DO NOTHING`);
      await tx.execute(sql`INSERT INTO geo_slug_redirects (target_type, old_path, target_id) VALUES ('city', ${`/physiotherapists/${src.state_slug}/${src.slug}`}, ${tgt.id}) ON CONFLICT DO NOTHING`);
      await tx.execute(sql`UPDATE cities SET status = 'merged', merged_into_city_id = ${tgt.id} WHERE id = ${src.id}`);
      await audit({ actorUserId: v.userId, actorRole: actorRole(v), action: "geo.city.merge", objectType: "city", objectId: tgt.id, reason: i.reason, changedFields: { sourceCityId: src.id, sourceName: src.name, localities: locs.rows.length, branches: br.rowCount ?? 0 } }, tx);
      return { localities: locs.rows.length, branches: br.rowCount ?? 0 };
    });
    revalidateGeo();
    return { notice: `Merged: ${moved.localities} localities and ${moved.branches} branches moved; old URLs redirect (DIR-15).` };
  });
}

const localitySchema = z.object({ cityId: zUuid, localityId: zOpt(40), name: zReq(80, 2), status: z.enum(["active", "inactive"]).default("active"), latitude: zOpt(20), longitude: zOpt(20), pinCodes: zOpt(200), seoIntro: zOpt(2000), reason: zReason });

export async function upsertLocalityAction(fd: FormData) {
  const v = await requireStaff("super_admin");
  const i = parseForm(localitySchema, fd);
  await act(`/admin/geography/cities/${i.cityId}`, async () => {
    const lat = i.latitude ? Number(i.latitude) : null;
    const lng = i.longitude ? Number(i.longitude) : null;
    const pins = i.pinCodes ? i.pinCodes.split(/[,\s]+/).filter(Boolean) : null;
    if (pins?.some((p) => !/^[1-9][0-9]{5}$/.test(p))) throw new ApiError("INVALID_INPUT", "PIN codes must be six digits");
    await withTransaction(async (_c, tx) => {
      if (i.localityId) {
        const before = await tx.execute<{ name: string; status: string }>(sql`SELECT name, status FROM localities WHERE id = ${i.localityId} AND city_id = ${i.cityId} FOR UPDATE`);
        if (!before.rows[0]) throw new ApiError("NOT_FOUND", "Locality not found");
        await tx.execute(sql`UPDATE localities SET name = ${i.name}, status = ${i.status}::geo_status, latitude = ${lat}, longitude = ${lng}, pin_codes = ${pins}::text[], seo_intro = ${i.seoIntro ?? null} WHERE id = ${i.localityId}`);
        if (before.rows[0].name !== i.name) await tx.execute(sql`INSERT INTO geo_aliases (target_type, target_id, alias, alias_normalised, kind) VALUES ('locality', ${i.localityId}, ${before.rows[0].name}, ${normaliseAlias(before.rows[0].name)}, 'former_name') ON CONFLICT DO NOTHING`);
        await audit({ actorUserId: v.userId, actorRole: actorRole(v), action: "geo.locality.update", objectType: "locality", objectId: i.localityId, reason: i.reason, changedFields: { name: { from: before.rows[0].name, to: i.name }, status: { from: before.rows[0].status, to: i.status } } }, tx);
      } else {
        const r = await tx.execute<{ id: string }>(sql`INSERT INTO localities (city_id, name, slug, status, latitude, longitude, pin_codes, seo_intro) VALUES (${i.cityId}, ${i.name}, ${slugify(i.name)}, ${i.status}::geo_status, ${lat}, ${lng}, ${pins}::text[], ${i.seoIntro ?? null}) RETURNING id`);
        await audit({ actorUserId: v.userId, actorRole: actorRole(v), action: "geo.locality.create", objectType: "locality", objectId: r.rows[0].id, reason: i.reason, changedFields: { name: i.name } }, tx);
      }
    });
    revalidateGeo();
    return { notice: i.localityId ? "Locality updated" : "Locality added" };
  });
}

export async function mergeLocalityAction(fd: FormData) {
  const v = await requireStaff("super_admin");
  const i = parseForm(z.object({ cityId: zUuid, sourceLocalityId: zUuid, targetLocalityId: zUuid, reason: zReason }), fd);
  requireRecent(v, `/admin/geography/cities/${i.cityId}`);
  await act(`/admin/geography/cities/${i.cityId}`, async () => {
    if (i.sourceLocalityId === i.targetLocalityId) throw new ApiError("INVALID_INPUT", "Choose a different target locality");
    const n = await withTransaction(async (_c, tx) => {
      const rows = await tx.execute<{ id: string; name: string; slug: string; status: string; city_slug: string; state_slug: string; city_id: string }>(sql`
        SELECT l.id, l.name, l.slug, l.status, l.city_id, c.slug AS city_slug, s.slug AS state_slug FROM localities l JOIN cities c ON c.id = l.city_id JOIN states s ON s.id = c.state_id WHERE l.id IN (${i.sourceLocalityId}, ${i.targetLocalityId}) ORDER BY l.id FOR UPDATE OF l`);
      const src = rows.rows.find((r) => r.id === i.sourceLocalityId);
      const tgt = rows.rows.find((r) => r.id === i.targetLocalityId);
      if (!src || !tgt) throw new ApiError("NOT_FOUND", "Locality not found");
      if (tgt.status !== "active") throw new ApiError("INVALID_INPUT", "Target locality must be active");
      const br = await tx.execute(sql`UPDATE branches SET locality_id = ${tgt.id}, city_id = ${tgt.city_id} WHERE locality_id = ${src.id}`);
      await tx.execute(sql`UPDATE geo_aliases SET target_id = ${tgt.id} WHERE target_type = 'locality' AND target_id = ${src.id} AND alias_normalised NOT IN (SELECT alias_normalised FROM geo_aliases WHERE target_type = 'locality' AND target_id = ${tgt.id})`);
      await tx.execute(sql`DELETE FROM geo_aliases WHERE target_type = 'locality' AND target_id = ${src.id}`);
      await tx.execute(sql`INSERT INTO geo_aliases (target_type, target_id, alias, alias_normalised, kind) VALUES ('locality', ${tgt.id}, ${src.name}, ${normaliseAlias(src.name)}, 'former_name') ON CONFLICT DO NOTHING`);
      await tx.execute(sql`INSERT INTO geo_slug_redirects (target_type, old_path, target_id) VALUES ('locality', ${`/physiotherapists/${src.state_slug}/${src.city_slug}/${src.slug}`}, ${tgt.id}) ON CONFLICT DO NOTHING`);
      await tx.execute(sql`UPDATE locality_proposals SET resolved_locality_id = ${tgt.id} WHERE resolved_locality_id = ${src.id}`);
      await tx.execute(sql`UPDATE localities SET status = 'merged', merged_into_locality_id = ${tgt.id} WHERE id = ${src.id}`);
      await audit({ actorUserId: v.userId, actorRole: actorRole(v), action: "geo.locality.merge", objectType: "locality", objectId: tgt.id, reason: i.reason, changedFields: { sourceLocalityId: src.id, sourceName: src.name, branches: br.rowCount ?? 0 } }, tx);
      return br.rowCount ?? 0;
    });
    revalidateGeo();
    return { notice: `Merged; ${n} branch(es) moved and the old URL redirects (DIR-15).` };
  });
}

export async function aliasAction(fd: FormData) {
  const v = await requireStaff("super_admin");
  const i = parseForm(z.object({ op: z.enum(["add", "remove"]), targetType: z.enum(["state", "city", "locality"]), targetId: zUuid, alias: zOpt(80), kind: z.enum(["spelling", "former_name", "abbreviation", "local_language", "colloquial"]).default("spelling"), aliasId: zOpt(40), returnTo: zReq(300) }), fd);
  await act(i.returnTo.startsWith("/admin") ? i.returnTo : "/admin/geography", async () => {
    await withTransaction(async (_c, tx) => {
      if (i.op === "add") {
        if (!i.alias) throw new ApiError("INVALID_INPUT", "Alias is required");
        await tx.execute(sql`INSERT INTO geo_aliases (target_type, target_id, alias, alias_normalised, kind) VALUES (${i.targetType}::geo_target_type, ${i.targetId}, ${i.alias}, ${normaliseAlias(i.alias)}, ${i.kind}::alias_kind)`);
        await audit({ actorUserId: v.userId, actorRole: actorRole(v), action: "geo.alias.add", objectType: i.targetType, objectId: i.targetId, changedFields: { alias: i.alias, kind: i.kind } }, tx);
      } else {
        if (!i.aliasId) throw new ApiError("INVALID_INPUT", "Alias id required");
        const r = await tx.execute<{ alias: string }>(sql`DELETE FROM geo_aliases WHERE id = ${i.aliasId} AND target_id = ${i.targetId} RETURNING alias`);
        await audit({ actorUserId: v.userId, actorRole: actorRole(v), action: "geo.alias.remove", objectType: i.targetType, objectId: i.targetId, changedFields: { alias: r.rows[0]?.alias } }, tx);
      }
    });
    revalidateGeo();
    return { notice: i.op === "add" ? "Alias added" : "Alias removed" };
  });
}
