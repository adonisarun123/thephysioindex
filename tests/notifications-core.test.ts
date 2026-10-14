import { describe, expect, it } from "vitest";
import { backoffMinutes, classify, dedupeKey, isPermanentStatus, localDateTime, MAX_ATTEMPTS, nextStateAfterFailure, placeholders, reminderTimes, render, SendError } from "@/lib/messaging/core";

describe("notification rules (MSG-01, MSG-02)", () => {
  it("renders placeholders and refuses to send with a missing value", () => {
    expect(render("Appt {{reference}} at {{ clinicName }}", { reference: "TPI-ABC", clinicName: "Hope" })).toBe("Appt TPI-ABC at Hope");
    expect(() => render("Appt {{reference}}", {})).toThrow(SendError);
    try {
      render("{{x}}", { x: "" });
    } catch (e) {
      expect((e as SendError).permanent).toBe(true);
    }
  });

  it("lists placeholders once, in order", () => {
    expect(placeholders("{{a}} {{b}} {{a}}")).toEqual(["a", "b"]);
  });

  it("classifies provider status codes", () => {
    expect(isPermanentStatus(400)).toBe(true);
    expect(isPermanentStatus(401)).toBe(true);
    expect(isPermanentStatus(408)).toBe(false);
    expect(isPermanentStatus(429)).toBe(false);
    expect(isPermanentStatus(500)).toBe(false);
    expect(classify(new Error("socket hang up")).permanent).toBe(false);
  });

  it("backs off, then gives up into the operations queue", () => {
    expect(backoffMinutes(1)).toBe(1);
    expect(backoffMinutes(5)).toBe(180);
    expect(nextStateAfterFailure(1, false)).toEqual({ state: "failed", retryInMinutes: 1 });
    expect(nextStateAfterFailure(MAX_ATTEMPTS, false)).toEqual({ state: "dead", retryInMinutes: null });
    expect(nextStateAfterFailure(1, true)).toEqual({ state: "dead", retryInMinutes: null });
  });

  it("skips reminder windows that have passed", () => {
    const now = new Date("2026-10-14T10:00:00Z");
    const in3h = new Date("2026-10-14T13:00:00Z");
    const times = reminderTimes(in3h, [1440, 120], now);
    expect(times.map((t) => t.offset)).toEqual([120]);
    expect(times[0].at.toISOString()).toBe("2026-10-14T11:00:00.000Z");
    expect(reminderTimes(new Date("2026-10-14T10:04:00Z"), [120], now)).toEqual([]);
  });

  it("keys deliveries by event, recipient, channel and template version", () => {
    expect(dedupeKey({ eventId: "e", recipientType: "user", recipientId: "u", channel: "sms", templateVersion: 2 })).toBe("e:user:u:sms:v2");
  });

  it("formats appointment time in IST", () => {
    expect(localDateTime("2026-10-14T04:30:00Z")).toMatch(/10:00\s?am IST$/i);
  });
});
