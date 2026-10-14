import { connection } from "next/server";
import { listIndexableLocationPaths, listPublishedClinicPaths, listPublishedPractitionerPaths } from "@/lib/directory";
import { SITEMAP_PRACTITIONER_CHUNK, urlsetXml } from "@/lib/sitemap";
import { CONTENT_KINDS, HUB_INDEX_THRESHOLD, KIND_PATH, countPublished, listPublishedContentPaths } from "@/lib/content/public";

const STATIC = ["/", "/physiotherapists", "/for-physiotherapists", "/help", "/policies/privacy", "/policies/terms", "/policies/cancellation"];

export async function GET(_req: Request, ctx: RouteContext<"/sitemaps/[name]">) {
  await connection();
  const { name } = await ctx.params;
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.thephysioindex.com";
  const key = name.replace(/\.xml$/, "");
  let urls: { loc: string; lastmod?: string; changefreq?: string; priority?: number }[] | null = null;

  if (key === "static") {
    urls = STATIC.map((p) => ({ loc: `${base}${p}`, changefreq: "weekly", priority: p === "/" ? 1 : 0.6 }));
  } else if (key === "locations") {
    urls = (await listIndexableLocationPaths()).map((p) => ({ loc: `${base}${p}`, changefreq: "daily", priority: 0.7 }));
  } else if (key === "clinics") {
    urls = (await listPublishedClinicPaths()).map((r) => ({ loc: `${base}${r.path}`, lastmod: r.updated_at.toISOString().slice(0, 10), changefreq: "weekly", priority: 0.6 }));
  } else if (key === "content") {
    // Published, non-noindex editorial pages plus hubs that have reached the index threshold (SEO-02).
    const [items, hubCounts] = await Promise.all([listPublishedContentPaths(), Promise.all(CONTENT_KINDS.map(async (k) => [k, await countPublished(k)] as const))]);
    urls = [
      ...hubCounts.filter(([, n]) => n >= HUB_INDEX_THRESHOLD).map(([k]) => ({ loc: `${base}${KIND_PATH[k]}`, changefreq: "daily", priority: 0.6 })),
      ...items.map((r) => ({ loc: `${base}${r.path}`, lastmod: r.updatedAt.toISOString().slice(0, 10), changefreq: r.kind === "news" ? "monthly" : "weekly", priority: r.kind === "condition" ? 0.8 : 0.7 })),
    ];
  } else {
    const m = /^practitioners-(\d+)$/.exec(key);
    if (m) {
      const page = Math.max(1, Number(m[1]));
      const rows = await listPublishedPractitionerPaths((page - 1) * SITEMAP_PRACTITIONER_CHUNK, SITEMAP_PRACTITIONER_CHUNK);
      urls = rows.map((r) => ({ loc: `${base}${r.path}`, lastmod: r.updated_at.toISOString().slice(0, 10), changefreq: "weekly", priority: 0.8 }));
    }
  }
  if (!urls) return new Response("Not found", { status: 404 });
  return new Response(urlsetXml(urls), {
    headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" },
  });
}
