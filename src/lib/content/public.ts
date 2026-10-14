import { sql, type SQL } from "drizzle-orm";
import { db } from "@/db/client";
import type { ConditionMeta, FaqItem, SourceRef } from "@/db/schema/content";

/**
 * Public editorial read models (SEO-01, SEO-02, SEO-04, DAT-02). Only
 * `published` rows are ever returned; drafts, in-review and withdrawn
 * articles never leave the server through these functions.
 */

export type ContentKind = "blog" | "condition" | "news";
export const CONTENT_KINDS: ContentKind[] = ["blog", "condition", "news"];
export const PAGE_SIZE = 12;
/** Hub pages are noindex until they carry enough published items to be useful (SEO-02). */
export const HUB_INDEX_THRESHOLD = 3;

export const KIND_PATH: Record<ContentKind, string> = { blog: "/blog", condition: "/conditions", news: "/news" };
export const KIND_LABEL: Record<ContentKind, string> = { blog: "Guides", condition: "Conditions", news: "News" };

export type ArticleSummary = {
  id: string;
  kind: ContentKind;
  slug: string;
  path: string;
  title: string;
  dek: string | null;
  tags: string[];
  newsCategory: string | null;
  readingMinutes: number | null;
  publishedAt: string;
  updatedAt: string;
  reviewed: boolean;
  specialty: { label: string; slug: string } | null;
  authorName: string | null;
};

export type PublicArticle = ArticleSummary & {
  bodyMarkdown: string;
  faqs: FaqItem[];
  sources: SourceRef[];
  condition: ConditionMeta | null;
  correction: string | null;
  correctedAt: string | null;
  coverAlt: string | null;
  noindex: boolean;
  reviewerName: string | null;
  reviewerCredential: string | null;
  reviewedAt: string | null;
  authorPractitioner: { displayName: string; path: string } | null;
};

type Row = Record<string, unknown>;
const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : v == null ? null : String(v));

const SUMMARY_COLUMNS = sql`
  a.id, a.kind, a.slug, a.title, a.dek, a.tags, a.news_category, a.reading_minutes, a.published_at, a.updated_at, a.author_name,
  (a.reviewer_name IS NOT NULL AND a.reviewer_credential IS NOT NULL AND a.reviewed_at IS NOT NULL) AS reviewed,
  s.label AS specialty_label, s.slug AS specialty_slug
`;

function toSummary(r: Row): ArticleSummary {
  const kind = r.kind as ContentKind;
  return {
    id: String(r.id),
    kind,
    slug: String(r.slug),
    path: `${KIND_PATH[kind]}/${r.slug}`,
    title: String(r.title),
    dek: (r.dek as string | null) ?? null,
    tags: (r.tags as string[] | null) ?? [],
    newsCategory: (r.news_category as string | null) ?? null,
    readingMinutes: r.reading_minutes == null ? null : Number(r.reading_minutes),
    publishedAt: iso(r.published_at) ?? "",
    updatedAt: iso(r.updated_at) ?? "",
    reviewed: Boolean(r.reviewed),
    specialty: r.specialty_slug ? { label: String(r.specialty_label), slug: String(r.specialty_slug) } : null,
    authorName: (r.author_name as string | null) ?? null,
  };
}

export type ListFilters = { page?: number; tag?: string; specialtySlug?: string; category?: string; letter?: string };

export async function listPublished(kind: ContentKind, f: ListFilters = {}): Promise<{ items: ArticleSummary[]; total: number; page: number; pages: number }> {
  const page = Math.max(1, Math.floor(f.page ?? 1));
  const where: SQL[] = [sql`a.kind = ${kind}`, sql`a.status = 'published'`];
  if (f.tag) where.push(sql`${f.tag} = ANY(a.tags)`);
  if (f.specialtySlug) where.push(sql`s.slug = ${f.specialtySlug}`);
  if (f.category) where.push(sql`a.news_category = ${f.category}`);
  if (f.letter) where.push(f.letter === "0-9" ? sql`a.title ~ '^[0-9]'` : sql`upper(left(a.title, 1)) = ${f.letter.toUpperCase()}`);
  const order = kind === "condition" ? sql`a.title ASC` : sql`a.published_at DESC, a.id`;
  const res = await db().execute<Row>(sql`
    SELECT ${SUMMARY_COLUMNS}, count(*) OVER () AS total
    FROM content_articles a LEFT JOIN specialties s ON s.id = a.primary_specialty_id
    WHERE ${sql.join(where, sql` AND `)}
    ORDER BY ${order}
    LIMIT ${PAGE_SIZE} OFFSET ${(page - 1) * PAGE_SIZE}
  `);
  const total = res.rows[0] ? Number(res.rows[0].total) : 0;
  return { items: res.rows.map(toSummary), total, page, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

/** All published condition pages, for the A–Z hub (expected to stay in the low hundreds). */
export async function listAllPublished(kind: ContentKind): Promise<ArticleSummary[]> {
  const res = await db().execute<Row>(sql`
    SELECT ${SUMMARY_COLUMNS}
    FROM content_articles a LEFT JOIN specialties s ON s.id = a.primary_specialty_id
    WHERE a.kind = ${kind} AND a.status = 'published'
    ORDER BY a.title ASC
  `);
  return res.rows.map(toSummary);
}

export async function countPublished(kind: ContentKind): Promise<number> {
  const res = await db().execute<{ n: number | string }>(sql`SELECT count(*) AS n FROM content_articles WHERE kind = ${kind} AND status = 'published'`);
  return Number(res.rows[0]?.n ?? 0);
}

export async function getPublished(kind: ContentKind, slug: string): Promise<PublicArticle | null> {
  const res = await db().execute<Row>(sql`
    SELECT ${SUMMARY_COLUMNS},
      a.body_markdown, a.faqs, a.sources, a.condition, a.correction, a.corrected_at, a.cover_alt, a.noindex,
      a.reviewer_name, a.reviewer_credential, a.reviewed_at,
      p.display_name AS ap_name, CASE WHEN p.id IS NOT NULL THEN '/physiotherapist/' || p.slug || '-' || p.public_id END AS ap_path
    FROM content_articles a
    LEFT JOIN specialties s ON s.id = a.primary_specialty_id
    LEFT JOIN practitioners p ON p.id = a.author_practitioner_id AND p.listing_status = 'published' AND p.suspended_at IS NULL
    WHERE a.kind = ${kind} AND a.slug = ${slug} AND a.status = 'published'
    LIMIT 1
  `);
  const r = res.rows[0];
  if (!r) return null;
  const reviewed = Boolean(r.reviewed);
  return {
    ...toSummary(r),
    bodyMarkdown: String(r.body_markdown ?? ""),
    faqs: (r.faqs as FaqItem[] | null) ?? [],
    sources: (r.sources as SourceRef[] | null) ?? [],
    condition: (r.condition as ConditionMeta | null) ?? null,
    correction: (r.correction as string | null) ?? null,
    correctedAt: iso(r.corrected_at),
    coverAlt: (r.cover_alt as string | null) ?? null,
    noindex: Boolean(r.noindex),
    // Reviewer attribution is all-or-nothing so the page never shows a half claim (SEO-04).
    reviewerName: reviewed ? String(r.reviewer_name) : null,
    reviewerCredential: reviewed ? String(r.reviewer_credential) : null,
    reviewedAt: reviewed ? iso(r.reviewed_at) : null,
    authorPractitioner: r.ap_path ? { displayName: String(r.ap_name), path: String(r.ap_path) } : null,
  };
}

/** Related published articles of the same kind sharing the primary specialty; falls back to newest. */
export async function listRelated(kind: ContentKind, excludeId: string, specialtySlug: string | null, limit = 4): Promise<ArticleSummary[]> {
  const res = await db().execute<Row>(sql`
    SELECT ${SUMMARY_COLUMNS}
    FROM content_articles a LEFT JOIN specialties s ON s.id = a.primary_specialty_id
    WHERE a.kind = ${kind} AND a.status = 'published' AND a.id <> ${excludeId}
    ORDER BY (s.slug = ${specialtySlug}) DESC NULLS LAST, a.published_at DESC
    LIMIT ${limit}
  `);
  return res.rows.map(toSummary);
}

/** Distinct tags / specialties / categories in use on published items, for filter pills. */
export async function listFacets(kind: ContentKind): Promise<{ specialties: { label: string; slug: string; n: number }[]; tags: string[]; categories: string[] }> {
  const [sp, tg, ct] = await Promise.all([
    db().execute<{ label: string; slug: string; n: number | string }>(sql`
      SELECT s.label, s.slug, count(*) AS n FROM content_articles a JOIN specialties s ON s.id = a.primary_specialty_id
      WHERE a.kind = ${kind} AND a.status = 'published' GROUP BY s.label, s.slug, s.sort_order ORDER BY s.sort_order
    `),
    db().execute<{ tag: string }>(sql`
      SELECT DISTINCT unnest(a.tags) AS tag FROM content_articles a WHERE a.kind = ${kind} AND a.status = 'published' ORDER BY 1
    `),
    db().execute<{ c: string }>(sql`
      SELECT DISTINCT a.news_category AS c FROM content_articles a WHERE a.kind = ${kind} AND a.status = 'published' AND a.news_category IS NOT NULL ORDER BY 1
    `),
  ]);
  return {
    specialties: sp.rows.map((r) => ({ label: r.label, slug: r.slug, n: Number(r.n) })),
    tags: tg.rows.map((r) => r.tag),
    categories: ct.rows.map((r) => r.c),
  };
}

/** Published content paths with lastmod, for sitemaps/content.xml (SEO-01). */
export async function listPublishedContentPaths(): Promise<{ path: string; updatedAt: Date; kind: ContentKind }[]> {
  const res = await db().execute<{ kind: ContentKind; slug: string; updated_at: Date; noindex: boolean }>(sql`
    SELECT kind, slug, updated_at, noindex FROM content_articles WHERE status = 'published' ORDER BY kind, published_at DESC
  `);
  return res.rows.filter((r) => !r.noindex).map((r) => ({ path: `${KIND_PATH[r.kind]}/${r.slug}`, updatedAt: r.updated_at, kind: r.kind }));
}

/** Newest items for RSS (full body rendered by the caller). */
export async function listForFeed(kind: ContentKind, limit = 20): Promise<PublicArticle[]> {
  const res = await db().execute<{ slug: string }>(sql`
    SELECT slug FROM content_articles WHERE kind = ${kind} AND status = 'published' ORDER BY published_at DESC LIMIT ${limit}
  `);
  const items = await Promise.all(res.rows.map((r) => getPublished(kind, r.slug)));
  return items.filter((a): a is PublicArticle => a != null);
}
