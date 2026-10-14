import { describe, expect, it } from "vitest";
import { excerptOf, renderInlineMarkdown, renderMarkdown } from "@/lib/content/markdown";

describe("renderMarkdown (SEO-04, SEC-01 spirit)", () => {
  it("strips scripts, inline handlers and raw HTML", () => {
    const { html } = renderMarkdown('Hello <script>alert(1)</script> <img src="x" onerror="alert(1)"> <a href="javascript:alert(1)">x</a>\n\n<iframe src="https://evil"></iframe>');
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/onerror/i);
    expect(html).not.toMatch(/javascript:/i);
    expect(html).not.toMatch(/<iframe/i);
  });

  it("marks external links nofollow noopener and leaves internal links alone", () => {
    const { html } = renderMarkdown("[ext](https://example.com/x) and [int](/conditions/low-back-pain)");
    expect(html).toContain('href="https://example.com/x"');
    expect(html).toMatch(/rel="nofollow noopener noreferrer"/);
    expect(html).toMatch(/<a href="\/conditions\/low-back-pain">int<\/a>/);
  });

  it("builds a table of contents from h2/h3 with stable ids and clamps h1 to h2", () => {
    const { html, toc } = renderMarkdown("# Title\n\n## First section\n\ntext\n\n### Sub point\n\n## First section\n\n#### Deep");
    expect(html).not.toMatch(/<h1/);
    expect(toc).toEqual([
      { id: "title", text: "Title", depth: 2 },
      { id: "first-section", text: "First section", depth: 2 },
      { id: "sub-point", text: "Sub point", depth: 3 },
      { id: "first-section-2", text: "First section", depth: 2 },
    ]);
    expect(html).toContain('<h2 id="first-section">');
  });

  it("computes reading minutes at 200 wpm and a word-boundary excerpt", () => {
    const words = Array.from({ length: 450 }, (_, i) => `word${i}`).join(" ");
    const r = renderMarkdown(words);
    expect(r.wordCount).toBe(450);
    expect(r.readingMinutes).toBe(2);
    expect(r.excerpt.length).toBeLessThanOrEqual(161);
    expect(r.excerpt.endsWith("…")).toBe(true);
    expect(excerptOf("short text")).toBe("short text");
  });

  it("renders inline markdown without headings or images", () => {
    const html = renderInlineMarkdown("## nope\n\n**bold** ![img](https://x/y.png) [link](https://example.com)");
    expect(html).not.toMatch(/<h2|<img/);
    expect(html).toContain("<strong>bold</strong>");
  });
});
