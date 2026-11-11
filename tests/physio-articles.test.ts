import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api";
import { ARTICLE_RULES, checkArticle, countWords, failedChecks, sectionHeadings } from "@/lib/workspace/article-checks";
import { closeFixtures, configureTestDatabase, makePractitioner, q, TEST_DB, type Fixture } from "./helpers/booking-fixture";

/**
 * Articles written by physiotherapists (SEO-04, IAM-01): the publishing
 * checks, author scoping, and the rule that only staff can make one public.
 */

configureTestDatabase();
const articles = await import("@/lib/workspace/articles");
const code = (e: unknown) => (e instanceof ApiError ? e.code : `UNEXPECTED: ${(e as Error)?.message}`);

const para = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(" ");
const goodBody = `## What is frozen shoulder?\n\n${para(220)}\n\n## How long does recovery take?\n\n${para(220)}\n\n## Exercises that help\n\n${para(220)}\n`;
const good = {
  title: "Frozen shoulder: how long does recovery take?",
  summary: "Frozen shoulder usually improves over one to three years. Physiotherapy helps control pain early and restore movement later on.",
  body: goodBody,
  audience: "patients" as const,
  primarySpecialtyId: null,
  faqs: [
    { question: "Is frozen shoulder permanent?", answer: "No. Most people regain useful movement, although it can take many months." },
    { question: "Should I rest my shoulder?", answer: "Gentle movement within comfort is usually advised rather than complete rest." },
  ],
  sources: [{ title: "NICE CKS: Shoulder pain", url: "https://cks.nice.org.uk/topics/shoulder-pain/" }],
};

describe("publishing checks (pure)", () => {
  it("counts words without Markdown syntax or link targets", () => {
    expect(countWords("## Heading here\n\nSome **bold** text with a [link](https://example.com/a-b-c).")).toBe(8);
  });
  it("finds section headings", () => {
    expect(sectionHeadings("# One\ntext\n## Two ##\n### Three\n##NoSpace")).toEqual(["One", "Two"]);
  });
  it("passes a well-formed article", () => {
    expect(failedChecks({ title: good.title, summary: good.summary, body: good.body, faqCount: 2 })).toEqual([]);
  });
  it("flags thin text, missing questions, contact details and guarantees", () => {
    const keys = (d: Parameters<typeof checkArticle>[0]) => failedChecks(d).map((c) => c.key);
    expect(keys({ title: "Knee", summary: "Short", body: "## A\n\nfew words", faqCount: 0 })).toEqual(["title", "summary", "words", "sections", "questions", "faqs"]);
    expect(keys({ ...{ title: good.title, summary: good.summary, faqCount: 2 }, body: `${goodBody}\nCall 98450 12345 today` })).toEqual(["contact"]);
    expect(keys({ ...{ title: good.title, summary: good.summary, faqCount: 2 }, body: `${goodBody}\n100% guaranteed relief` })).toEqual(["claims"]);
    expect(ARTICLE_RULES.minWords).toBe(600);
  });
});

describe.skipIf(!TEST_DB)("practitioner articles (database)", () => {
  let a: Fixture;
  let b: Fixture;
  let userId: string;
  const ctx = (f: Fixture, listingStatus = "published") => ({ practitionerId: f.practitionerId, practitionerPublicId: "tstpubid", practitionerName: "TEST Engine Physio", listingStatus, userId });

  beforeAll(async () => {
    a = await makePractitioner();
    b = await makePractitioner();
    const [u] = await q<{ id: string }>(`INSERT INTO users (auth_subject, display_name, is_test_account) VALUES ('test-author-' || gen_random_uuid(), 'TEST Article Author', true) RETURNING id`);
    userId = u.id;
  });
  afterAll(async () => {
    await closeFixtures();
  });

  it("saves a draft that is not public and belongs to its author only", async () => {
    const { id, status } = await articles.saveOwnArticle(ctx(a), null, { ...good, title: "Draft only", summary: "", body: "short" }, { submit: false, declared: false });
    expect(status).toBe("draft");
    expect(await articles.getOwnArticle(a.practitionerId, id)).toMatchObject({ status: "draft", audience: "patients" });
    expect(await articles.getOwnArticle(b.practitionerId, id)).toBeNull();
    await expect(articles.saveOwnArticle(ctx(b), id, good, { submit: false, declared: false })).rejects.toSatisfy((e) => code(e) === "NOT_FOUND");
  });

  it("refuses to send for review without a published profile, the declaration or passing checks", async () => {
    await expect(articles.saveOwnArticle(ctx(a, "submitted"), null, good, { submit: true, declared: true })).rejects.toSatisfy((e) => code(e) === "CONFLICT");
    await expect(articles.saveOwnArticle(ctx(a), null, good, { submit: true, declared: false })).rejects.toSatisfy((e) => code(e) === "INVALID_INPUT");
    await expect(articles.saveOwnArticle(ctx(a), null, { ...good, body: "## Thin\n\ntoo short" }, { submit: true, declared: true })).rejects.toSatisfy((e) => code(e) === "INVALID_INPUT");
  });

  it("sends a complete article to moderation, locks it, and never publishes it by itself", async () => {
    const { id, status } = await articles.saveOwnArticle(ctx(a), null, good, { submit: true, declared: true });
    expect(status).toBe("in_review");
    const [row] = await q<{ status: string; kind: string; tags: string[]; author_practitioner_id: string; published_at: Date | null; slug: string }>(
      `SELECT status::text AS status, kind::text AS kind, tags, author_practitioner_id, published_at, slug FROM content_articles WHERE id = $1`, [id]);
    expect(row).toMatchObject({ status: "in_review", kind: "blog", author_practitioner_id: a.practitionerId, published_at: null });
    expect(row.tags).toEqual(["for-patients", "by-physiotherapists"]);
    expect(row.slug).toMatch(/^frozen-shoulder-how-long-does-recovery-take/);
    await expect(articles.saveOwnArticle(ctx(a), id, good, { submit: false, declared: false })).rejects.toSatisfy((e) => code(e) === "CONFLICT");
    const [rev] = await q<{ n: string }>(`SELECT count(*) AS n FROM content_revisions WHERE article_id = $1`, [id]);
    expect(Number(rev.n)).toBe(1);

    // Same title from another author gets its own address.
    const second = await articles.saveOwnArticle(ctx(b), null, good, { submit: true, declared: true });
    const [other] = await q<{ slug: string }>(`SELECT slug FROM content_articles WHERE id = $1`, [second.id]);
    expect(other.slug).not.toBe(row.slug);

    // Staff publish (simulated); the author can then take it down but not edit it in place.
    await q(`UPDATE content_articles SET status = 'published', published_at = now() WHERE id = $1`, [id]);
    const { listPublishedByPractitioner } = await import("@/lib/content/public");
    expect((await listPublishedByPractitioner(a.practitionerId)).map((x) => x.id)).toEqual([id]);
    await expect(articles.saveOwnArticle(ctx(a), id, good, { submit: false, declared: false })).rejects.toSatisfy((e) => code(e) === "CONFLICT");
    expect(await articles.withdrawOwnArticle(ctx(a), id)).toMatchObject({ wasPublished: true });
    expect(await listPublishedByPractitioner(a.practitionerId)).toEqual([]);
    // Editing after take-down keeps the public address.
    await articles.saveOwnArticle(ctx(a), id, { ...good, title: "A completely different title for the same piece" }, { submit: false, declared: false });
    const [after] = await q<{ slug: string; status: string }>(`SELECT slug, status::text AS status FROM content_articles WHERE id = $1`, [id]);
    expect(after).toEqual({ slug: row.slug, status: "draft" });
  });

  it("discards a never-published draft from the author's list", async () => {
    const { id } = await articles.saveOwnArticle(ctx(b), null, { ...good, title: "To be discarded" }, { submit: false, declared: false });
    await articles.discardOwnDraft(ctx(b), id);
    expect((await articles.listOwnArticles(b.practitionerId)).some((x) => x.id === id)).toBe(false);
  });
});
