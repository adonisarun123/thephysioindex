import { sql } from "drizzle-orm";
import { z } from "zod";
import { db, withTransaction, type Db } from "@/db/client";
import { ApiError } from "@/lib/api";
import { audit } from "@/lib/audit";
import type { FaqItem, SourceRef } from "@/db/schema/content";
import { renderMarkdown } from "@/lib/content/markdown";
import { slugify } from "@/lib/slug";
import { textArray } from "@/lib/sql";
import { ARTICLE_RULES, failedChecks } from "./article-checks";

/**
 * Articles written by physiotherapists from their workspace (SEO-04, IAM-01).
 *
 * They are ordinary `content_articles` rows of kind `blog` with
 * `author_practitioner_id` set, so the existing editorial workflow applies
 * unchanged: a physiotherapist can only save a draft or send it for review;
 * publishing, rejecting and withdrawing stay with staff in Admin → Content →
 * Guides. Nothing a physiotherapist writes is public until a moderator
 * publishes it. Every write is scoped to the practitioner resolved on the
 * server, never to an id from the form.
 */

export const AUDIENCES = { patients: "for-patients", physiotherapists: "for-physiotherapists" } as const;
export type Audience = keyof typeof AUDIENCES;
/** Marks practitioner-written guides so they can be listed and filtered on the public site. */
export const PHYSIO_AUTHOR_TAG = "by-physiotherapists";

export const OwnArticleInput = z.object({
  title: z.string().trim().min(3, "Give the article a title").max(120),
  summary: z.string().trim().max(320),
  body: z.string().max(60_000),
  audience: z.enum(["patients", "physiotherapists"]),
  primarySpecialtyId: z.uuid().nullable(),
  faqs: z.array(z.object({ question: z.string().trim().min(5, "A question is too short").max(200), answer: z.string().trim().min(20, "An answer is too short").max(1200) })).max(ARTICLE_RULES.maxFaqs),
  sources: z.array(z.object({ title: z.string().trim().min(2).max(200), url: z.url("A source link must be a full https:// address") })).max(ARTICLE_RULES.maxSources),
});
export type OwnArticleInputT = z.infer<typeof OwnArticleInput>;

export type OwnArticle = {
  id: string;
  slug: string;
  path: string;
  title: string;
  summary: string;
  body: string;
  audience: Audience;
  primarySpecialtyId: string | null;
  faqs: FaqItem[];
  sources: SourceRef[];
  status: "draft" | "in_review" | "published" | "withdrawn" | "rejected";
  decisionReason: string | null;
  publishedAt: Date | null;
  updatedAt: Date;
};

type Row = {
  id: string;
  slug: string;
  title: string;
  dek: string | null;
  body_markdown: string;
  tags: string[] | null;
  primary_specialty_id: string | null;
  faqs: FaqItem[] | null;
  sources: SourceRef[] | null;
  status: OwnArticle["status"];
  decision_reason: string | null;
  published_at: Date | string | null;
  updated_at: Date | string;
};

const COLUMNS = sql`id, slug, title, dek, body_markdown, tags, primary_specialty_id, faqs, sources, status::text AS status, decision_reason, published_at, updated_at`;

function toOwn(r: Row): OwnArticle {
  return {
    id: r.id,
    slug: r.slug,
    path: `/blog/${r.slug}`,
    title: r.title,
    summary: r.dek ?? "",
    body: r.body_markdown,
    audience: (r.tags ?? []).includes(AUDIENCES.physiotherapists) ? "physiotherapists" : "patients",
    primarySpecialtyId: r.primary_specialty_id,
    faqs: r.faqs ?? [],
    sources: r.sources ?? [],
    status: r.status,
    decisionReason: r.decision_reason,
    publishedAt: r.published_at ? new Date(r.published_at) : null,
    updatedAt: new Date(r.updated_at),
  };
}

export async function listOwnArticles(practitionerId: string): Promise<OwnArticle[]> {
  const res = await db().execute<Row>(sql`
    SELECT ${COLUMNS} FROM content_articles
    WHERE kind = 'blog' AND author_practitioner_id = ${practitionerId}
      AND NOT (status = 'withdrawn' AND published_at IS NULL) -- discarded drafts
    ORDER BY updated_at DESC LIMIT 100`);
  return res.rows.map(toOwn);
}

export async function getOwnArticle(practitionerId: string, articleId: string): Promise<OwnArticle | null> {
  if (!z.uuid().safeParse(articleId).success) return null;
  const res = await db().execute<Row>(sql`
    SELECT ${COLUMNS} FROM content_articles
    WHERE id = ${articleId} AND kind = 'blog' AND author_practitioner_id = ${practitionerId} LIMIT 1`);
  return res.rows[0] ? toOwn(res.rows[0]) : null;
}

/** A physiotherapist can change the text only while it is theirs to change: before review, or after it came back. */
export function canEdit(status: OwnArticle["status"]): boolean {
  return status === "draft" || status === "rejected" || status === "withdrawn";
}

async function uniqueSlug(tx: Db, title: string, publicId: string, excludeId: string | null): Promise<string> {
  const base = slugify(title).slice(0, 90).replace(/-+$/, "") || "article";
  for (const candidate of [base, `${base}-${publicId}`]) {
    const taken = await tx.execute(sql`SELECT 1 FROM content_articles WHERE kind = 'blog' AND slug = ${candidate} AND (${excludeId}::uuid IS NULL OR id <> ${excludeId}::uuid) LIMIT 1`);
    if (!taken.rows.length) return candidate;
  }
  return `${base}-${publicId}-${Date.now().toString(36)}`;
}

async function snapshot(tx: Db, articleId: string, userId: string, note: string) {
  // Append-only revision of the row as written, same as the staff editor (Section 22).
  await tx.execute(sql`
    INSERT INTO content_revisions (article_id, revision_no, snapshot, actor_user_id, note)
    SELECT a.id, coalesce((SELECT max(revision_no) FROM content_revisions r WHERE r.article_id = a.id), 0) + 1, to_jsonb(a), ${userId}, ${note}
    FROM content_articles a WHERE a.id = ${articleId}`);
}

export type SaveContext = { practitionerId: string; practitionerPublicId: string; practitionerName: string; listingStatus: string; userId: string };

/**
 * Save a draft, or save and send it to moderation. Sending requires a
 * published profile (the byline links to it), the author's declaration and
 * every publishing check to pass.
 */
export async function saveOwnArticle(ctx: SaveContext, articleId: string | null, raw: unknown, opts: { submit: boolean; declared: boolean }): Promise<{ id: string; status: OwnArticle["status"] }> {
  const input = OwnArticleInput.parse(raw);
  if (opts.submit) {
    if (ctx.listingStatus !== "published") throw new ApiError("CONFLICT", "Your profile must be approved and published before you can send an article for review. You can keep this as a draft until then.");
    if (!opts.declared) throw new ApiError("INVALID_INPUT", "Tick the declaration to confirm this is your own work and names no patient.");
    const failed = failedChecks({ title: input.title, summary: input.summary, body: input.body, faqCount: input.faqs.length });
    if (failed.length) throw new ApiError("INVALID_INPUT", `Not ready to send yet: ${failed.map((f) => f.label).join("; ")}.`);
  }
  const rendered = renderMarkdown(input.body);
  const tags = [AUDIENCES[input.audience], PHYSIO_AUTHOR_TAG];

  return withTransaction(async (_c, tx) => {
    let id = articleId;
    let prev: OwnArticle["status"] = "draft";
    if (id) {
      const cur = (await tx.execute<{ status: OwnArticle["status"]; published_at: Date | string | null }>(sql`
        SELECT status::text AS status, published_at FROM content_articles
        WHERE id = ${id} AND kind = 'blog' AND author_practitioner_id = ${ctx.practitionerId} FOR UPDATE`)).rows[0];
      if (!cur) throw new ApiError("NOT_FOUND", "Article not found");
      prev = cur.status;
      if (!canEdit(prev)) throw new ApiError("CONFLICT", prev === "in_review" ? "This article is with our team for review and cannot be changed until they respond." : "A published article cannot be edited here. Take it down first, then edit and send it again.");
      // The address stays fixed once the article has been public, so links to it keep working (SEO-05).
      const slug = cur.published_at ? null : await uniqueSlug(tx, input.title, ctx.practitionerPublicId, id);
      await tx.execute(sql`
        UPDATE content_articles SET
          title = ${input.title}, dek = ${input.summary || null}, body_markdown = ${input.body},
          slug = coalesce(${slug}, slug), tags = ${textArray(tags)}, primary_specialty_id = ${input.primarySpecialtyId},
          faqs = ${JSON.stringify(input.faqs)}::jsonb, sources = ${JSON.stringify(input.sources)}::jsonb,
          reading_minutes = ${rendered.readingMinutes}, status = ${opts.submit ? "in_review" : "draft"},
          decision_reason = CASE WHEN ${opts.submit} THEN NULL ELSE decision_reason END,
          -- Changed text is no longer the text a clinician reviewed (SEO-04).
          reviewer_name = NULL, reviewer_credential = NULL, reviewed_at = NULL, reviewer_user_id = NULL,
          author_name = ${ctx.practitionerName}, updated_at = now()
        WHERE id = ${id}`);
    } else {
      const open = await tx.execute<{ n: number | string }>(sql`SELECT count(*) AS n FROM content_articles WHERE kind = 'blog' AND author_practitioner_id = ${ctx.practitionerId} AND status IN ('draft', 'in_review')`);
      if (Number(open.rows[0]?.n ?? 0) >= 20) throw new ApiError("CONFLICT", "You have 20 unfinished articles. Finish or discard some before starting another.");
      const slug = await uniqueSlug(tx, input.title, ctx.practitionerPublicId, null);
      const ins = await tx.execute<{ id: string }>(sql`
        INSERT INTO content_articles (kind, slug, title, dek, body_markdown, status, author_user_id, author_name, author_practitioner_id,
          primary_specialty_id, tags, faqs, sources, reading_minutes)
        VALUES ('blog', ${slug}, ${input.title}, ${input.summary || null}, ${input.body}, ${opts.submit ? "in_review" : "draft"}, ${ctx.userId}, ${ctx.practitionerName}, ${ctx.practitionerId},
          ${input.primarySpecialtyId}, ${textArray(tags)}, ${JSON.stringify(input.faqs)}::jsonb, ${JSON.stringify(input.sources)}::jsonb, ${rendered.readingMinutes})
        RETURNING id`);
      id = ins.rows[0].id;
    }
    if (opts.submit) {
      const waiting = await tx.execute<{ n: number | string }>(sql`SELECT count(*) AS n FROM content_articles WHERE kind = 'blog' AND author_practitioner_id = ${ctx.practitionerId} AND status = 'in_review'`);
      if (Number(waiting.rows[0]?.n ?? 0) > ARTICLE_RULES.maxInReview) throw new ApiError("CONFLICT", `You already have ${ARTICLE_RULES.maxInReview} articles waiting for review. Send this one once they have been answered.`);
    }
    await snapshot(tx, id, ctx.userId, opts.submit ? "submit (practitioner)" : "save (practitioner)");
    await audit(
      {
        actorUserId: ctx.userId,
        actorRole: "practitioner",
        action: opts.submit ? "content.submit" : "content.save",
        objectType: "content_article",
        objectId: id,
        changedFields: { kind: "blog", from: prev, to: opts.submit ? "in_review" : "draft", words: rendered.wordCount, ...(opts.submit ? { authorDeclaration: true } : {}) },
      },
      tx,
    );
    return { id, status: opts.submit ? "in_review" : "draft" };
  });
}

/** The author can take their own published article down, or pull one back out of the review queue. */
export async function withdrawOwnArticle(ctx: Pick<SaveContext, "practitionerId" | "userId">, articleId: string): Promise<{ slug: string; wasPublished: boolean }> {
  return withTransaction(async (_c, tx) => {
    const cur = (await tx.execute<{ status: OwnArticle["status"]; slug: string }>(sql`
      SELECT status::text AS status, slug FROM content_articles
      WHERE id = ${articleId} AND kind = 'blog' AND author_practitioner_id = ${ctx.practitionerId} FOR UPDATE`)).rows[0];
    if (!cur) throw new ApiError("NOT_FOUND", "Article not found");
    if (cur.status !== "published" && cur.status !== "in_review") throw new ApiError("CONFLICT", "Only an article that is published or in review can be taken back.");
    const wasPublished = cur.status === "published";
    await tx.execute(sql`
      UPDATE content_articles SET status = ${wasPublished ? "withdrawn" : "draft"}, withdrawn_at = CASE WHEN ${wasPublished} THEN now() ELSE withdrawn_at END,
        decision_reason = ${wasPublished ? "Taken down by the author" : null}, updated_at = now()
      WHERE id = ${articleId}`);
    await snapshot(tx, articleId, ctx.userId, "withdraw (practitioner)");
    await audit({ actorUserId: ctx.userId, actorRole: "practitioner", action: "content.withdraw", objectType: "content_article", objectId: articleId, changedFields: { from: cur.status, to: wasPublished ? "withdrawn" : "draft" } }, tx);
    return { slug: cur.slug, wasPublished };
  });
}

/**
 * Discard a draft that was never public. Revisions are append-only, so the row
 * is kept as `withdrawn` with no publication date and simply leaves the author's list.
 */
export async function discardOwnDraft(ctx: Pick<SaveContext, "practitionerId" | "userId">, articleId: string): Promise<void> {
  await withTransaction(async (_c, tx) => {
    const cur = (await tx.execute<{ status: string; published_at: Date | string | null }>(sql`
      SELECT status::text AS status, published_at FROM content_articles
      WHERE id = ${articleId} AND kind = 'blog' AND author_practitioner_id = ${ctx.practitionerId} FOR UPDATE`)).rows[0];
    if (!cur) throw new ApiError("NOT_FOUND", "Article not found");
    if ((cur.status !== "draft" && cur.status !== "rejected") || cur.published_at) throw new ApiError("CONFLICT", "Only a draft that was never published can be discarded.");
    await tx.execute(sql`UPDATE content_articles SET status = 'withdrawn', decision_reason = 'Discarded by the author', updated_at = now() WHERE id = ${articleId}`);
    await snapshot(tx, articleId, ctx.userId, "discard (practitioner)");
    await audit({ actorUserId: ctx.userId, actorRole: "practitioner", action: "content.discard_draft", objectType: "content_article", objectId: articleId }, tx);
  });
}

/** FormData → input shape (before zod). Blank question/answer and source rows are dropped. */
export function parseArticleForm(fd: FormData): unknown {
  const s = (k: string) => {
    const v = fd.get(k);
    return typeof v === "string" ? v : "";
  };
  const all = (k: string) => fd.getAll(k).map((v) => (typeof v === "string" ? v.trim() : ""));
  const q = all("faq_q");
  const a = all("faq_a");
  const st = all("src_title");
  const su = all("src_url");
  return {
    title: s("title"),
    summary: s("summary"),
    body: s("body"),
    audience: s("audience") || "patients",
    primarySpecialtyId: s("primarySpecialtyId").trim() || null,
    faqs: q.map((question, i) => ({ question, answer: a[i] ?? "" })).filter((f) => f.question || f.answer),
    sources: st.map((title, i) => ({ title, url: su[i] ?? "" })).filter((x) => x.title || x.url),
  };
}
