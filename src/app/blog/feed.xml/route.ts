import { connection } from "next/server";
import { rssXml } from "@/lib/content/feed";
import { listForFeed } from "@/lib/content/public";

/** RSS 2.0 for published guides. Only published items are listed (SEO-02). */
export async function GET() {
  await connection();
  const siteUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.thephysioindex.com";
  const items = await listForFeed("blog");
  const xml = rssXml({
    title: "The Physio Index — Guides",
    description: "Plain-language physiotherapy guides for patients in India.",
    link: "/blog",
    feedPath: "/blog/feed.xml",
    siteUrl,
    items,
  });
  return new Response(xml, {
    headers: { "Content-Type": "application/rss+xml; charset=utf-8", "Cache-Control": "public, s-maxage=900, stale-while-revalidate=3600" },
  });
}
