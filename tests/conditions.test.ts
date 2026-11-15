import { describe, expect, it } from "vitest";
import { CONDITIONS } from "@/db/seed/master-data";

/** Conditions treated (PRO-08): the seeded vocabulary must be safe to upsert by slug. */
describe("conditions vocabulary", () => {
  it("has unique, URL-safe slugs and a body area for every condition", () => {
    const slugs = CONDITIONS.map((c) => c.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const c of CONDITIONS) {
      expect(c.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(c.label.length).toBeGreaterThan(2);
      expect(c.bodyArea.length).toBeGreaterThan(2);
    }
  });
});
