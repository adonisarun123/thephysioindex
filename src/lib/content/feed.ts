import { renderMarkdown } from "./markdown";
import type { PublicArticle } from "./public";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** RSS 2.0 for a content kind. Body HTML is the same sanitised render the page uses. */
export function rssXml(opts: { title: string; description: string; link: string; feedPath: string; siteUrl: string; items: PublicArticle[] }): string {
  const { siteUrl } = opts;
  const items = opts.items
    .map((a) => {
      const url = new URL(a.path, siteUrl).toString();
      const html = renderMarkdown(a.bodyMarkdown).html;
      const cats = [a.newsCategory, a.specialty?.label, ...a.tags].filter(Boolean) as string[];
      return `    <item>
      <title>${esc(a.title)}</title>
      <link>${esc(url)}</link>
      <guid isPermaLink="true">${esc(url)}</guid>
      <pubDate>${new Date(a.publishedAt).toUTCString()}</pubDate>
      ${a.dek ? `<description>${esc(a.dek)}</description>` : ""}
      ${cats.map((c) => `<category>${esc(c)}</category>`).join("")}
      <content:encoded><![CDATA[${html.replace(/]]>/g, "]]]]><![CDATA[>")}]]></content:encoded>
    </item>`;
    })
    .join("\n");
  const lastBuild = opts.items[0] ? new Date(opts.items[0].publishedAt).toUTCString() : new Date().toUTCString();
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>${esc(opts.title)}</title>
    <link>${esc(new URL(opts.link, siteUrl).toString())}</link>
    <description>${esc(opts.description)}</description>
    <language>en-in</language>
    <lastBuildDate>${lastBuild}</lastBuildDate>
    <atom:link href="${esc(new URL(opts.feedPath, siteUrl).toString())}" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>
`;
}
