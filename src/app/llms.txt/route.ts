import { connection } from "next/server";
import { listIndexableLocationPaths } from "@/lib/directory";
import { CONTENT_KINDS, KIND_LABEL, KIND_PATH, listAllPublished, type ArticleSummary } from "@/lib/content/public";
import { SITE_NAME } from "@/lib/seo/jsonld";

/**
 * /llms.txt — a plain-Markdown map of the public site for AI assistants
 * (SEO-01). Built from the same published-only read models as the sitemaps,
 * so drafts, in-review content and empty location pages never appear (SEO-02).
 */

const MAX_LOCATIONS = 200;
const MAX_ARTICLES_PER_KIND = 100;

const oneLine = (s: string) => s.replace(/\s+/g, " ").trim();

function titleFromPath(path: string): string {
  const parts = path.split("/").filter(Boolean).slice(1);
  const words = (slug: string) => slug.split("-").map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w)).join(" ");
  return `Physiotherapists in ${parts.map(words).reverse().join(", ")}`;
}

export async function GET() {
  await connection();
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.thephysioindex.com";
  const [locations, ...byKind] = await Promise.all([
    listIndexableLocationPaths().catch(() => [] as string[]),
    ...CONTENT_KINDS.map((k) => listAllPublished(k).catch(() => [] as ArticleSummary[])),
  ]);

  const lines: string[] = [
    `# ${SITE_NAME}`,
    "",
    "> A directory of physiotherapists in India. Each profile is checked by a reviewer before it is published and lists qualifications, statutory registration, areas of practice, languages, clinic or home-visit locations and fees.",
    "",
    "Profiles are published by the physiotherapists themselves and reviewed by The Physio Index. Verification labels state what was checked (for example, a registration number against the council register); they do not rate treatment quality. Listings are not paid placements. Guides and condition pages are general information, not medical advice; each one states whether it was clinically reviewed and by whom.",
    "",
    "## Find a physiotherapist",
    `- [All states and union territories](${base}/physiotherapists): browse by state, city and locality`,
    ...locations.slice(0, MAX_LOCATIONS).map((p) => `- [${titleFromPath(p)}](${base}${p})`),
    "",
  ];

  CONTENT_KINDS.forEach((kind, i) => {
    const items = byKind[i];
    if (!items.length) return;
    lines.push(`## ${KIND_LABEL[kind]}`);
    lines.push(`- [All ${KIND_LABEL[kind].toLowerCase()}](${base}${KIND_PATH[kind]})`);
    for (const a of items.slice(0, MAX_ARTICLES_PER_KIND)) {
      lines.push(`- [${oneLine(a.title)}](${base}${a.path})${a.dek ? `: ${oneLine(a.dek)}` : ""}`);
    }
    lines.push("");
  });

  lines.push(
    "## For physiotherapists",
    `- [List your practice](${base}/for-physiotherapists): create or claim a profile`,
    "",
    "## About",
    `- [Help](${base}/help)`,
    `- [Privacy policy](${base}/policies/privacy)`,
    `- [Terms](${base}/policies/terms)`,
    `- [Sitemap](${base}/sitemap.xml)`,
    "",
  );

  return new Response(lines.join("\n"), {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" },
  });
}
