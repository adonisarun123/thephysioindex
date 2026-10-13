import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { cities, geoAliases, localities, states } from "@/db/schema";
import { normaliseAlias } from "./slug";

export type StateSummary = {
  id: string;
  code: string;
  name: string;
  slug: string;
  kind: "state" | "union_territory";
  cityCount: number;
  publishedPractitionerCount: number;
};

/** States and UTs with active city counts, for /physiotherapists (DIR-07). */
export async function listStates(): Promise<StateSummary[]> {
  const rows = await db()
    .select({
      id: states.id,
      code: states.code,
      name: states.name,
      slug: states.slug,
      kind: states.kind,
      cityCount: sql<number>`(select count(*)::int from cities c where c.state_id = ${states.id} and c.status = 'active')`,
      publishedPractitionerCount: sql<number>`(
        select count(distinct pb.practitioner_id)::int
        from practitioner_branches pb
        join branches b on b.id = pb.branch_id
        join practitioners p on p.id = pb.practitioner_id
        where b.state_id = ${states.id} and pb.state = 'approved' and pb.active_to is null
          and p.listing_status = 'published' and b.status = 'published'
      )`,
    })
    .from(states)
    .where(eq(states.status, "active"))
    .orderBy(asc(states.sortOrder), asc(states.name));
  return rows;
}

export async function getStateBySlug(slug: string) {
  const [row] = await db().select().from(states).where(and(eq(states.slug, slug), eq(states.status, "active"))).limit(1);
  return row ?? null;
}

export type CitySummary = {
  id: string;
  name: string;
  slug: string;
  isMetro: boolean;
  tier: number | null;
  localityCount: number;
  publishedPractitionerCount: number;
};

export async function listCities(stateId: string): Promise<CitySummary[]> {
  return db()
    .select({
      id: cities.id,
      name: cities.name,
      slug: cities.slug,
      isMetro: cities.isMetro,
      tier: cities.tier,
      localityCount: sql<number>`(select count(*)::int from localities l where l.city_id = ${cities.id} and l.status = 'active')`,
      publishedPractitionerCount: sql<number>`(
        select count(distinct pb.practitioner_id)::int
        from practitioner_branches pb
        join branches b on b.id = pb.branch_id
        join practitioners p on p.id = pb.practitioner_id
        where b.city_id = ${cities.id} and pb.state = 'approved' and pb.active_to is null
          and p.listing_status = 'published' and b.status = 'published'
      )`,
    })
    .from(cities)
    .where(and(eq(cities.stateId, stateId), eq(cities.status, "active")))
    .orderBy(asc(cities.tier), asc(cities.name));
}

export async function getCityBySlug(stateId: string, slug: string) {
  const [row] = await db()
    .select()
    .from(cities)
    .where(and(eq(cities.stateId, stateId), eq(cities.slug, slug), eq(cities.status, "active")))
    .limit(1);
  return row ?? null;
}

export async function listLocalities(cityId: string) {
  return db()
    .select({
      id: localities.id,
      name: localities.name,
      slug: localities.slug,
      publishedPractitionerCount: sql<number>`(
        select count(distinct pb.practitioner_id)::int
        from practitioner_branches pb
        join branches b on b.id = pb.branch_id
        join practitioners p on p.id = pb.practitioner_id
        where b.locality_id = ${localities.id} and pb.state = 'approved' and pb.active_to is null
          and p.listing_status = 'published' and b.status = 'published'
      )`,
    })
    .from(localities)
    .where(and(eq(localities.cityId, cityId), eq(localities.status, "active")))
    .orderBy(asc(localities.name));
}

export async function getLocalityBySlug(cityId: string, slug: string) {
  const [row] = await db()
    .select()
    .from(localities)
    .where(and(eq(localities.cityId, cityId), eq(localities.slug, slug), eq(localities.status, "active")))
    .limit(1);
  return row ?? null;
}

export type ResolvedPlace = {
  type: "state" | "city" | "locality";
  id: string;
  name: string;
  path: string;
  matchedAlias: string;
  context: string; // "Karnataka" or "Bengaluru, Karnataka"
};

/**
 * Resolve free text to canonical places (DIR-08). Exact alias match first,
 * then prefix match. Returns several candidates when ambiguous so the UI can
 * prompt for disambiguation.
 */
export async function resolvePlace(query: string, limit = 8): Promise<ResolvedPlace[]> {
  const norm = normaliseAlias(query);
  if (norm.length < 2) return [];
  const rows = await db().execute<{
    target_type: "state" | "city" | "locality";
    target_id: string;
    alias: string;
    exact: boolean;
    name: string;
    path: string;
    context: string;
  }>(sql`
    with hits as (
      select ga.target_type, ga.target_id, ga.alias,
             (ga.alias_normalised = ${norm}) as exact,
             min(length(ga.alias_normalised)) as alias_len
      from geo_aliases ga
      where ga.alias_normalised = ${norm} or ga.alias_normalised like ${norm + "%"}
      group by ga.target_type, ga.target_id, ga.alias, ga.alias_normalised
    )
    select h.target_type, h.target_id, h.alias, h.exact,
      case h.target_type
        when 'state' then s.name when 'city' then c.name else l.name end as name,
      case h.target_type
        when 'state' then '/physiotherapists/' || s.slug
        when 'city' then '/physiotherapists/' || cs.slug || '/' || c.slug
        else '/physiotherapists/' || lcs.slug || '/' || lc.slug || '/' || l.slug end as path,
      case h.target_type
        when 'state' then s.kind::text
        when 'city' then cs.name
        else lc.name || ', ' || lcs.name end as context
    from hits h
    left join states s on h.target_type = 'state' and s.id = h.target_id and s.status = 'active'
    left join cities c on h.target_type = 'city' and c.id = h.target_id and c.status = 'active'
    left join states cs on cs.id = c.state_id
    left join localities l on h.target_type = 'locality' and l.id = h.target_id and l.status = 'active'
    left join cities lc on lc.id = l.city_id
    left join states lcs on lcs.id = lc.state_id
    where coalesce(s.id, c.id, l.id) is not null
    order by h.exact desc,
      case h.target_type when 'city' then 0 when 'state' then 1 else 2 end,
      h.alias_len asc, name asc
    limit ${limit}
  `);
  // Deduplicate by target (several aliases can match the same place).
  const seen = new Set<string>();
  const out: ResolvedPlace[] = [];
  for (const r of rows.rows) {
    const key = `${r.target_type}:${r.target_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ type: r.target_type, id: r.target_id, name: r.name, path: r.path, matchedAlias: r.alias, context: r.context });
  }
  return out;
}

export { geoAliases };
