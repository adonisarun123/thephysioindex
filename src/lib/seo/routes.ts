import { countPublishedPractitioners, listIndexableLocationPaths, listPublishedClinicPaths } from "@/lib/directory";
import { CONTENT_KINDS, HUB_INDEX_THRESHOLD, KIND_PATH, countPublished, listPublishedContentPaths } from "@/lib/content/public";

/**
 * Indexable routes computed from data, for the SEO admin page (SEO-01, SEO-02).
 * Mirrors what the sitemaps emit so staff see the same picture crawlers do.
 */

export type RouteGroup = {
  key: string;
  label: string;
  description: string;
  paths: string[]; // enumerated paths (may be truncated for large groups)
  count: number;
  indexableByDefault: boolean;
};

const STATIC = ["/", "/physiotherapists", "/for-physiotherapists", "/help", "/policies/privacy", "/policies/terms", "/policies/cancellation"];

export async function computeRouteGroups(): Promise<RouteGroup[]> {
  const [locations, clinics, practitionerCount, content, hubCounts] = await Promise.all([
    listIndexableLocationPaths(),
    listPublishedClinicPaths(),
    countPublishedPractitioners(),
    listPublishedContentPaths(),
    Promise.all(CONTENT_KINDS.map(async (k) => [k, await countPublished(k)] as const)),
  ]);
  const hubs = hubCounts.map(([k, n]) => ({ path: KIND_PATH[k], n, index: n >= HUB_INDEX_THRESHOLD }));
  return [
    { key: "static", label: "Static pages", description: "Always indexable.", paths: STATIC, count: STATIC.length, indexableByDefault: true },
    {
      key: "hubs",
      label: "Content hubs",
      description: `Indexable once they carry at least ${HUB_INDEX_THRESHOLD} published items.`,
      paths: hubs.map((h) => `${h.path}  (${h.n} published → ${h.index ? "index" : "noindex"})`),
      count: hubs.length,
      indexableByDefault: hubs.every((h) => h.index),
    },
    {
      key: "locations",
      label: "Location pages with published practitioners",
      description: "State, city and locality pages with at least one published practitioner. Empty locations are noindex.",
      paths: locations,
      count: locations.length,
      indexableByDefault: true,
    },
    { key: "clinics", label: "Published clinics", description: "Clinic pages with status published.", paths: clinics.map((c) => c.path), count: clinics.length, indexableByDefault: true },
    {
      key: "practitioners",
      label: "Published practitioner profiles",
      description: "Counted, not enumerated here; see the practitioners-N sitemaps.",
      paths: [],
      count: practitionerCount,
      indexableByDefault: true,
    },
    ...CONTENT_KINDS.map((k) => {
      const paths = content.filter((c) => c.kind === k).map((c) => c.path);
      return { key: `content-${k}`, label: `Published ${k === "blog" ? "guides" : k === "condition" ? "condition pages" : "news items"}`, description: "Published and not marked noindex.", paths, count: paths.length, indexableByDefault: true };
    }),
  ];
}
