import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.thephysioindex.com";
  // Crawling is allowed so noindex directives can be processed (SEO-02);
  // private routes rely on authentication, not robots.
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/", "/account", "/workspace", "/admin", "/book/"] }],
    sitemap: `${base}/sitemap.xml`,
  };
}
