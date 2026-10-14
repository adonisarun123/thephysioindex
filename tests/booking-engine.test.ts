import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api";
import { closeFixtures, istDate, istInstant, key, makePatientUser, makePractitioner, q, TEST_DB, useTestDatabase, type Fixture } from "./helpers/booking-fixture";

/**
 * Booking engine integration tests against a real PostgreSQL database
 * (exclusion constraints, row locks, transactions). Includes AT-06.
 * Run with TEST_DATABASE_URL set; skipped otherwise.
 */

useTestDatabase();
const engine = await import("@/lib/booking/engine");

const code = (e: unknown) => (e instanceof ApiError ? e.code : `UNEXPECTED: ${(e as Error)?.message}`);

async function holdAndConfirm(fx: Fixture, user: { userId: string; patientId: string }, startsAt: string) {
  const hold = await engine.createHold({ userId: user.userId }, { offeringId: fx.offeringId, startsAt, patientId: user.patientId, idempotencyKey: key() });
  return engine.confirmBooking({ userId: user.userId }, { holdToken: hold.holdToken, expectedTotalPaise: hold.quote.totalPaise, expectedPolicyVersion: hold.quote.policyVersion, idempotencyKey: key() });
}

describe.skipIf(!TEST_DB)("booking engine on PostgreSQL", () => {
  afterAll(async () => {
    await closeFixtures();
  });

  describe("AT-06: concurrent attempts on one slot", () => {
    let fx: Fixture;
    beforeAll(async () => {
      fx = await makePractitioner();
    });

    it("50 concurrent hold-and-confirm attempts produce exactly one confirmed booking", async () => {
      const users = await Promise.all(Array.from({ length: 50 }, () => makePatientUser()));
      const startsAt = istInstant(istDate(3), "10:00");
      const results = await Promise.allSettled(users.map((u) => holdAndConfirm(fx, u, startsAt)));
      const ok = results.filter((r) => r.status === "fulfilled");
      const failed = results.filter((r): r is PromiseRejectedResult => r.status === "rejected").map((r) => code(r.reason));
      expect(ok).toHaveLength(1);
      expect(new Set(failed)).toEqual(new Set(["SLOT_UNAVAILABLE"]));
      const rows = await q<{ n: string }>(`SELECT count(*) AS n FROM bookings WHERE practitioner_id = $1 AND status = 'confirmed'`, [fx.practitionerId]);
      expect(Number(rows[0].n)).toBe(1);
    });

    it("overlapping starts of a variable-length service never produce overlapping occupied intervals", async () => {
      const users = await Promise.all(Array.from({ length: 30 }, () => makePatientUser()));
      const date = istDate(4);
      const starts = ["11:00", "11:15", "11:30", "11:45", "12:00", "12:15"];
      await Promise.allSettled(users.map((u, i) => holdAndConfirm(fx, u, istInstant(date, starts[i % starts.length]))));
      const overlaps = await q<{ n: string }>(
        `SELECT count(*) AS n FROM reservations a JOIN reservations b ON a.resource_id = b.resource_id AND a.id < b.id
         WHERE a.resource_id = $1 AND a.state IN ('held', 'committed') AND b.state IN ('held', 'committed') AND a.occupied_range && b.occupied_range`,
        [fx.resourceId],
      );
      expect(Number(overlaps[0].n)).toBe(0);
      const booked = await q<{ n: string }>(`SELECT count(*) AS n FROM bookings WHERE practitioner_id = $1 AND starts_at::date >= $2::date AND status = 'confirmed'`, [fx.practitionerId, date]);
      expect(Number(booked[0].n)).toBeGreaterThanOrEqual(2); // e.g. 11:00 and 11:45 fit; 11:15 cannot
    });
  });

  describe("holds, idempotency and expiry", () => {
    let fx: Fixture;
    beforeAll(async () => {
      fx = await makePractitioner({ basePaise: 80000, taxPaise: 14400 });
    });

    it("replays the same result for the same key and rejects a changed request", async () => {
      const u = await makePatientUser();
      const k = key();
      const input = { offeringId: fx.offeringId, startsAt: istInstant(istDate(5), "09:00"), patientId: u.patientId, idempotencyKey: k };
      const a = await engine.createHold({ userId: u.userId }, input);
      const b = await engine.createHold({ userId: u.userId }, input);
      expect(b.reservationId).toBe(a.reservationId);
      expect(a.quote.totalPaise).toBe(94400);
      await expect(engine.createHold({ userId: u.userId }, { ...input, startsAt: istInstant(istDate(5), "09:15") })).rejects.toMatchObject({ code: "CONFLICT" });
    });

    it("an elapsed hold cannot be confirmed and stops blocking the slot", async () => {
      const u = await makePatientUser();
      const startsAt = istInstant(istDate(5), "13:00");
      const hold = await engine.createHold({ userId: u.userId }, { offeringId: fx.offeringId, startsAt, patientId: u.patientId, idempotencyKey: key() });
      await q(`UPDATE reservations SET expires_at = now() - interval '1 second' WHERE id = $1`, [hold.reservationId]);
      await expect(
        engine.confirmBooking({ userId: u.userId }, { holdToken: hold.holdToken, expectedTotalPaise: hold.quote.totalPaise, expectedPolicyVersion: hold.quote.policyVersion, idempotencyKey: key() }),
      ).rejects.toMatchObject({ code: "HOLD_EXPIRED" });
      const other = await makePatientUser();
      await expect(holdAndConfirm(fx, other, startsAt)).resolves.toMatchObject({ status: "confirmed" });
    });

    it("rejects a hold token used by another account", async () => {
      const u = await makePatientUser();
      const thief = await makePatientUser();
      const hold = await engine.createHold({ userId: u.userId }, { offeringId: fx.offeringId, startsAt: istInstant(istDate(5), "15:00"), patientId: u.patientId, idempotencyKey: key() });
      await expect(
        engine.confirmBooking({ userId: thief.userId }, { holdToken: hold.holdToken, expectedTotalPaise: hold.quote.totalPaise, expectedPolicyVersion: hold.quote.policyVersion, idempotencyKey: key() }),
      ).rejects.toMatchObject({ code: "UNAUTHORISED" });
    });

    it("requires the expected price at confirmation", async () => {
      const u = await makePatientUser();
      const hold = await engine.createHold({ userId: u.userId }, { offeringId: fx.offeringId, startsAt: istInstant(istDate(5), "16:00"), patientId: u.patientId, idempotencyKey: key() });
      await expect(
        engine.confirmBooking({ userId: u.userId }, { holdToken: hold.holdToken, expectedTotalPaise: 1, expectedPolicyVersion: hold.quote.policyVersion, idempotencyKey: key() }),
      ).rejects.toMatchObject({ code: "PRICE_CHANGED" });
    });

    it("cannot book for a patient the account has no authority over", async () => {
      const u = await makePatientUser();
      const stranger = await makePatientUser();
      await expect(
        engine.createHold({ userId: u.userId }, { offeringId: fx.offeringId, startsAt: istInstant(istDate(5), "17:00"), patientId: stranger.patientId, idempotencyKey: key() }),
      ).rejects.toMatchObject({ code: "UNAUTHORISED" });
    });

    it("rejects overlapping appointments for the same patient across practitioners", async () => {
      const other = await makePractitioner();
      const u = await makePatientUser();
      const startsAt = istInstant(istDate(6), "10:00");
      await holdAndConfirm(fx, u, startsAt);
      await expect(holdAndConfirm(other, u, istInstant(istDate(6), "10:15"))).rejects.toMatchObject({ code: "CONFLICT" });
    });

    it("refuses a slot outside published hours or inside the notice period", async () => {
      const u = await makePatientUser();
      await q(`UPDATE offering_versions SET min_notice_min = 2880 WHERE id = $1`, [fx.offeringVersionId]);
      try {
        await expect(
          engine.createHold({ userId: u.userId }, { offeringId: fx.offeringId, startsAt: istInstant(istDate(1), "10:00"), patientId: u.patientId, idempotencyKey: key() }),
        ).rejects.toMatchObject({ code: "SLOT_UNAVAILABLE" });
      } finally {
        await q(`UPDATE offering_versions SET min_notice_min = 0 WHERE id = $1`, [fx.offeringVersionId]);
      }
      await expect(
        engine.createHold({ userId: u.userId }, { offeringId: fx.offeringId, startsAt: istInstant(istDate(5), "10:07"), patientId: u.patientId, idempotencyKey: key() }),
      ).rejects.toMatchObject({ code: "SLOT_UNAVAILABLE" });
    });
  });

  describe("cancellation and rescheduling", () => {
    let fx: Fixture;
    beforeAll(async () => {
      fx = await makePractitioner();
    });

    it("cancels before the cutoff and frees the slot", async () => {
      const u = await makePatientUser();
      const startsAt = istInstant(istDate(7), "10:00");
      const b = await holdAndConfirm(fx, u, startsAt);
      const c = await engine.cancelByPatient({ userId: u.userId }, { bookingId: b.bookingId, expectedVersion: 1, idempotencyKey: key() });
      expect(c.status).toBe("patient_cancelled");
      await expect(holdAndConfirm(fx, await makePatientUser(), startsAt)).resolves.toMatchObject({ status: "confirmed" });
    });

    it("after the cutoff, a cancellation becomes a request to the clinic", async () => {
      const u = await makePatientUser();
      const soon = new Date(Date.now() + 3 * 3600_000);
      soon.setUTCMinutes(Math.ceil(soon.getUTCMinutes() / 15) * 15, 0, 0); // grid is 15 minutes from 00:00 IST (offset is a multiple of 15)
      const b = await holdAndConfirm(fx, u, soon.toISOString());
      const c = await engine.cancelByPatient({ userId: u.userId }, { bookingId: b.bookingId, expectedVersion: 1, idempotencyKey: key() });
      expect(c.requested).toBe(true);
      expect(c.status).toBe("confirmed");
      const tasks = await q(`SELECT 1 FROM resolution_tasks WHERE booking_id = $1 AND kind = 'cancellation_request_after_cutoff'`, [b.bookingId]);
      expect(tasks).toHaveLength(1);
    });

    it("uses an expected version so concurrent changes cannot overwrite each other", async () => {
      const u = await makePatientUser();
      const b = await holdAndConfirm(fx, u, istInstant(istDate(7), "12:00"));
      await expect(engine.cancelByPatient({ userId: u.userId }, { bookingId: b.bookingId, expectedVersion: 2, idempotencyKey: key() })).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    });

    it("reschedules atomically and keeps the booking id and reference", async () => {
      const u = await makePatientUser();
      const oldStart = istInstant(istDate(8), "10:00");
      const b = await holdAndConfirm(fx, u, oldStart);
      const r = await engine.rescheduleByPatient({ userId: u.userId }, { bookingId: b.bookingId, expectedVersion: 1, newStartsAt: istInstant(istDate(8), "14:00"), idempotencyKey: key() });
      expect(r.bookingId).toBe(b.bookingId);
      expect(r.reference).toBe(b.reference);
      expect(r.version).toBe(2);
      const revs = await q(`SELECT revision_no FROM booking_revisions WHERE booking_id = $1`, [b.bookingId]);
      expect(revs).toHaveLength(1);
      await expect(holdAndConfirm(fx, await makePatientUser(), oldStart)).resolves.toMatchObject({ status: "confirmed" }); // old slot released
    });

    it("a failed reschedule keeps the original slot (BKG-03)", async () => {
      const u = await makePatientUser();
      const blocker = await makePatientUser();
      const taken = istInstant(istDate(9), "15:00");
      await holdAndConfirm(fx, blocker, taken);
      const b = await holdAndConfirm(fx, u, istInstant(istDate(9), "10:00"));
      await expect(
        engine.rescheduleByPatient({ userId: u.userId }, { bookingId: b.bookingId, expectedVersion: 1, newStartsAt: taken, idempotencyKey: key() }),
      ).rejects.toMatchObject({ code: "SLOT_UNAVAILABLE" });
      const rows = await q<{ status: string; state: string }>(
        `SELECT b.status::text AS status, r.state::text AS state FROM bookings b JOIN reservations r ON r.id = b.reservation_id WHERE b.id = $1`,
        [b.bookingId],
      );
      expect(rows[0]).toEqual({ status: "confirmed", state: "committed" });
    });

    it("provider outcomes respect time: no completion before the appointment ends", async () => {
      const u = await makePatientUser();
      const b = await holdAndConfirm(fx, u, istInstant(istDate(10), "10:00"));
      await expect(
        engine.recordOutcome({ userId: u.userId }, { bookingId: b.bookingId, practitionerId: fx.practitionerId, expectedVersion: 1, outcome: "completed", idempotencyKey: key() }),
      ).rejects.toMatchObject({ code: "CONFLICT" });
    });

    it("manual walk-in entry uses the same overlap guard", async () => {
      const staff = await makePatientUser();
      const startsAt = istInstant(istDate(11), "10:00");
      await engine.createManualBooking({ userId: staff.userId, role: "practitioner" }, { practitionerId: fx.practitionerId, offeringId: fx.offeringId, startsAt, patientName: "TEST Walk In", source: "walk_in", idempotencyKey: key() });
      await expect(
        engine.createManualBooking({ userId: staff.userId, role: "practitioner" }, { practitionerId: fx.practitionerId, offeringId: fx.offeringId, startsAt: istInstant(istDate(11), "10:20"), patientName: "TEST Phone", source: "phone", idempotencyKey: key() }),
      ).rejects.toMatchObject({ code: "SLOT_UNAVAILABLE" });
    });
  });

  describe("offers (OFR-03..OFR-05)", () => {
    it("a capped offer is granted to exactly one of two concurrent patients", async () => {
      const fx = await makePractitioner({ basePaise: 100000 });
      const [offer] = await q<{ id: string }>(
        `INSERT INTO offers (scope_type, practitioner_id, title, state) VALUES ('practitioner', $1, 'TEST launch offer', 'active') RETURNING id`,
        [fx.practitionerId],
      );
      const [ov] = await q<{ id: string }>(
        `INSERT INTO offer_versions (offer_id, version, type, value, starts_at, ends_at, max_discount_paise, total_cap, per_patient_cap, automatic, terms, regular_price_confirmed, moderation_state)
         VALUES ($1, 1, 'percentage', 2050, now() - interval '1 day', now() + interval '30 days', 15000, 1, 1, true, 'TEST terms', true, 'approved') RETURNING id`,
        [offer.id],
      );
      await q(`UPDATE offers SET current_version_id = $1 WHERE id = $2`, [ov.id, offer.id]);
      const a = await makePatientUser();
      const b = await makePatientUser();
      const [ha, hb] = await Promise.all([
        engine.createHold({ userId: a.userId }, { offeringId: fx.offeringId, startsAt: istInstant(istDate(12), "10:00"), patientId: a.patientId, idempotencyKey: key() }),
        engine.createHold({ userId: b.userId }, { offeringId: fx.offeringId, startsAt: istInstant(istDate(12), "11:00"), patientId: b.patientId, idempotencyKey: key() }),
      ]);
      const discounts = [ha.quote.discountPaise, hb.quote.discountPaise].sort();
      expect(discounts).toEqual([0, 15000]); // 20.5% of ₹1,000 = ₹205, capped at ₹150
      // Releasing the discounted hold frees the entitlement for someone else.
      const winner = ha.quote.discountPaise ? { u: a, h: ha } : { u: b, h: hb };
      await engine.releaseHold({ userId: winner.u.userId }, winner.h.holdToken);
      const c = await makePatientUser();
      const hc = await engine.createHold({ userId: c.userId }, { offeringId: fx.offeringId, startsAt: istInstant(istDate(12), "12:00"), patientId: c.patientId, idempotencyKey: key() });
      expect(hc.quote.discountPaise).toBe(15000);
      expect(hc.quote.offer?.explanation).toMatch(/20\.50% off/);
    });
  });
});
