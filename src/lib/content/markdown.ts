import { Marked, type Tokens } from "marked";
import sanitizeHtml from "sanitize-html";
import { slugify } from "@/lib/slug";

/**
 * Markdown → sanitised HTML for editorial content (SEO-04, SEC-01 spirit).
 * Authors write Markdown in the admin editor; the output is sanitised with an
 * allow-list so no script, inline handler or unknown attribute reaches the
 * page. External links are nofollow + noopener; headings get stable ids for
 * the table of contents.
 */

export type TocEntry = { id: string; text: string; depth: 2 | 3 };

export type RenderedMarkdown = {
  html: string;
  toc: TocEntry[];
  readingMinutes: number;
  excerpt: string;
  wordCount: number;
};

const WORDS_PER_MINUTE = 200;

const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    "h2", "h3", "h4", "p", "br", "hr", "blockquote", "pre", "code",
    "ul", "ol", "li", "strong", "em", "b", "i", "u", "s", "del", "sup", "sub", "mark", "small",
    "a", "img", "figure", "figcaption",
    "table", "thead", "tbody", "tr", "th", "td", "caption",
    "dl", "dt", "dd", "abbr", "cite", "q", "kbd",
  ],
  allowedAttributes: {
    a: ["href", "title", "rel", "target"],
    img: ["src", "alt", "title", "width", "height", "loading"],
    th: ["scope", "colspan", "rowspan"],
    td: ["colspan", "rowspan"],
    h2: ["id"],
    h3: ["id"],
    h4: ["id"],
    abbr: ["title"],
    code: ["class"],
  },
  allowedSchemes: ["http", "https", "mailto", "tel"],
  allowedSchemesByTag: { img: ["https"] },
  allowProtocolRelative: false,
  disallowedTagsMode: "discard",
  transformTags: {
    a: (tagName, attribs) => {
      const href = attribs.href ?? "";
      const internal = href.startsWith("/") || href.startsWith("#") || /^https?:\/\/(www\.)?thephysioindex\.com(\/|$)/i.test(href);
      const next: Record<string, string> = { href };
      if (attribs.title) next.title = attribs.title;
      if (!internal) {
        next.rel = "nofollow noopener noreferrer";
        next.target = "_blank";
      }
      return { tagName, attribs: next };
    },
    img: (tagName, attribs) => ({ tagName, attribs: { ...attribs, loading: "lazy" } }),
  },
};

function stripTags(html: string): string {
  return sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} })
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeEntities(s: string): string {
  return s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

export function renderMarkdown(markdown: string): RenderedMarkdown {
  const toc: TocEntry[] = [];
  const seen = new Map<string, number>();
  const marked = new Marked({ gfm: true, breaks: false });
  marked.use({
    renderer: {
      heading({ tokens, depth }: Tokens.Heading) {
        const inner = this.parser.parseInline(tokens);
        // Authors use # for the page title; the article already renders an h1, so clamp to h2–h4 (SEO-01: one main heading).
        const level = Math.min(4, Math.max(2, depth));
        const text = decodeEntities(stripTags(inner));
        const base = slugify(text) || "section";
        const n = seen.get(base) ?? 0;
        seen.set(base, n + 1);
        const id = n === 0 ? base : `${base}-${n + 1}`;
        if (level === 2 || level === 3) toc.push({ id, text, depth: level });
        return `<h${level} id="${id}">${inner}</h${level}>\n`;
      },
      html() {
        return ""; // raw HTML in Markdown is dropped before sanitising
      },
    },
  });
  const raw = marked.parse(markdown ?? "", { async: false }) as string;
  const html = sanitizeHtml(raw, SANITIZE_OPTIONS);
  const text = decodeEntities(stripTags(html));
  const wordCount = text ? text.split(/\s+/).filter(Boolean).length : 0;
  return {
    html,
    toc,
    readingMinutes: Math.max(1, Math.round(wordCount / WORDS_PER_MINUTE)),
    excerpt: excerptOf(text),
    wordCount,
  };
}

/** Plain-text excerpt cut at a word boundary (≈160 characters for meta descriptions). */
export function excerptOf(text: string, max = 160): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const at = cut.lastIndexOf(" ");
  return `${cut.slice(0, at > 80 ? at : max).trimEnd()}…`;
}

/** Inline-only Markdown (FAQ answers, condition bullets): paragraphs, emphasis and links; no headings or images. */
export function renderInlineMarkdown(markdown: string): string {
  const marked = new Marked({ gfm: true });
  const raw = marked.parse(markdown ?? "", { async: false }) as string;
  return sanitizeHtml(raw, {
    ...SANITIZE_OPTIONS,
    allowedTags: ["p", "br", "ul", "ol", "li", "strong", "em", "b", "i", "a", "code", "sup", "sub"],
  });
}
