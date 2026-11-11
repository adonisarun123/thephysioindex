import { describe, expect, it } from "vitest";
import { render } from "@/lib/messaging/core";
import { firstNameOf, liveProfileVars, type LiveProfileFacts } from "@/lib/messaging/live-profile";
import { NOTIFICATION_TEMPLATES } from "@/db/seed/master-data";

const base: LiveProfileFacts = {
  displayName: "Dr. Priya Raman",
  profileUrl: "https://www.thephysioindex.com/physiotherapist/priya-raman-abc123",
  workspaceUrl: "https://www.thephysioindex.com/workspace",
  bookingEligible: true,
  clinicOfferings: 1,
  otherOfferings: 0,
  openItems: [],
  percent: 100,
  failingChecks: [],
  optional: [],
};

const template = NOTIFICATION_TEMPLATES.find((t) => t.eventType === "practitioner.live" && t.channel === "email")!;

describe("profile live email (owner request 11 Nov 2026)", () => {
  it("has an email template that renders with every variable", () => {
    expect(template).toBeDefined();
    const text = render(template.body, liveProfileVars(base));
    expect(text).toContain("Hi Priya,");
    expect(text).toContain(base.profileUrl);
    expect(text).toContain("book appointments with you online");
    expect(text).toContain("100% complete. Nothing is pending");
  });

  it("bookable profile: nothing pending, no team section", () => {
    const v = liveProfileVars(base);
    expect(v.pendingList).not.toContain("What we are doing");
  });

  it("clinic physio waiting on the registration check: enquiry-only now, team action listed", () => {
    const v = liveProfileVars({ ...base, bookingEligible: false, failingChecks: ["credential"] });
    expect(v.bookingStatus).toContain("Online booking is not switched on yet");
    expect(v.pendingList).toContain("Nothing is pending on your side");
    expect(v.pendingList).toContain("What we are doing:\n- We are completing the registration check");
  });

  it("lists open checklist items and physio-fixable booking checks with the meter value", () => {
    const v = liveProfileVars({ ...base, bookingEligible: false, percent: 90, openItems: ["Add a clear photo of yourself"], failingChecks: ["contact", "credential"] });
    expect(v.pendingList).toContain("What you still need to do (profile 90% complete):");
    expect(v.pendingList).toContain("- Add a clear photo of yourself");
    expect(v.pendingList).toContain("- Verify your email address or mobile number");
  });

  it("home-visit-only physio: request-based, registration check not presented as a blocker", () => {
    const v = liveProfileVars({ ...base, bookingEligible: false, clinicOfferings: 0, otherOfferings: 2, failingChecks: ["credential"] });
    expect(v.bookingStatus).toContain("Home visits and online sessions are taken as requests");
    expect(v.pendingList).not.toContain("registration check");
  });

  it("optional extras are labelled optional", () => {
    const v = liveProfileVars({ ...base, optional: ["A one-line professional headline", "Your work experience"] });
    expect(v.pendingList).toContain("Optional, but it helps patients choose you:\n- A one-line professional headline");
  });

  it("first name drops titles and survives odd input", () => {
    expect(firstNameOf("Dr Ravi Kumar")).toBe("Ravi");
    expect(firstNameOf("  ")).toBe("there");
  });

  it("booking-enabled email template renders", () => {
    const t = NOTIFICATION_TEMPLATES.find((x) => x.eventType === "profile.booking_enabled" && x.channel === "email")!;
    const text = render(t.body, { firstName: "Priya", profileUrl: base.profileUrl, workspaceUrl: "https://www.thephysioindex.com/workspace/appointments" });
    expect(text).toContain("Online booking is now switched on");
  });
});
