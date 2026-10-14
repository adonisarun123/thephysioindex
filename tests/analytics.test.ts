import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeFixtures, configureTestDatabase, istDate, istInstant, key, makePatientUser, makePractitioner, q, TEST_DB, type Fixture } from "./helpers/booking-fixture";

/** Analytics (ANA-01..ANA-03, Section 16 metric definitions). */

configureTestDatabase();
process.env.BETTER_AUTH_SECRET ??= "test-secret-for-vitest-only-0123456789";
const an = await import("@/lib/analytics");
const admin = await import("@/lib/admin/analytics");
const engine = await import("@/lib/booking/engine");

describe("analytics privacy helpers (ANA-02)", () => {
  it("skips bots and missing user agents", () => {
    expect(an.isBot(null)).toBe(true);
    expect(an.isBot("Mozilla/5.0 (compatible; Googlebot/2.1)")).toBe(true);
    expect(an.isBot("WhatsApp/2.23")).toBe(true);
    expect(an.isBot("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/604.1")).toBe(false);
  });

  it("pseudonymises account ids with a keyed hash", () => {
    const a = an.pseudonym("11111111-1111-1111-1111-111111111111");
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(a).toBe(an.pseudonym("11111111-1111-1111-1111-111111111111"));
    expect(a).not.toContain("1111-1111");
    expect(an.pseudonym(null)).toBeNull();
  });

  it("buckets result counts instead of storing them", () => {
    expect([0, 3, 12, 40].map(an.resultBucket)).toEqual(["0", "1-5", "6-20", "21+"]);
  });
});

describe.skipIf(!TEST_DB)("analytics on PostgreSQL", () => {
  let fx: Fixture;
  beforeAll(async () => {
    fx = await makePractitioner();
  });
  afterAll(async () => {
    await closeFixtures();
  });

  it("utilisation: open hours minus leave, a closed override day, and booked service time", async () => {
    const day = istDate(20);
    const next = istDate(21);
    let u = await an.utilisation(day, day, fx.practitionerId);
    expect(u.availableMinutes).toBe(1440); // fixture is open 00:00–24:00 every day

    await q(
      `INSERT INTO schedule_exceptions (resource_id, kind, starts_at, ends_at, schedule_version) VALUES ($1, 'leave', $2, $3, 1)`,
      [fx.resourceId, istInstant(day, "09:00"), istInstant(day, "11:00")],
    );
    u = await an.utilisation(day, day, fx.practitionerId);
    expect(u.availableMinutes).toBe(1320);

    await q(
      `INSERT INTO schedule_exceptions (resource_id, branch_id, kind, starts_at, ends_at, local_date, replacement_windows, schedule_version)
       VALUES ($1, NULL, 'date_override', $2, $3, $4, '[]'::jsonb, 1)`,
      [fx.resourceId, istInstant(next, "00:00"), istInstant(next, "23:59"), next],
    );
    expect((await an.utilisation(next, next, fx.practitionerId)).availableMinutes).toBe(0);

    const user = await makePatientUser();
    const hold = await engine.createHold({ userId: user.userId }, { offeringId: fx.offeringId, startsAt: istInstant(day, "14:00"), patientId: user.patientId, idempotencyKey: key() });
    await engine.confirmBooking({ userId: user.userId }, { holdToken: hold.holdToken, expectedTotalPaise: hold.quote.totalPaise, expectedPolicyVersion: hold.quote.policyVersion, idempotencyKey: key() });
    u = await an.utilisation(day, day, fx.practitionerId);
    expect(u.bookedMinutes).toBe(30); // service time only; the 10-minute buffer is not "booked"
    expect(u.ratio).toBeCloseTo(30 / 1320, 6);
  });

  it("funnel counts exclude test practitioners, and the CSV matches the page numbers", async () => {
    const today = istDate(0);
    const before = await admin.loadAnalytics(today, today, "appointment");
    await an.recordEvent("profile_view", { practitionerId: fx.practitionerId }); // test practitioner: excluded
    await an.recordEvent("search", { stateSlug: "karnataka", citySlug: "bengaluru", properties: { hasQuery: false, resultBucket: "0", page: "first" } });
    const after = await admin.loadAnalytics(today, today, "appointment");
    expect(after.funnel.profileViews).toBe(before.funnel.profileViews);
    expect(after.funnel.searches).toBe(before.funnel.searches + 1);

    const csv = admin.analyticsCsv(after, today, today, "appointment");
    expect(csv.split("\n")[0]).toBe("section,metric,value,note");
    expect(csv).toContain(`funnel,searches,${admin.suppress(after.funnel.searches)},`);
    expect(csv).toContain(`utilisation,available_minutes,${after.utilisation.availableMinutes},`);
    expect(csv).not.toMatch(/@|\+91/); // no contact details in an aggregate export
  });

  it("stores no free text in search events", async () => {
    await an.recordEvent("search", { properties: { hasQuery: true, page: "first", resultBucket: "1-5" } });
    const rows = await q<{ properties: Record<string, unknown> }>(`SELECT properties FROM analytics.events WHERE event_type = 'search' ORDER BY occurred_at DESC LIMIT 1`);
    expect(Object.keys(rows[0].properties).sort()).toEqual(["hasQuery", "page", "resultBucket"]);
  });
});
