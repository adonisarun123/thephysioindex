import { z } from "zod";
import type { ConditionMeta, FaqItem, SourceRef } from "@/db/schema/content";
import { slugify } from "@/lib/slug";

/** Editor input contract (API-04). Parsed from FormData on the server; never trusted from the client. */

export const KIND = z.enum(["blog", "condition", "news"]);
export type Kind = z.infer<typeof KIND>;

export const INTENT = z.enum(["save", "submit", "publish", "reject", "withdraw", "restore", "correct"]);
export type Intent = z.infer<typeof INTENT>;

const line = z.string().trim().max(400);
const lines = z.array(line).max(30);
const optionalText = (max: number) => z.string().trim().max(max).transform((v) => (v === "" ? null : v)).nullable();

export const ArticleInput = z.object({
  title: z.string().trim().min(3, "Title is required (at least 3 characters)").max(160),
  slug: z
    .string()
    .trim()
    .max(160)
    .transform((v) => slugify(v))
    .refine((v) => v.length >= 2, "Slug is required"),
  dek: optionalText(320),
  bodyMarkdown: z.string().max(200_000),
  tags: z.array(z.string().trim().min(1).max(40)).max(12),
  primarySpecialtyId: z.uuid().nullable(),
  coverAlt: optionalText(240),
  noindex: z.boolean(),
  authorName: optionalText(120),
  authorPractitionerId: z.uuid().nullable(),
  reviewerName: optionalText(120),
  reviewerCredential: optionalText(160),
  newsCategory: optionalText(60),
  faqs: z.array(z.object({ question: z.string().trim().min(1).max(300), answer: z.string().trim().min(1).max(4000) })).max(20),
  sources: z.array(z.object({ title: z.string().trim().min(1).max(300), url: z.url("Source URL must be a full http(s) URL"), publisher: z.string().trim().max(160).optional() })).max(30),
  condition: z
    .object({
      alsoKnownAs: lines,
      symptoms: lines,
      commonCauses: lines,
      whenToSeek: lines,
      physiotherapyHelps: lines,
      redFlags: lines,
      bodyArea: z.string().trim().max(120),
    })
    .nullable(),
  decisionReason: optionalText(1000),
  correction: optionalText(2000),
});
export type ArticleInputT = z.infer<typeof ArticleInput>;

function splitLines(v: string | null): string[] {
  return (v ?? "").split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
}
const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v : "";
};
const all = (fd: FormData, k: string) => fd.getAll(k).map((v) => (typeof v === "string" ? v : ""));

/** FormData → ArticleInput shape (before zod). Repeatable rows are parallel arrays. */
export function formToArticleInput(kind: Kind, fd: FormData): unknown {
  const title = str(fd, "title");
  const faqQ = all(fd, "faq_q");
  const faqA = all(fd, "faq_a");
  const faqs: FaqItem[] = faqQ.map((q, i) => ({ question: q, answer: faqA[i] ?? "" })).filter((f) => f.question.trim() || f.answer.trim());
  const srcT = all(fd, "src_title");
  const srcU = all(fd, "src_url");
  const srcP = all(fd, "src_publisher");
  const sources: SourceRef[] = srcT.map((t, i) => ({ title: t, url: srcU[i] ?? "", publisher: srcP[i]?.trim() || undefined })).filter((s) => s.title.trim() || s.url.trim());
  const condition: ConditionMeta | null =
    kind === "condition"
      ? {
          alsoKnownAs: splitLines(str(fd, "cond_also")),
          symptoms: splitLines(str(fd, "cond_symptoms")),
          commonCauses: splitLines(str(fd, "cond_causes")),
          whenToSeek: splitLines(str(fd, "cond_when")),
          physiotherapyHelps: splitLines(str(fd, "cond_helps")),
          redFlags: splitLines(str(fd, "cond_redflags")),
          bodyArea: str(fd, "cond_body_area"),
        }
      : null;
  const emptyToNull = (v: string) => (v.trim() === "" ? null : v);
  return {
    title,
    slug: str(fd, "slug").trim() || title,
    dek: str(fd, "dek"),
    bodyMarkdown: str(fd, "body"),
    tags: str(fd, "tags").split(",").map((t) => t.trim()).filter(Boolean),
    primarySpecialtyId: emptyToNull(str(fd, "primary_specialty_id")),
    coverAlt: str(fd, "cover_alt"),
    noindex: fd.get("noindex") === "on" || fd.get("noindex") === "1",
    authorName: str(fd, "author_name"),
    authorPractitionerId: emptyToNull(str(fd, "author_practitioner_id")),
    reviewerName: str(fd, "reviewer_name"),
    reviewerCredential: str(fd, "reviewer_credential"),
    newsCategory: kind === "news" ? str(fd, "news_category") : "",
    faqs,
    sources,
    condition,
    decisionReason: str(fd, "decision_reason"),
    correction: str(fd, "correction"),
  };
}

export const OverrideInput = z.object({
  path: z.string().trim().min(1).max(300).regex(/^\//, "Path must start with /"),
  directive: z.enum(["force_index", "force_noindex"]),
  reason: z.string().trim().min(5, "Give a reason (at least 5 characters)").max(500),
  expiresAt: z
    .string()
    .trim()
    .transform((v) => (v ? new Date(v) : null))
    .refine((d) => d === null || !Number.isNaN(d.getTime()), "Invalid expiry date")
    .nullable(),
});
