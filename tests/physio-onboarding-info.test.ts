import { describe, expect, it } from "vitest";
import { KEEP_READY, ONBOARDING_FAQ, TO_GO_LIVE } from "@/lib/content/physio-onboarding";
import { FinishSchema, MAX_SPECIALTIES, mergeSpecialties } from "@/lib/workspace/finish";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

describe("physio onboarding help (PRO-03)", () => {
  it("has a short checklist and unique questions", () => {
    expect(KEEP_READY).toHaveLength(4);
    expect(TO_GO_LIVE.length).toBeGreaterThan(0);
    expect(new Set(ONBOARDING_FAQ.map((f) => f.q)).size).toBe(ONBOARDING_FAQ.length);
  });

  it("merges ticked areas after the primary, without duplicates, within the limit", () => {
    const out = mergeSpecialties([{ specialtyId: id(9), isPrimary: true }], id(1), [id(2), id(1), id(3)]);
    expect(out.map((s) => s.specialtyId)).toEqual([id(1), id(2), id(3), id(9)]);
    expect(out.filter((s) => s.isPrimary).map((s) => s.specialtyId)).toEqual([id(1)]);
    const many = mergeSpecialties([], id(1), Array.from({ length: 20 }, (_, i) => id(i + 2)));
    expect(many).toHaveLength(MAX_SPECIALTIES);
  });

  it("rejects more than seven other areas", () => {
    const tooMany = Array.from({ length: MAX_SPECIALTIES }, (_, i) => id(i + 2));
    expect(FinishSchema.safeParse({ submit: true, primarySpecialtyId: id(1), otherSpecialtyIds: tooMany }).success).toBe(false);
    expect(FinishSchema.safeParse({ submit: true, primarySpecialtyId: id(1), otherSpecialtyIds: tooMany.slice(1) }).success).toBe(true);
  });
});
