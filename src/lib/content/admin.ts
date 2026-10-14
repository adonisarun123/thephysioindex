import { sql, type SQL } from "drizzle-orm";
import { db } from "@/db/client";
import type { ConditionMeta, FaqItem, SourceRef } from "@/db/schema/content";
import type { Kind } from "./schemas";

/**
 * Staff-only read models for the content editor. Callers must have passed
 * requireStaff()/apiStaff() first (IAM-01); nothing here is reachable from a
 * public route.
 */

export { CONTENT_EDITOR_ROLE, KIND_LABEL_ADMIN, STATUSES, STATUS_LABEL, type ContentStatus, type PractitionerOption } from "./constants";
import { STATUSES, type ContentStatus, type PractitionerOption } from "./constants";

export type AdminArticleRow = {
  id: string;
  title: string;
  slug: string;
  status: ContentStatus;
  updatedAt: string;
  publishedAt: string | null;
  reviewed: boolean;
  authorName: string | null;
  specialtyLabel: string | null;
  revisionCount: number;
};

export type AdminArticle = {
  id: string;
  kind: Kind;
  slug: string;
  title: string;
  dek: string | null;
  bodyMarkdown: string;
  status: ContentStatus;
  authorName: string | null;
  authorPractitionerId: string | null;
  authorPractitionerName: string | null;
  reviewerName: string | null;
  reviewerCredential: string | null;
  reviewedAt: string | null;
  primarySpecialtyId: string | null;
  tags: string[];
  faqs: FaqItem[];
  sources: SourceRef[];
  condition: ConditionMeta | null;
  newsCategory: string | null;
  correction: string | null;
  correctedAt: string | null;
  coverAlt: string | null;
  readingMinutes: number | null;
  noindex: boolean;
  publishedAt: string | null;
  withdrawnAt: string | null;
  decisionReason: string | null;
  createdAt: string;
  updatedAt: string;
  revisionNo: number;
};

const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : v == null ? null : String(v));

export async function listArticles(kind: Kind, f: { status?: ContentStatus; q?: string }): Promise<{ rows: AdminArticleRow[]; counts: Record<ContentStatus, number> }> {
  const where: SQL[] = [sql`a.kind = ${kind}`];
  if (f.status) where.push(sql`a.status = ${f.status}`);
  if (f.q && f.q.trim().length >= 2) where.push(sql`(a.title ILIKE ${"%" + f.q.trim() + "%"} OR a.slug ILIKE ${"%" + f.q.trim() + "%"})`);
  const [rows, counts] = await Promise.all([
    db().execute<Record<string, unknown>>(sql`
      SELECT a.id, a.title, a.slug, a.status, a.updated_at, a.published_at, a.author_name, s.label AS specialty_label,
        (a.reviewer_name IS NOT NULL AND a.reviewer_credential IS NOT NULL AND a.reviewed_at IS NOT NULL) AS reviewed,
        (SELECT count(*) FROM content_revisions r WHERE r.article_id = a.id) AS revision_count
      FROM content_articles a LEFT JOIN specialties s ON s.id = a.primary_specialty_id
      WHERE ${sql.join(where, sql` AND `)}
      ORDER BY a.updated_at DESC LIMIT 200
    `),
    db().execute<{ status: ContentStatus; n: number | string }>(sql`SELECT status, count(*) AS n FROM content_articles WHERE kind = ${kind} GROUP BY status`),
  ]);
  const c = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<ContentStatus, number>;
  for (const r of counts.rows) c[r.status] = Number(r.n);
  return {
    rows: rows.rows.map((r) => ({
      id: String(r.id),
      title: String(r.title),
      slug: String(r.slug),
      status: r.status as ContentStatus,
      updatedAt: iso(r.updated_at) ?? "",
      publishedAt: iso(r.published_at),
      reviewed: Boolean(r.reviewed),
      authorName: (r.author_name as string | null) ?? null,
      specialtyLabel: (r.specialty_label as string | null) ?? null,
      revisionCount: Number(r.revision_count ?? 0),
    })),
    counts: c,
  };
}

export async function getArticle(id: string): Promise<AdminArticle | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const res = await db().execute<Record<string, unknown>>(sql`
    SELECT a.*, p.display_name AS ap_name,
      (SELECT coalesce(max(revision_no), 0) FROM content_revisions r WHERE r.article_id = a.id) AS revision_no
    FROM content_articles a LEFT JOIN practitioners p ON p.id = a.author_practitioner_id
    WHERE a.id = ${id} LIMIT 1
  `);
  const r = res.rows[0];
  if (!r) return null;
  return {
    id: String(r.id),
    kind: r.kind as Kind,
    slug: String(r.slug),
    title: String(r.title),
    dek: (r.dek as string | null) ?? null,
    bodyMarkdown: String(r.body_markdown ?? ""),
    status: r.status as ContentStatus,
    authorName: (r.author_name as string | null) ?? null,
    authorPractitionerId: (r.author_practitioner_id as string | null) ?? null,
    authorPractitionerName: (r.ap_name as string | null) ?? null,
    reviewerName: (r.reviewer_name as string | null) ?? null,
    reviewerCredential: (r.reviewer_credential as string | null) ?? null,
    reviewedAt: iso(r.reviewed_at),
    primarySpecialtyId: (r.primary_specialty_id as string | null) ?? null,
    tags: (r.tags as string[] | null) ?? [],
    faqs: (r.faqs as FaqItem[] | null) ?? [],
    sources: (r.sources as SourceRef[] | null) ?? [],
    condition: (r.condition as ConditionMeta | null) ?? null,
    newsCategory: (r.news_category as string | null) ?? null,
    correction: (r.correction as string | null) ?? null,
    correctedAt: iso(r.corrected_at),
    coverAlt: (r.cover_alt as string | null) ?? null,
    readingMinutes: r.reading_minutes == null ? null : Number(r.reading_minutes),
    noindex: Boolean(r.noindex),
    publishedAt: iso(r.published_at),
    withdrawnAt: iso(r.withdrawn_at),
    decisionReason: (r.decision_reason as string | null) ?? null,
    createdAt: iso(r.created_at) ?? "",
    updatedAt: iso(r.updated_at) ?? "",
    revisionNo: Number(r.revision_no ?? 0),
  };
}

export async function listSpecialtyOptions(): Promise<{ id: string; label: string }[]> {
  const res = await db().execute<{ id: string; label: string }>(sql`SELECT id, label FROM specialties WHERE active ORDER BY sort_order, label`);
  return res.rows;
}

/** Name search for the author picker. Includes unpublished practitioners (staff view) but labels their status. */
export async function searchPractitionerOptions(q: string): Promise<PractitionerOption[]> {
  const term = q.trim();
  if (term.length < 2) return [];
  const res = await db().execute<{ id: string; display_name: string; listing_status: string; where: string | null }>(sql`
    SELECT p.id, p.display_name, p.listing_status::text AS listing_status,
      (SELECT ci.name FROM practitioner_branches pb JOIN branches b ON b.id = pb.branch_id JOIN cities ci ON ci.id = b.city_id
        WHERE pb.practitioner_id = p.id AND pb.active_to IS NULL ORDER BY pb.active_from LIMIT 1) AS where
    FROM practitioners p
    WHERE p.display_name ILIKE ${"%" + term + "%"} OR lower(p.display_name) % lower(${term})
    ORDER BY similarity(lower(p.display_name), lower(${term})) DESC, p.display_name
    LIMIT 10
  `);
  return res.rows.map((r) => ({ id: r.id, displayName: r.display_name, where: r.where, listingStatus: r.listing_status }));
}
