import type { MetadataRoute } from "next";

const PRIVATE = ["/api/", "/account", "/workspace", "/admin", "/book/", "/plan/", "/review/"];

/**
 * AI search and assistant crawlers, named so that allowing them is a recorded
 * decision and not an accident of the wildcard rule (SEO-01). They get the
 * same access as any other crawler: public pages yes, private routes no.
 */
const AI_CRAWLERS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-SearchBot",
  "Claude-User",
  "PerplexityBot",
  "Perplexity-User",
  "Google-Extended",
  "Applebot-Extended",
  "CCBot",
];

export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.thephysioindex.com";
  // Crawling is allowed so noindex directives can be processed (SEO-02);
  // private routes rely on authentication, not robots.
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: PRIVATE },
      { userAgent: AI_CRAWLERS, allow: "/", disallow: PRIVATE },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
