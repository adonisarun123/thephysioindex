const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function sitemapIndexXml(urls: { loc: string; lastmod?: string }[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
    .map((u) => `  <sitemap><loc>${esc(u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ""}</sitemap>`)
    .join("\n")}\n</sitemapindex>\n`;
}

export function urlsetXml(urls: { loc: string; lastmod?: string; changefreq?: string; priority?: number }[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
    .map(
      (u) =>
        `  <url><loc>${esc(u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ""}${u.changefreq ? `<changefreq>${u.changefreq}</changefreq>` : ""}${
          u.priority != null ? `<priority>${u.priority.toFixed(1)}</priority>` : ""
        }</url>`,
    )
    .join("\n")}\n</urlset>\n`;
}

export const SITEMAP_PRACTITIONER_CHUNK = 5000;
