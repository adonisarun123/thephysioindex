import { describe, expect, it } from "vitest";
import { CONDITIONS } from "@/db/seed/master-data";
import { CONDITION_NOTES } from "@/lib/content/condition-notes";
import { CITY_DEMAND, CONDITION_DEMAND, byCityDemand, byConditionDemand, sitemapPriority } from "@/lib/seo/condition-city-demand";

/** Condition-by-city pages (SEO-01): every condition has its note and research row, and ordering follows the research. */
describe("condition-by-city research data", () => {
  it("covers every condition in the vocabulary, and nothing else", () => {
    const slugs = CONDITIONS.map((c) => c.slug).sort();
    expect(Object.keys(CONDITION_NOTES).sort()).toEqual(slugs);
    expect(Object.keys(CONDITION_DEMAND).sort()).toEqual(slugs);
    for (const note of Object.values(CONDITION_NOTES)) expect(note.length).toBeGreaterThan(40);
  });

  it("orders cities and conditions by measured demand", () => {
    const cities = byCityDemand([{ slug: "gangtok", name: "Gangtok" }, { slug: "kohima", name: "Kohima" }, { slug: "bengaluru", name: "Bengaluru" }, { slug: "aizawl", name: "Aizawl" }]);
    expect(cities.map((c) => c.slug)).toEqual(["bengaluru", "gangtok", "aizawl", "kohima"]);
    const conditions = byConditionDemand([{ slug: "scoliosis", label: "Scoliosis" }, { slug: "plantar-fasciitis", label: "Plantar fasciitis" }, { slug: "sciatica", label: "Sciatica" }, { slug: "knee-pain", label: "Knee pain" }]);
    expect(conditions.map((c) => c.slug)).toEqual(["sciatica", "knee-pain", "plantar-fasciitis", "scoliosis"]);
  });

  it("keeps sitemap priority between 0.3 and 0.8", () => {
    expect(sitemapPriority("sciatica", "bengaluru")).toBe(0.8);
    expect(sitemapPriority("scoliosis", "kohima")).toBe(0.3);
    expect(sitemapPriority("heel-pain", "chennai")).toBe(0.6);
    for (const v of Object.values(CITY_DEMAND)) expect(v).toBeGreaterThan(0);
  });
});
