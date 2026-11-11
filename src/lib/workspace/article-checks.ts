/**
 * Publishing checks for articles written by physiotherapists. Pure and
 * dependency-free so the editor (browser) and the server apply the same
 * rules: the editor shows them live, `submitOwnArticle` enforces them.
 * They exist so that what reaches moderation is already shaped for search
 * and answer engines (SEO-01, SEO-04): a specific title, a summary that
 * works as the search snippet, question-style sections and enough substance.
 */

export const ARTICLE_RULES = {
  titleMin: 25,
  titleMax: 70,
  summaryMin: 110,
  summaryMax: 170,
  minWords: 600,
  minSections: 3,
  minFaqs: 2,
  maxFaqs: 6,
  maxSources: 6,
  maxInReview: 3,
} as const;

export type ArticleDraftText = { title: string; summary: string; body: string; faqCount: number };
export type ArticleCheck = { key: string; label: string; ok: boolean; detail: string };

/** Words in the Markdown body, ignoring syntax characters and link targets. */
export function countWords(markdown: string): number {
  const text = markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]*>/g, " ")
    .replace(/[#>*_`~|-]+/g, " ");
  return text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

/** Section headings: lines starting with ## (or #, which the renderer shows as a section heading too). */
export function sectionHeadings(markdown: string): string[] {
  return markdown
    .split(/\r?\n/)
    .map((l) => /^#{1,2}\s+(.+?)\s*#*$/.exec(l)?.[1]?.trim())
    .filter((h): h is string => Boolean(h));
}

const CONTACT = /(?:\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}\b|[\w.+-]+@[\w-]+\.[\w.]+|wa\.me\/|whatsapp/i;
const PROMISE = /\b(100\s?%|guarantee[ds]?|permanent(?:ly)? cure|cure[ds]? (?:in|within)|no\.?\s?1|best physiotherapist)\b/i;

export function checkArticle(d: ArticleDraftText): ArticleCheck[] {
  const R = ARTICLE_RULES;
  const title = d.title.trim();
  const summary = d.summary.trim();
  const words = countWords(d.body);
  const heads = sectionHeadings(d.body);
  const questionHeads = heads.filter((h) => /\?$|^(what|why|how|when|which|who|can|is|are|do|does|should)\b/i.test(h)).length;
  const all = `${title}\n${summary}\n${d.body}`;
  return [
    { key: "title", label: `Title is ${R.titleMin}–${R.titleMax} characters`, ok: title.length >= R.titleMin && title.length <= R.titleMax, detail: `${title.length} characters. Name the problem the way a patient would search for it.` },
    { key: "summary", label: `Summary is ${R.summaryMin}–${R.summaryMax} characters`, ok: summary.length >= R.summaryMin && summary.length <= R.summaryMax, detail: `${summary.length} characters. This is the text shown under the title in Google, so answer the question in it.` },
    { key: "words", label: `At least ${R.minWords} words`, ok: words >= R.minWords, detail: `${words} words.` },
    { key: "sections", label: `At least ${R.minSections} section headings (lines starting with ##)`, ok: heads.length >= R.minSections, detail: `${heads.length} headings.` },
    { key: "questions", label: "At least one heading is a question", ok: questionHeads >= 1, detail: "Headings such as “How long does recovery take?” are what answer engines quote." },
    { key: "faqs", label: `At least ${R.minFaqs} questions and answers`, ok: d.faqCount >= R.minFaqs, detail: `${d.faqCount} added.` },
    { key: "contact", label: "No phone numbers, email addresses or WhatsApp links", ok: !CONTACT.test(all), detail: "Readers reach you through your profile, which is linked from the article." },
    { key: "claims", label: "No guarantees or “best” claims", ok: !PROMISE.test(all), detail: "Words like “guaranteed”, “100%” or “permanent cure” are not published." },
  ];
}

export function failedChecks(d: ArticleDraftText): ArticleCheck[] {
  return checkArticle(d).filter((c) => !c.ok);
}
