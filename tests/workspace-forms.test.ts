import { describe, expect, it } from "vitest";
import { paiseToRupeesInput, plainText, rows, rupeesToPaise, withQuery } from "@/lib/workspace/forms";
import { validateForSubmission } from "@/lib/workspace/draft";

describe("rupeesToPaise (OFR-02: integer paise, no floats)", () => {
  it("parses whole rupees and paise exactly", () => {
    expect(rupeesToPaise("600")).toBe(60000);
    expect(rupeesToPaise("600.5")).toBe(60050);
    expect(rupeesToPaise("₹1,250.75")).toBe(125075);
    expect(rupeesToPaise("0.01")).toBe(1);
  });
  it("rejects malformed amounts", () => {
    expect(rupeesToPaise("-5")).toBeNull();
    expect(rupeesToPaise("12.345")).toBeNull();
    expect(rupeesToPaise("abc")).toBeNull();
  });
  it("round-trips through the input formatter", () => {
    for (const p of [0, 1, 99, 100, 60050, 125075]) expect(rupeesToPaise(paiseToRupeesInput(p))).toBe(p);
  });
});

describe("rows", () => {
  it("groups indexed fields and drops blank rows", () => {
    const fd = new FormData();
    fd.set("q[0].degree", "BPT");
    fd.set("q[0].institution", "RGUHS");
    fd.set("q[1].degree", "");
    fd.set("q[1].institution", "");
    fd.set("q[2].degree", "MPT");
    fd.set("other", "x");
    expect(rows(fd, "q")).toEqual([{ degree: "BPT", institution: "RGUHS" }, { degree: "MPT" }]);
  });
});

describe("plainText (PRO-10)", () => {
  it("strips tags and control characters", () => {
    expect(plainText("Hello <script>alert(1)</script> world\u0007", 100)).toBe("Hello alert(1) world");
  });
});

describe("withQuery", () => {
  it("appends only defined params", () => {
    expect(withQuery("/workspace", { ok: "Saved", error: undefined })).toBe("/workspace?ok=Saved");
    expect(withQuery("/a?x=1", { ok: "y" })).toBe("/a?x=1&ok=y");
  });
});

describe("validateForSubmission (PRO-03)", () => {
  it("lists every missing mandatory field", () => {
    const gaps = validateForSubmission({}, { credentialCount: 0, branchCount: 0, offeringCount: 0, consents: false });
    expect(gaps.length).toBeGreaterThanOrEqual(8);
  });
  it("passes a complete draft", () => {
    const gaps = validateForSubmission(
      {
        identity: { displayName: "Priya Nair", designation: "Physiotherapist", headline: "", gender: "unset" },
        about: "a".repeat(120),
        qualifications: [{ degree: "BPT", institution: "RGUHS", completionYear: 2015, inProgress: false }],
        specialties: [{ specialtyId: "00000000-0000-4000-8000-000000000001", isPrimary: true }],
        languages: ["00000000-0000-4000-8000-000000000002"],
      },
      { credentialCount: 1, branchCount: 1, offeringCount: 1, consents: true },
    );
    expect(gaps).toEqual([]);
  });
});
