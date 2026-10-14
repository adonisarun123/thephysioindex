import { describe, expect, it } from "vitest";
import { buildSlots, type SlotInput } from "@/lib/booking/slots";
import { localToUtcMs, localWeekday } from "@/lib/booking/time";

const DATE = "2026-11-02"; // a Monday
const BRANCH = "b1";
const OTHER = "b2";
const OFFERING = "o1";

function base(over: Partial<SlotInput> = {}): SlotInput {
  return {
    offeringId: OFFERING,
    branchId: BRANCH,
    terms: { offeringVersionId: "v1", durationMin: 30, intervalMin: 15, bufferBeforeMin: 0, bufferAfterMin: 10, minNoticeMin: 0, horizonDays: 60, activeFrom: "2026-01-01", activeTo: null },
    rules: [{ branchId: BRANCH, offeringId: null, weekday: localWeekday(DATE), localStart: "09:00:00", localEnd: "12:00:00", effectiveFrom: "2026-01-01", effectiveTo: null }],
    exceptions: [],
    busy: [],
    now: localToUtcMs("2026-11-01", "08:00"),
    fromDate: DATE,
    toDate: DATE,
    ...over,
  };
}

const times = (input: SlotInput) => buildSlots(input).map((s) => s.localTime);

describe("slot construction (Section 10 worked example)", () => {
  it("permits starts 09:00 through 11:15 for a 30 min service with a 10 min after buffer", () => {
    const t = times(base());
    expect(t[0]).toBe("09:00");
    expect(t.at(-1)).toBe("11:15");
    expect(t).not.toContain("11:30");
    expect(t).toHaveLength(10);
  });

  it("a 10:00 booking blocks the practitioner until 10:40, including at another clinic", () => {
    const occupied = { start: localToUtcMs(DATE, "10:00"), end: localToUtcMs(DATE, "10:40") };
    const t = times(base({ busy: [occupied] }));
    // 09:30 occupies 09:30–10:10 → overlaps; 09:15 occupies 09:15–09:55 → fine.
    expect(t).toContain("09:15");
    expect(t).not.toContain("09:30");
    expect(t).not.toContain("10:00");
    expect(t).not.toContain("10:30");
    expect(t).toContain("10:45"); // touching half-open intervals coexist
  });

  it("buffer before must also fit in the window", () => {
    const t = times(base({ terms: { ...base().terms, bufferBeforeMin: 15 } }));
    expect(t[0]).toBe("09:15");
  });

  it("measures minimum notice from server time", () => {
    const t = times(base({ now: localToUtcMs(DATE, "09:10"), terms: { ...base().terms, minNoticeMin: 120 } }));
    expect(t[0]).toBe("11:15");
  });

  it("respects the booking horizon", () => {
    expect(times(base({ now: localToUtcMs("2026-10-01", "08:00"), terms: { ...base().terms, horizonDays: 7 } }))).toHaveLength(0);
  });

  it("an empty date override means closed, not missing data", () => {
    const override = { kind: "date_override" as const, branchId: BRANCH, startsAt: localToUtcMs(DATE, "00:00"), endsAt: localToUtcMs(DATE, "24:00"), localDate: DATE, replacementWindows: [] };
    expect(times(base({ exceptions: [override] }))).toHaveLength(0);
  });

  it("a date override replaces recurring hours for that date", () => {
    const override = { kind: "date_override" as const, branchId: BRANCH, startsAt: localToUtcMs(DATE, "00:00"), endsAt: localToUtcMs(DATE, "24:00"), localDate: DATE, replacementWindows: [{ branchId: BRANCH, start: "14:00", end: "15:00" }] };
    expect(times(base({ exceptions: [override] }))).toEqual(["14:00", "14:15"]);
  });

  it("leave and manual blocks remove overlapping slots", () => {
    const leave = { kind: "leave" as const, branchId: null, startsAt: localToUtcMs(DATE, "09:00"), endsAt: localToUtcMs(DATE, "11:00"), localDate: null, replacementWindows: null };
    expect(times(base({ exceptions: [leave] }))).toEqual(["11:00", "11:15"]);
  });

  it("extra hours add a window on that date", () => {
    const extra = { kind: "extra_hours" as const, branchId: BRANCH, startsAt: localToUtcMs(DATE, "18:00"), endsAt: localToUtcMs(DATE, "18:45"), localDate: null, replacementWindows: null };
    const t = times(base({ exceptions: [extra] }));
    expect(t).toContain("18:00");
    expect(t).not.toContain("18:15"); // 18:15 + 40 > 18:45
  });

  it("ignores windows at other branches and offering-specific rules for other offerings", () => {
    const rules = [
      { branchId: OTHER, offeringId: null, weekday: localWeekday(DATE), localStart: "09:00", localEnd: "12:00", effectiveFrom: "2026-01-01", effectiveTo: null },
      { branchId: BRANCH, offeringId: "other", weekday: localWeekday(DATE), localStart: "09:00", localEnd: "12:00", effectiveFrom: "2026-01-01", effectiveTo: null },
    ];
    expect(times(base({ rules }))).toHaveLength(0);
  });

  it("does not duplicate starts when two windows overlap", () => {
    const r = base().rules[0];
    const t = times(base({ rules: [r, { ...r, offeringId: OFFERING }] }));
    expect(new Set(t).size).toBe(t.length);
  });

  it("skips dates outside the offering version's active range", () => {
    expect(times(base({ terms: { ...base().terms, activeTo: "2026-11-01" } }))).toHaveLength(0);
  });

  it("returns the patient-facing end without buffers (CAL-08)", () => {
    const s = buildSlots(base())[0];
    expect(s.endsAt - s.startsAt).toBe(30 * 60_000);
    expect(s.occupied.end - s.startsAt).toBe(40 * 60_000);
  });
});
