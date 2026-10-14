import { connection } from "next/server";
import { z } from "zod";
import { handler, ok, parseQuery } from "@/lib/api";
import { getCityBySlug, getStateBySlug, listCities, listLocalities, listStates, resolvePlace } from "@/lib/geo";
import { listCityOptions, listLocalityOptions } from "@/lib/workspace/catalog";

const Query = z.object({
  q: z.string().trim().min(2).max(80).optional(),
  state: z.string().trim().min(2).max(80).optional(),
  city: z.string().trim().min(2).max(80).optional(),
  stateId: z.string().uuid().optional(),
  cityId: z.string().uuid().optional(),
});

/**
 * GET /api/v1/locations                    -> states and UTs
 * GET /api/v1/locations?state=karnataka    -> cities in a state
 * GET /api/v1/locations?state=..&city=..   -> localities in a city
 * GET /api/v1/locations?q=bangalore        -> alias resolution (DIR-08)
 * GET /api/v1/locations?stateId=<uuid>     -> city options {id,label} (form cascades)
 * GET /api/v1/locations?cityId=<uuid>      -> locality options {id,label}
 */
export const GET = handler(async (req, rid) => {
  await connection();
  const q = parseQuery(Query, req.url);
  if (q.q) {
    const matches = await resolvePlace(q.q);
    return ok({ query: q.q, matches, ambiguous: matches.length > 1 && !matches[0]?.matchedAlias }, { requestId: rid, cache: "public", maxAge: 300 });
  }
  if (q.cityId) return ok({ items: await listLocalityOptions(q.cityId) }, { requestId: rid, cache: "public", maxAge: 300 });
  if (q.stateId) return ok({ items: await listCityOptions(q.stateId) }, { requestId: rid, cache: "public", maxAge: 300 });
  if (q.state) {
    const state = await getStateBySlug(q.state);
    if (!state) return ok({ items: [] }, { requestId: rid, status: 404 });
    if (q.city) {
      const city = await getCityBySlug(state.id, q.city);
      if (!city) return ok({ items: [] }, { requestId: rid, status: 404 });
      return ok({ state: { name: state.name, slug: state.slug }, city: { name: city.name, slug: city.slug }, items: await listLocalities(city.id) }, { requestId: rid, cache: "public", maxAge: 300 });
    }
    return ok({ state: { name: state.name, slug: state.slug }, items: await listCities(state.id) }, { requestId: rid, cache: "public", maxAge: 300 });
  }
  return ok({ items: await listStates() }, { requestId: rid, cache: "public", maxAge: 300 });
});
