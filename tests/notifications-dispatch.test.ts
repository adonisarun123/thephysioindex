import { randomInt } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { closeFixtures, configureTestDatabase, istDate, istInstant, key, makePatientUser, makePractitioner, q, TEST_DB, type Fixture } from "./helpers/booking-fixture";

/**
 * Notification delivery against PostgreSQL (MSG-01, MSG-02). Providers are the
 * console adapters; failures are injected with spies.
 */

configureTestDatabase();
const engine = await import("@/lib/booking/engine");
const { fanOutBatch, sendBatch } = await import("@/lib/messaging/dispatch");
const { sms } = await import("@/lib/messaging/sms");
const { SendError } = await import("@/lib/messaging/core");

type Row = { id: string; state: string; channel: string; template: string; dedupe_key: string; scheduled_for: Date; aggregate_version: string | null; attempts: number; last_error: string | null };

async function deliveries(bookingId: string): Promise<Row[]> {
  return q<Row>(
    `SELECT d.id, d.state, d.channel, t.event_type AS template, d.dedupe_key, d.scheduled_for, d.aggregate_version, d.attempts, d.last_error
     FROM notification_deliveries d JOIN notification_templates t ON t.id = d.template_id WHERE d.booking_id = $1 ORDER BY d.created_at, d.dedupe_key`,
    [bookingId],
  );
}

async function drainFanOut() {
  while ((await fanOutBatch()) > 0);
}

/** Send everything due, without touching rows that belong to other test files. */
async function sendDue() {
  while ((await sendBatch()) > 0);
}

function mobile(): string {
  return `+919${String(randomInt(100_000_000, 999_999_999))}`;
}

async function verifiedUser(userId: string) {
  await q(`UPDATE users SET mobile = $2, mobile_verified_at = now() WHERE id = $1`, [userId, mobile()]);
}

async function book(fx: Fixture, u: { userId: string; patientId: string }, startsAt: string) {
  const hold = await engine.createHold({ userId: u.userId }, { offeringId: fx.offeringId, startsAt, patientId: u.patientId, idempotencyKey: key() });
  return engine.confirmBooking({ userId: u.userId }, { holdToken: hold.holdToken, expectedTotalPaise: hold.quote.totalPaise, expectedPolicyVersion: hold.quote.policyVersion, idempotencyKey: key() });
}

describe.skipIf(!TEST_DB)("notification dispatch on PostgreSQL", () => {
  let fx: Fixture;
  let ownerId: string;

  beforeAll(async () => {
    fx = await makePractitioner();
    const owner = await makePatientUser(); // any user row works as the practitioner's account
    ownerId = owner.userId;
    await verifiedUser(ownerId);
    await q(`UPDATE practitioners SET owner_user_id = $2 WHERE id = $1`, [fx.practitionerId, ownerId]);
  });

  afterAll(async () => {
    await closeFixtures();
  });

  it("a confirmed booking queues patient and practitioner messages plus both reminders, once", async () => {
    const u = await makePatientUser();
    await verifiedUser(u.userId);
    const b = await book(fx, u, istInstant(istDate(3), "10:00"));
    await drainFanOut();
    await drainFanOut();

    const rows = await deliveries(b.bookingId);
    expect(rows.map((r) => r.template).sort()).toEqual(["booking.confirmed", "booking.confirmed.practitioner", "booking.reminder", "booking.reminder"]);
    const reminders = rows.filter((r) => r.template === "booking.reminder");
    expect(reminders.every((r) => new Date(r.scheduled_for).getTime() > Date.now())).toBe(true);
    expect(reminders.every((r) => Number(r.aggregate_version) === 1)).toBe(true);

    await sendDue();
    const after = await deliveries(b.bookingId);
    expect(after.filter((r) => r.template.startsWith("booking.confirmed")).every((r) => r.state === "sent")).toBe(true);
    expect(after.filter((r) => r.template === "booking.reminder").every((r) => r.state === "queued")).toBe(true);
  });

  it("an appointment 3 hours away gets only the 2-hour reminder", async () => {
    const u = await makePatientUser();
    await verifiedUser(u.userId);
    const soon = new Date(Date.now() + 3 * 3_600_000);
    soon.setUTCMinutes(Math.ceil(soon.getUTCMinutes() / 15) * 15, 0, 0);
    const b = await book(fx, u, soon.toISOString());
    await drainFanOut();
    const reminders = (await deliveries(b.bookingId)).filter((r) => r.template === "booking.reminder");
    expect(reminders.map((r) => r.dedupe_key.split(":")[3])).toEqual(["120"]);
  });

  it("rescheduling retires old reminders and schedules new ones for the new version", async () => {
    const u = await makePatientUser();
    await verifiedUser(u.userId);
    const b = await book(fx, u, istInstant(istDate(6), "09:00"));
    await drainFanOut();
    await engine.rescheduleByPatient({ userId: u.userId }, { bookingId: b.bookingId, expectedVersion: 1, newStartsAt: istInstant(istDate(7), "09:00"), idempotencyKey: key() });
    await drainFanOut();
    const rows = await deliveries(b.bookingId);
    const reminders = rows.filter((r) => r.template === "booking.reminder");
    expect(reminders.filter((r) => Number(r.aggregate_version) === 1).every((r) => r.state === "cancelled")).toBe(true);
    expect(reminders.filter((r) => Number(r.aggregate_version) === 2 && r.state === "queued")).toHaveLength(2);
    expect(rows.some((r) => r.template === "booking.rescheduled")).toBe(true);
    expect(rows.some((r) => r.template === "booking.rescheduled.practitioner")).toBe(true);
  });

  it("a patient cancellation tells both sides and cancels reminders", async () => {
    const u = await makePatientUser();
    await verifiedUser(u.userId);
    const b = await book(fx, u, istInstant(istDate(8), "09:00"));
    await drainFanOut();
    await engine.cancelByPatient({ userId: u.userId }, { bookingId: b.bookingId, expectedVersion: 1, idempotencyKey: key() });
    await drainFanOut();
    const rows = await deliveries(b.bookingId);
    expect(rows.filter((r) => r.template === "booking.reminder").every((r) => r.state === "cancelled")).toBe(true);
    expect(rows.some((r) => r.template === "booking.cancelled")).toBe(true);
    expect(rows.some((r) => r.template === "booking.cancelled.practitioner")).toBe(true);
  });

  it("a due reminder whose booking changed is cancelled instead of sent", async () => {
    const u = await makePatientUser();
    await verifiedUser(u.userId);
    const b = await book(fx, u, istInstant(istDate(9), "09:00"));
    await drainFanOut();
    await sendDue();
    // Simulate a change the fan-out has not caught up with yet.
    await q(`UPDATE bookings SET version = version + 1 WHERE id = $1`, [b.bookingId]);
    await q(`UPDATE notification_deliveries SET scheduled_for = now() - interval '1 second' WHERE booking_id = $1 AND dedupe_key LIKE 'reminder:%'`, [b.bookingId]);
    await sendDue();
    const reminders = (await deliveries(b.bookingId)).filter((r) => r.template === "booking.reminder");
    expect(reminders.every((r) => r.state === "cancelled" && (r.last_error ?? "").startsWith("stale"))).toBe(true);
  });

  it("temporary failures back off; permanent failures go to the operations queue", async () => {
    const u = await makePatientUser();
    await verifiedUser(u.userId);
    const b = await book(fx, u, istInstant(istDate(10), "09:00"));
    await drainFanOut();
    const spy = vi.spyOn(sms(), "sendNotification");

    spy.mockRejectedValue(new Error("ETIMEDOUT"));
    await sendBatch(100);
    let rows = (await deliveries(b.bookingId)).filter((r) => r.template === "booking.confirmed");
    expect(rows[0].state).toBe("failed");
    expect(rows[0].attempts).toBe(1);
    expect(new Date(rows[0].scheduled_for).getTime()).toBeGreaterThan(Date.now());

    spy.mockRejectedValue(new SendError("no DLT template id", true));
    await q(`UPDATE notification_deliveries SET scheduled_for = now() - interval '1 second' WHERE booking_id = $1 AND state = 'failed'`, [b.bookingId]);
    await sendBatch(100);
    rows = (await deliveries(b.bookingId)).filter((r) => r.template === "booking.confirmed");
    expect(rows[0].state).toBe("dead");
    expect(rows[0].last_error).toContain("DLT");
    spy.mockRestore();
  });

  it("walk-ins entered by the practice do not notify the practitioner, and notify_patient=false is honoured", async () => {
    const u = await makePatientUser();
    await verifiedUser(u.userId);
    const b = await book(fx, u, istInstant(istDate(11), "09:00"));
    await q(`UPDATE bookings SET notify_patient = false, source = 'walk_in' WHERE id = $1`, [b.bookingId]);
    await drainFanOut();
    expect(await deliveries(b.bookingId)).toEqual([]);
  });
});
