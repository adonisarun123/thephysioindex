import { connection } from "next/server";
import { rssXml } from "@/lib/content/feed";
import { listForFeed } from "@/lib/content/public";

/** RSS 2.0 for published news. Only published items are listed (SEO-02). */
export async function GET() {
  await connection();
  const siteUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.thephysioindex.com";
  const items = await listForFeed("news");
  const xml = rssXml({
    title: "The Physio Index — News",
    description: "Physiotherapy sector news, regulation and platform updates for India.",
    link: "/news",
    feedPath: "/news/feed.xml",
    siteUrl,
    items,
  });
  return new Response(xml, {
    headers: { "Content-Type": "application/rss+xml; charset=utf-8", "Cache-Control": "public, s-maxage=900, stale-while-revalidate=3600" },
  });
}
