import { describe, expect, it } from "vitest";
import { verificationCategory } from "@/lib/verification";

describe("verification labels (VER-01)", () => {
  it("never treats enrolment or membership as statutory registration", () => {
    expect(verificationCategory([{ type: "enrolment", status: "registration_checked" }])).toBe("enrolment_only");
    expect(verificationCategory([{ type: "association_membership", status: "document_reviewed" }])).toBe("membership_only");
  });
  it("prefers the strongest check and restricts on expiry", () => {
    expect(verificationCategory([{ type: "statutory_registration", status: "registration_checked" }, { type: "enrolment", status: "self_declared" }])).toBe("registration_checked");
    expect(verificationCategory([{ type: "statutory_registration", status: "document_reviewed" }])).toBe("document_reviewed");
    expect(verificationCategory([{ type: "statutory_registration", status: "expired" }, { type: "association_membership", status: "document_reviewed" }])).toBe("restricted");
  });
  it("self-declared is not verified", () => {
    expect(verificationCategory([{ type: "statutory_registration", status: "self_declared" }])).toBe("not_verified");
    expect(verificationCategory([])).toBe("not_verified");
  });
});
