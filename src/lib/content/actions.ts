"use server";

import { sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ZodError } from "zod";
import { db, withTransaction } from "@/db/client";
import { ApiError } from "@/lib/api";
import { audit } from "@/lib/audit";
import { apiStaff, type Viewer } from "@/lib/auth/session";
import { renderMarkdown } from "./markdown";
import { KIND_PATH } from "./public";
import { CONTENT_EDITOR_ROLE, searchPractitionerOptions, type ContentStatus, type PractitionerOption } from "./admin";
import { ArticleInput, INTENT, KIND, type ArticleInputT, type Intent, type Kind, formToArticleInput } from "./schemas";
import { textArray } from "@/lib/sql";

/**
 * Editorial server actions (SEO-04, IAM-01, Section 22). Every action
 * re-checks staff authorisation on the server, validates input with zod,
 * writes an append-only revision snapshot and an audit event, and
 * revalidates the public routes it affects. The database is authoritative.
 */

export type EditorState = { ok: boolean; message: string | null; fieldErrors?: Record<string, string> };

const EDITORIAL_FIELDS = ["title", "dek", "bodyMarkdown", "faqs", "condition"] as const;

function describeZod(err: ZodError): EditorState {
  const fieldErrors: Record<string, string> = {};
  for (const i of err.issues) {
    const k = i.path.map(String).join(".") || "form";
    if (!fieldErrors[k]) fieldErrors[k] = i.message;
  }
  return { ok: false, message: "Please fix the highlighted fields.", fieldErrors };
}

async function slugTaken(kind: Kind, slug: string, excludeId: string | null): Promise<boolean> {
  const res = await db().execute<{ id: string }>(sql`
    SELECT id FROM content_articles WHERE kind = ${kind} AND slug = ${slug} AND (${excludeId}::uuid IS NULL OR id <> ${excludeId}::uuid) LIMIT 1
  `);
  return res.rows.length > 0;
}

function reviewerComplete(i: ArticleInputT) {
  return Boolean(i.reviewerName && i.reviewerCredential);
}

/** Single entry point for the editor form. `intent` comes from the submit button. */
export async function editorAction(kind: Kind, articleId: string | null, _prev: EditorState, formData: FormData): Promise<EditorState> {
  let viewer: Viewer;
  try {
    viewer = await apiStaff(CONTENT_EDITOR_ROLE);
  } catch (e) {
    return { ok: false, message: e instanceof ApiError ? e.message : "Not authorised" };
  }
  const kindParsed = KIND.safeParse(kind);
  const intentParsed = INTENT.safeParse(formData.get("intent") ?? "save");
  if (!kindParsed.success || !intentParsed.success) return { ok: false, message: "Invalid request" };
  const intent: Intent = intentParsed.data;

  const parsed = ArticleInput.safeParse(formToArticleInput(kind, formData));
  if (!parsed.success) return describeZod(parsed.error);
  const input = parsed.data;

  if (await slugTaken(kind, input.slug, articleId)) {
    return { ok: false, message: "That slug is already used by another item of this kind.", fieldErrors: { slug: "Slug must be unique" } };
  }

  // Publication rules (SEO-04): condition pages need a named, credentialed reviewer; others may publish without, and the page says so.
  if (intent === "publish") {
    if (kind === "condition" && !reviewerComplete(input)) {
      return { ok: false, message: "Condition pages cannot be published without a qualified clinical reviewer.", fieldErrors: { reviewerName: "Required for condition pages", reviewerCredential: "Required for condition pages" } };
    }
    if ((input.reviewerName && !input.reviewerCredential) || (!input.reviewerName && input.reviewerCredential)) {
      return { ok: false, message: "Enter both the reviewer's name and credential, or neither.", fieldErrors: { reviewerCredential: "Both fields are required together" } };
    }
  }
  if (intent === "reject" && !input.decisionReason) return { ok: false, message: "A reason is required to reject.", fieldErrors: { decisionReason: "Required" } };
  if (intent === "correct" && (kind !== "news" || !input.correction)) return { ok: false, message: "Enter the correction text.", fieldErrors: { correction: "Required" } };

  const rendered = renderMarkdown(input.bodyMarkdown);
  let newId = articleId;
  let publicPath: string | null = null;

  try {
    await withTransaction(async (_client, tx) => {
      // Load current row (locked) so transitions are validated against the live state, not the form's idea of it.
      const current = articleId
        ? (await tx.execute<Record<string, unknown>>(sql`SELECT * FROM content_articles WHERE id = ${articleId} FOR UPDATE`)).rows[0]
        : null;
      if (articleId && !current) throw new ApiError("NOT_FOUND", "Article not found");
      const prevStatus = (current?.status as ContentStatus | undefined) ?? "draft";

      let nextStatus: ContentStatus = prevStatus;
      const set: Record<string, unknown> = {};
      let clearReviewer = false;
      const editorialChanged = current ? EDITORIAL_FIELDS.some((f) => canon(input[f]) !== canon(normaliseCurrent(current, f))) : true;

      if (intent === "save") {
        if (prevStatus === "rejected") nextStatus = "draft";
        if (prevStatus === "published" && editorialChanged) {
          // Reviewed text no longer matches: drop the attribution; condition pages must go back through review (SEO-04).
          if (kind === "condition") nextStatus = "in_review";
          else {
            clearReviewer = true;
            Object.assign(set, { reviewed_at: null, reviewer_user_id: null });
          }
        }
      } else if (intent === "submit") {
        if (prevStatus === "published") throw new ApiError("CONFLICT", "Already published. Withdraw first to re-review.");
        nextStatus = "in_review";
      } else if (intent === "publish") {
        nextStatus = "published";
        Object.assign(set, {
          published_at: current?.published_at ?? sql`now()`,
          withdrawn_at: null,
          decision_reason: null,
          // A re-publish with unchanged text keeps the original review date; changed text is re-reviewed now.
          reviewed_at: reviewerComplete(input) ? (editorialChanged || !current?.reviewed_at ? sql`now()` : (current.reviewed_at as Date)) : null,
          reviewer_user_id: reviewerComplete(input) ? (editorialChanged || !current?.reviewer_user_id ? viewer.userId : (current.reviewer_user_id as string)) : null,
        });
      } else if (intent === "reject") {
        if (prevStatus !== "in_review") throw new ApiError("CONFLICT", "Only items in review can be rejected.");
        nextStatus = "rejected";
        set.decision_reason = input.decisionReason;
      } else if (intent === "withdraw") {
        if (prevStatus !== "published") throw new ApiError("CONFLICT", "Only published items can be withdrawn.");
        nextStatus = "withdrawn";
        set.withdrawn_at = sql`now()`;
        set.decision_reason = input.decisionReason;
      } else if (intent === "restore") {
        if (prevStatus !== "withdrawn" && prevStatus !== "rejected") throw new ApiError("CONFLICT", "Only withdrawn or rejected items can be restored.");
        nextStatus = "draft";
        Object.assign(set, { decision_reason: null, withdrawn_at: null });
      } else if (intent === "correct") {
        Object.assign(set, { correction: input.correction, corrected_at: sql`now()` });
      }

      // Reviewer fields are stored as typed; the all-or-nothing rule is enforced on read (public.ts) and at publish.
      const reviewerName = clearReviewer ? null : input.reviewerName;
      const reviewerCredential = clearReviewer ? null : input.reviewerCredential;

      const values = {
        kind,
        slug: input.slug,
        title: input.title,
        dek: input.dek,
        body_markdown: input.bodyMarkdown,
        status: nextStatus,
        author_name: input.authorName,
        author_practitioner_id: input.authorPractitionerId,
        reviewer_name: reviewerName,
        reviewer_credential: reviewerCredential,
        primary_specialty_id: input.primarySpecialtyId,
        tags: input.tags,
        faqs: JSON.stringify(input.faqs),
        sources: JSON.stringify(input.sources),
        condition: input.condition ? JSON.stringify(input.condition) : null,
        news_category: kind === "news" ? input.newsCategory : null,
        cover_alt: input.coverAlt,
        reading_minutes: rendered.readingMinutes,
        noindex: input.noindex,
      };

      if (!articleId) {
        if (intent !== "save" && intent !== "submit" && intent !== "publish") throw new ApiError("INVALID_INPUT", "Save the item first.");
        const ins = await tx.execute<{ id: string }>(sql`
          INSERT INTO content_articles (kind, slug, title, dek, body_markdown, status, author_user_id, author_name, author_practitioner_id,
            reviewer_name, reviewer_credential, reviewed_at, reviewer_user_id, primary_specialty_id, tags, faqs, sources, condition, news_category,
            cover_alt, reading_minutes, noindex, published_at)
          VALUES (${kind}, ${values.slug}, ${values.title}, ${values.dek}, ${values.body_markdown}, ${nextStatus}, ${viewer.userId}, ${values.author_name}, ${values.author_practitioner_id},
            ${values.reviewer_name}, ${values.reviewer_credential}, ${intent === "publish" && reviewerComplete(input) ? sql`now()` : null}, ${intent === "publish" && reviewerComplete(input) ? viewer.userId : null},
            ${values.primary_specialty_id}, ${textArray(values.tags)}, ${values.faqs}::jsonb, ${values.sources}::jsonb, ${values.condition}::jsonb, ${values.news_category},
            ${values.cover_alt}, ${values.reading_minutes}, ${values.noindex}, ${intent === "publish" ? sql`now()` : null})
          RETURNING id
        `);
        newId = ins.rows[0].id;
      } else {
        const extra = Object.entries(set).map(([k, v]) => sql`${sql.identifier(k)} = ${v}`);
        await tx.execute(sql`
          UPDATE content_articles SET
            slug = ${values.slug}, title = ${values.title}, dek = ${values.dek}, body_markdown = ${values.body_markdown}, status = ${nextStatus},
            author_name = ${values.author_name}, author_practitioner_id = ${values.author_practitioner_id},
            reviewer_name = ${values.reviewer_name}, reviewer_credential = ${values.reviewer_credential},
            primary_specialty_id = ${values.primary_specialty_id}, tags = ${textArray(values.tags)}, faqs = ${values.faqs}::jsonb, sources = ${values.sources}::jsonb,
            condition = ${values.condition}::jsonb, news_category = ${values.news_category}, cover_alt = ${values.cover_alt},
            reading_minutes = ${values.reading_minutes}, noindex = ${values.noindex}, updated_at = now()
            ${extra.length ? sql`, ${sql.join(extra, sql`, `)}` : sql``}
          WHERE id = ${articleId}
        `);
      }

      // Append-only revision snapshot of the row as written (Section 22).
      await tx.execute(sql`
        INSERT INTO content_revisions (article_id, revision_no, snapshot, actor_user_id, note)
        SELECT a.id, coalesce((SELECT max(revision_no) FROM content_revisions r WHERE r.article_id = a.id), 0) + 1, to_jsonb(a), ${viewer.userId}, ${intent}
        FROM content_articles a WHERE a.id = ${newId}
      `);

      await audit(
        {
          actorUserId: viewer.userId,
          actorRole: viewer.grants.find((g) => g.role === "super_admin")?.role ?? viewer.grants[0]?.role ?? null,
          action: `content.${intent}`,
          objectType: "content_article",
          objectId: newId,
          reason: input.decisionReason ?? (intent === "correct" ? "correction added" : null),
          changedFields: { kind, slug: input.slug, from: prevStatus, to: nextStatus, editorialChanged, reviewer: reviewerComplete(input) },
        },
        tx,
      );
      publicPath = `${KIND_PATH[kind]}/${input.slug}`;
    });
  } catch (e) {
    if (e instanceof ApiError) return { ok: false, message: e.message };
    console.error("[content] editorAction failed", e);
    return { ok: false, message: "Could not save. Please try again." };
  }

  // Public routes affected (SEO-05: purge stale caches promptly).
  revalidatePath(KIND_PATH[kind]);
  if (publicPath) revalidatePath(publicPath);
  revalidatePath(`${KIND_PATH[kind]}/feed.xml`);
  revalidatePath("/sitemaps/content.xml");
  revalidatePath(`/admin/content/${kind}`);
  revalidatePath(`/admin/content/${kind}/${newId}`);
  if (kind === "condition") revalidatePath("/conditions/browse/[letter]", "page");

  if (!articleId) redirect(`/admin/content/${kind}/${newId}?notice=${encodeURIComponent(noticeFor(intent))}`);
  return { ok: true, message: noticeFor(intent) };
}

function noticeFor(intent: Intent) {
  return (
    {
      save: "Saved.",
      submit: "Submitted for review.",
      publish: "Published.",
      reject: "Rejected and returned to the author.",
      withdraw: "Withdrawn from the public site.",
      restore: "Restored to draft.",
      correct: "Correction added.",
    } as Record<Intent, string>
  )[intent];
}

/** Canonical JSON for change detection: sorted keys, empty strings/arrays/nulls dropped. */
function canon(v: unknown): string {
  const strip = (x: unknown): unknown => {
    if (Array.isArray(x)) {
      const a = x.map(strip).filter((i) => i !== undefined);
      return a.length ? a : undefined;
    }
    if (x && typeof x === "object") {
      const o: Record<string, unknown> = {};
      for (const k of Object.keys(x as object).sort()) {
        const val = strip((x as Record<string, unknown>)[k]);
        if (val !== undefined) o[k] = val;
      }
      return Object.keys(o).length ? o : undefined;
    }
    if (x === null || x === undefined || x === "") return undefined;
    return typeof x === "string" ? x.trim() : x;
  };
  return JSON.stringify(strip(v) ?? null);
}

function normaliseCurrent(row: Record<string, unknown>, f: (typeof EDITORIAL_FIELDS)[number]) {
  switch (f) {
    case "title":
      return row.title;
    case "dek":
      return row.dek ?? null;
    case "bodyMarkdown":
      return row.body_markdown;
    case "faqs":
      return row.faqs ?? [];
    case "condition":
      return row.condition ?? null;
  }
}

/** Author picker lookup (staff only). */
export async function searchPractitionersForEditor(q: string): Promise<PractitionerOption[]> {
  await apiStaff(CONTENT_EDITOR_ROLE);
  return searchPractitionerOptions(String(q ?? "").slice(0, 80));
}
