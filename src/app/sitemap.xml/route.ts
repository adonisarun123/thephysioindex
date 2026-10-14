import { connection } from "next/server";
import { countPublishedPractitioners } from "@/lib/directory";
import { SITEMAP_PRACTITIONER_CHUNK, sitemapIndexXml } from "@/lib/sitemap";

/** Segmented sitemap index (SEO-01): static pages, indexable locations, clinics, practitioner chunks. */
export async function GET() {
  await connection();
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.thephysioindex.com";
  const n = await countPublishedPractitioners();
  const chunks = Math.max(1, Math.ceil(n / SITEMAP_PRACTITIONER_CHUNK));
  const urls = [
    { loc: `${base}/sitemaps/static.xml` },
    { loc: `${base}/sitemaps/locations.xml` },
    { loc: `${base}/sitemaps/clinics.xml` },
    ...Array.from({ length: chunks }, (_, i) => ({ loc: `${base}/sitemaps/practitioners-${i + 1}.xml` })),
  ];
  return new Response(sitemapIndexXml(urls), {
    headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" },
  });
}
