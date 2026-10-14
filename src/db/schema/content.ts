import { sql } from "drizzle-orm";
import { boolean, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { id, occurredAt, timestamps } from "./_common";
import { users } from "./identity";
import { practitioners } from "./practitioners";
import { specialties } from "./geography";

/**
 * Editorial content: blog posts, condition guides and news (SEO-04). Medical
 * claims are published only after qualified editorial review; the reviewer is
 * named on the page. Content is authored in Markdown in the admin editor.
 */
export const contentKind = pgEnum("content_kind", ["blog", "condition", "news"]);
export const contentStatus = pgEnum("content_status", ["draft", "in_review", "published", "withdrawn", "rejected"]);

export type FaqItem = { question: string; answer: string };
export type SourceRef = { title: string; url: string; publisher?: string; accessedOn?: string };
export type ConditionMeta = {
  alsoKnownAs?: string[];
  symptoms?: string[];
  commonCauses?: string[];
  whenToSeek?: string[];
  physiotherapyHelps?: string[];
  redFlags?: string[];
  bodyArea?: string;
};

export const contentArticles = pgTable(
  "content_articles",
  {
    id: id(),
    kind: contentKind("kind").notNull(),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    dek: text("dek"), // standfirst / meta description
    bodyMarkdown: text("body_markdown").notNull().default(""),
    status: contentStatus("status").notNull().default("draft"),
    authorUserId: uuid("author_user_id").references(() => users.id),
    authorName: text("author_name"),
    authorPractitionerId: uuid("author_practitioner_id").references(() => practitioners.id),
    // Editorial review (SEO-04). "Clinically reviewed" shows only when these are set.
    reviewerName: text("reviewer_name"),
    reviewerCredential: text("reviewer_credential"), // e.g. "MPT, Karnataka council reg. KA/PT/..."
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewerUserId: uuid("reviewer_user_id").references(() => users.id),
    primarySpecialtyId: uuid("primary_specialty_id").references(() => specialties.id),
    tags: text("tags").array(),
    faqs: jsonb("faqs").$type<FaqItem[]>().notNull().default(sql`'[]'::jsonb`),
    sources: jsonb("sources").$type<SourceRef[]>().notNull().default(sql`'[]'::jsonb`),
    condition: jsonb("condition").$type<ConditionMeta>(), // kind = condition
    newsCategory: text("news_category"), // kind = news
    correction: text("correction"),
    correctedAt: timestamp("corrected_at", { withTimezone: true }),
    coverAssetId: uuid("cover_asset_id"),
    coverAlt: text("cover_alt"),
    readingMinutes: integer("reading_minutes"),
    noindex: boolean("noindex").notNull().default(false),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    withdrawnAt: timestamp("withdrawn_at", { withTimezone: true }),
    decisionReason: text("decision_reason"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("content_articles_kind_slug_uq").on(t.kind, t.slug),
    index("content_articles_status_idx").on(t.kind, t.status, t.publishedAt),
    index("content_articles_specialty_idx").on(t.primarySpecialtyId),
  ],
);

/** Append-only revision history; a live article stays up while an edit is in review. */
export const contentRevisions = pgTable(
  "content_revisions",
  {
    id: id(),
    articleId: uuid("article_id").notNull().references(() => contentArticles.id),
    revisionNo: integer("revision_no").notNull(),
    snapshot: jsonb("snapshot").$type<Record<string, unknown>>().notNull(),
    actorUserId: uuid("actor_user_id").references(() => users.id),
    note: text("note"),
    occurredAt: occurredAt(),
  },
  (t) => [uniqueIndex("content_revisions_article_rev_uq").on(t.articleId, t.revisionNo)],
);

/** Explicit per-route indexation overrides with a reason (SEO-02). */
export const seoRouteOverrides = pgTable(
  "seo_route_overrides",
  {
    id: id(),
    path: text("path").notNull(),
    directive: text("directive").notNull(), // force_index | force_noindex
    reason: text("reason").notNull(),
    setByUserId: uuid("set_by_user_id").references(() => users.id),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [uniqueIndex("seo_route_overrides_path_uq").on(t.path)],
);

/** Enquiries to a clinic for unbookable or unclaimed profiles. Not a booking (Section 2). */
export const enquiries = pgTable(
  "enquiries",
  {
    id: id(),
    practitionerId: uuid("practitioner_id").references(() => practitioners.id),
    branchId: uuid("branch_id"),
    requesterUserId: uuid("requester_user_id").references(() => users.id),
    requesterName: text("requester_name").notNull(),
    requesterMobile: text("requester_mobile").notNull(),
    message: text("message"),
    status: text("status").notNull().default("new"), // new | forwarded | contacted | closed
    forwardedAt: timestamp("forwarded_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("enquiries_status_idx").on(t.status, t.createdAt), index("enquiries_practitioner_idx").on(t.practitionerId)],
);

/** Platform-wide daily snapshot for the admin overview (ANA-01, ANA-03). */
export const dailyStats = pgTable(
  "daily_stats",
  {
    day: text("day").primaryKey(), // YYYY-MM-DD, Asia/Kolkata
    values: jsonb("values").$type<Record<string, number>>().notNull(),
    computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
  },
);
