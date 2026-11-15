import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { getConfig } from "@/lib/config";
import { byCityDemand, byConditionDemand, sitemapPriority } from "@/lib/seo/condition-city-demand";

/**
 * Read models for condition-by-city pages, /conditions/<condition>/<city>
 * (SEO-01, SEO-02, DIR-14). A page exists for every active condition and
 * city. It lists only published physiotherapists who ticked the condition
 * and work in the city; when there are none it says so and never invents a
 * listing, a count or a fee.
 */

export type ConditionRef = { id: string; slug: string; label: string; bodyArea: string };
export type CityRef = { id: string; slug: string; name: string; stateId: string; stateName: string; stateSlug: string };

/** Owner decision 15 Nov 2026: pages are indexable even with no physiotherapist listed. This row is the off-switch. */
export const INDEX_EMPTY_KEY = "seo.condition_city.index_without_listings";

export async function indexEmptyPages(): Promise<boolean> {
  return (await getConfig<boolean>(INDEX_EMPTY_KEY, true).catch(() => true)) !== false;
}

const showTest = () => process.env.SHOW_TEST_ACCOUNTS === "1";

export async function listConditions(): Promise<ConditionRef[]> {
  const res = await db().execute<{ id: string; slug: string; label: string; body_area: string }>(sql`SELECT id, slug, label, body_area FROM conditions WHERE active ORDER BY sort_order, label`);
  return res.rows.map((r) => ({ id: r.id, slug: r.slug, label: r.label, bodyArea: r.body_area }));
}

export async function getConditionBySlug(slug: string): Promise<ConditionRef | null> {
  const res = await db().execute<{ id: string; slug: string; label: string; body_area: string }>(sql`SELECT id, slug, label, body_area FROM conditions WHERE slug = ${slug} AND active LIMIT 1`);
  const r = res.rows[0];
  return r ? { id: r.id, slug: r.slug, label: r.label, bodyArea: r.body_area } : null;
}

type CityRow = { id: string; slug: string; name: string; state_id: string; state_name: string; state_slug: string };
const cityRef = (r: CityRow): CityRef => ({ id: r.id, slug: r.slug, name: r.name, stateId: r.state_id, stateName: r.state_name, stateSlug: r.state_slug });

export async function listCityRefs(): Promise<CityRef[]> {
  const res = await db().execute<CityRow>(sql`
    SELECT ci.id, ci.slug, ci.name, st.id AS state_id, st.name AS state_name, st.slug AS state_slug
    FROM cities ci JOIN states st ON st.id = ci.state_id WHERE ci.status = 'active' ORDER BY ci.name`);
  return res.rows.map(cityRef);
}

/** City slugs are unique across states in the seed; the lowest-named state wins if that ever changes. */
export async function getCityRef(slug: string): Promise<CityRef | null> {
  const res = await db().execute<CityRow>(sql`
    SELECT ci.id, ci.slug, ci.name, st.id AS state_id, st.name AS state_name, st.slug AS state_slug
    FROM cities ci JOIN states st ON st.id = ci.state_id WHERE ci.slug = ${slug} AND ci.status = 'active' ORDER BY st.name LIMIT 1`);
  return res.rows[0] ? cityRef(res.rows[0]) : null;
}

export type CityFacts = {
  /** Published physiotherapists with an approved, published place in the city. */
  physios: number;
  homeVisitPhysios: number;
  clinicPhysios: number;
  /** Lowest and highest "from" fee among those physiotherapists, in paise; null when no fee is published. */
  feeMinPaise: number | null;
  feeMaxPaise: number | null;
  localityCount: number;
  localities: { name: string; slug: string }[];
  /** Statutory council for the state, when we hold one. */
  regulator: string | null;
};

/** Facts about physiotherapy in one city, all read from published data. */
export async function getCityFacts(city: CityRef): Promise<CityFacts> {
  const testClause = showTest() ? sql`` : sql`AND p.is_test_account = false`;
  const res = await db().execute<{ physios: number; home: number; clinic: number; fee_min: string | number | null; fee_max: string | number | null; locality_count: number; localities: { name: string; slug: string }[]; regulator: string | null }>(sql`
    WITH live AS (
      SELECT p.id AS practitioner_id, b.kind,
        (SELECT min(ov.base_price_paise) FROM offerings o JOIN offering_versions ov ON ov.id = o.current_version_id WHERE o.practitioner_branch_id = pb.id AND o.active) AS from_fee
      FROM practitioners p
      JOIN practitioner_branches pb ON pb.practitioner_id = p.id AND pb.state = 'approved' AND pb.active_to IS NULL
      JOIN branches b ON b.id = pb.branch_id AND b.status = 'published'
      JOIN clinics c ON c.id = b.clinic_id AND c.status = 'published'
      WHERE b.city_id = ${city.id} AND p.listing_status = 'published' AND p.suspended_at IS NULL ${testClause}
    )
    SELECT
      (SELECT count(DISTINCT practitioner_id)::int FROM live) AS physios,
      (SELECT count(DISTINCT practitioner_id)::int FROM live WHERE kind = 'service_area') AS home,
      (SELECT count(DISTINCT practitioner_id)::int FROM live WHERE kind = 'clinic') AS clinic,
      (SELECT min(from_fee) FROM live) AS fee_min,
      (SELECT max(from_fee) FROM live) AS fee_max,
      (SELECT count(*)::int FROM localities l WHERE l.city_id = ${city.id} AND l.status = 'active') AS locality_count,
      (SELECT coalesce(json_agg(json_build_object('name', x.name, 'slug', x.slug) ORDER BY x.name), '[]'::json)
         FROM (SELECT l.name, l.slug FROM localities l WHERE l.city_id = ${city.id} AND l.status = 'active' ORDER BY l.name LIMIT 18) x) AS localities,
      (SELECT a.name FROM credential_authorities a WHERE a.active AND a.kind = 'statutory_regulator' AND a.jurisdiction_state_id = ${city.stateId} ORDER BY a.name LIMIT 1) AS regulator`);
  const r = res.rows[0];
  return {
    physios: Number(r?.physios ?? 0),
    homeVisitPhysios: Number(r?.home ?? 0),
    clinicPhysios: Number(r?.clinic ?? 0),
    feeMinPaise: r?.fee_min == null ? null : Number(r.fee_min),
    feeMaxPaise: r?.fee_max == null ? null : Number(r.fee_max),
    localityCount: Number(r?.locality_count ?? 0),
    localities: r?.localities ?? [],
    regulator: r?.regulator ?? null,
  };
}

/** Cities where at least one published physiotherapist lists the condition, with the count. Keyed by city slug. */
export async function citiesWithListings(conditionId: string): Promise<Map<string, number>> {
  const testClause = showTest() ? sql`` : sql`AND p.is_test_account = false`;
  const res = await db().execute<{ slug: string; n: number }>(sql`
    SELECT ci.slug, count(DISTINCT p.id)::int AS n
    FROM practitioner_conditions pc
    JOIN practitioners p ON p.id = pc.practitioner_id AND p.listing_status = 'published' AND p.suspended_at IS NULL ${testClause}
    JOIN practitioner_branches pb ON pb.practitioner_id = p.id AND pb.state = 'approved' AND pb.active_to IS NULL
    JOIN branches b ON b.id = pb.branch_id AND b.status = 'published'
    JOIN cities ci ON ci.id = b.city_id
    WHERE pc.condition_id = ${conditionId}
    GROUP BY ci.slug`);
  return new Map(res.rows.map((r) => [r.slug, Number(r.n)]));
}

/** Every condition-city pair that has at least one listing, as "condition/city". Used when empty pages are switched off. */
async function pairsWithListings(): Promise<Set<string>> {
  const testClause = showTest() ? sql`` : sql`AND p.is_test_account = false`;
  const res = await db().execute<{ pair: string }>(sql`
    SELECT DISTINCT cd.slug || '/' || ci.slug AS pair
    FROM practitioner_conditions pc
    JOIN conditions cd ON cd.id = pc.condition_id AND cd.active
    JOIN practitioners p ON p.id = pc.practitioner_id AND p.listing_status = 'published' AND p.suspended_at IS NULL ${testClause}
    JOIN practitioner_branches pb ON pb.practitioner_id = p.id AND pb.state = 'approved' AND pb.active_to IS NULL
    JOIN branches b ON b.id = pb.branch_id AND b.status = 'published'
    JOIN cities ci ON ci.id = b.city_id AND ci.status = 'active'`);
  return new Set(res.rows.map((r) => r.pair));
}

export function conditionCityPath(conditionSlug: string, citySlug: string): string {
  return `/conditions/${conditionSlug}/${citySlug}`;
}

/** Sitemap feed: condition hubs and every indexable condition-city page, highest-demand first (SEO-01, SEO-02). */
export async function listConditionCitySitemap(): Promise<{ path: string; priority: number }[]> {
  const [conditions, cities, indexEmpty] = await Promise.all([listConditions(), listCityRefs(), indexEmptyPages()]);
  const withListings = indexEmpty ? null : await pairsWithListings();
  const out: { path: string; priority: number }[] = [];
  for (const cd of byConditionDemand(conditions)) {
    if (indexEmpty) out.push({ path: `/conditions/${cd.slug}`, priority: 0.7 });
    for (const ci of byCityDemand(cities)) {
      if (withListings && !withListings.has(`${cd.slug}/${ci.slug}`)) continue;
      out.push({ path: conditionCityPath(cd.slug, ci.slug), priority: sitemapPriority(cd.slug, ci.slug) });
    }
  }
  return out;
}
