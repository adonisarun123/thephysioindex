import { describe, expect, it } from "vitest";
import { faqPageJsonLd, ldJson, organizationJsonLd, practitionerItemListJsonLd, websiteJsonLd } from "@/lib/seo/jsonld";
import robots from "@/app/robots";

const site = "https://www.thephysioindex.com";

describe("site structured data (SEO-03)", () => {
  it("links WebSite to the Organization and points search at the directory", () => {
    const org = organizationJsonLd(site);
    const web = websiteJsonLd(site);
    expect(web.publisher["@id"]).toBe(org["@id"]);
    expect(web.potentialAction.target.urlTemplate).toBe(`${site}/physiotherapists?q={search_term_string}`);
  });

  it("lists directory results in page order with absolute URLs", () => {
    const list = practitionerItemListJsonLd({
      siteUrl: site,
      pagePath: "/physiotherapists/karnataka/bengaluru",
      name: "Physiotherapists in Bengaluru",
      total: 7,
      items: [
        { path: "/physiotherapist/a-1", displayName: "A" },
        { path: "/physiotherapist/b-2", displayName: "B" },
      ],
    });
    expect(list.numberOfItems).toBe(7);
    expect(list.itemListElement.map((i) => [i.position, i.url])).toEqual([
      [1, `${site}/physiotherapist/a-1`],
      [2, `${site}/physiotherapist/b-2`],
    ]);
  });

  it("emits no FAQPage without questions and escapes script-closing text", () => {
    expect(faqPageJsonLd(`${site}/x`, [])).toBeNull();
    const json = ldJson(faqPageJsonLd(`${site}/x`, [{ question: "Q</script><script>", answer: "A" }]));
    expect(json).not.toContain("</script>");
    expect(JSON.parse(json).mainEntity[0].name).toBe("Q</script><script>");
  });
});

describe("robots.txt", () => {
  it("gives AI crawlers the same rules as everyone else and keeps private routes out", () => {
    const r = robots();
    const rules = Array.isArray(r.rules) ? r.rules : [r.rules];
    expect(rules).toHaveLength(2);
    expect(rules[1].userAgent).toEqual(expect.arrayContaining(["GPTBot", "ClaudeBot", "PerplexityBot", "Google-Extended"]));
    for (const rule of rules) {
      expect(rule.allow).toBe("/");
      expect(rule.disallow).toEqual(expect.arrayContaining(["/workspace", "/admin", "/plan/", "/account"]));
    }
  });
});
