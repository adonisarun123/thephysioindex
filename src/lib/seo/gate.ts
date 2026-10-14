import { sql } from "drizzle-orm";
import { db } from "@/db/client";

/**
 * Indexation gate (SEO-02). The default for a path is derived from whether it
 * carries useful content; staff can pin a decision per path in
 * `seo_route_overrides` with a reason and an optional expiry. Overrides win
 * over defaults; expired overrides are ignored. Noindex is never used as an
 * access control — private routes are protected by authentication.
 */

export type IndexDecision = {
  index: boolean;
  source: "override" | "default";
  reason: string | null;
  override: { directive: "force_index" | "force_noindex"; reason: string; expiresAt: string | null } | null;
};

export type RouteOverride = {
  id: string;
  path: string;
  directive: "force_index" | "force_noindex";
  reason: string;
  expiresAt: string | null;
  createdAt: string;
  setByEmail: string | null;
};

/** Normalise a request path to the key stored in seo_route_overrides. */
export function normalisePath(path: string): string {
  let p = path.trim();
  if (!p.startsWith("/")) p = `/${p}`;
  p = p.split("?")[0].split("#")[0];
  if (p.length > 1) p = p.replace(/\/+$/, "");
  return p.toLowerCase();
}

export async function getOverride(path: string): Promise<IndexDecision["override"]> {
  const res = await db().execute<{ directive: string; reason: string; expires_at: Date | null }>(sql`
    SELECT directive, reason, expires_at FROM seo_route_overrides
    WHERE path = ${normalisePath(path)} AND (expires_at IS NULL OR expires_at > now()) LIMIT 1
  `);
  const r = res.rows[0];
  if (!r || (r.directive !== "force_index" && r.directive !== "force_noindex")) return null;
  return { directive: r.directive, reason: r.reason, expiresAt: r.expires_at ? r.expires_at.toISOString() : null };
}

/**
 * Decide whether `path` should be indexable. `hasContent` is the caller's
 * default (e.g. a published, non-noindex article; a hub with ≥3 items; a
 * location with ≥1 published practitioner).
 */
export async function indexDecision(path: string, opts: { hasContent: boolean }): Promise<IndexDecision> {
  const override = await getOverride(path).catch(() => null);
  if (override) {
    return { index: override.directive === "force_index", source: "override", reason: override.reason, override };
  }
  return { index: opts.hasContent, source: "default", reason: opts.hasContent ? null : "No indexable content yet", override: null };
}

/** Next.js metadata `robots` value from a decision. Follow links either way so crawlers still discover indexable pages. */
export function robotsFor(d: IndexDecision) {
  return d.index ? { index: true, follow: true } : { index: false, follow: true };
}

export async function listOverrides(): Promise<RouteOverride[]> {
  const res = await db().execute<{ id: string; path: string; directive: string; reason: string; expires_at: Date | null; created_at: Date; email: string | null }>(sql`
    SELECT o.id, o.path, o.directive, o.reason, o.expires_at, o.created_at, u.email
    FROM seo_route_overrides o LEFT JOIN users u ON u.id = o.set_by_user_id
    ORDER BY o.created_at DESC
  `);
  return res.rows.map((r) => ({
    id: r.id,
    path: r.path,
    directive: r.directive as RouteOverride["directive"],
    reason: r.reason,
    expiresAt: r.expires_at ? r.expires_at.toISOString() : null,
    createdAt: r.created_at.toISOString(),
    setByEmail: r.email,
  }));
}
