import { randomInt } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { closeFixtures, configureTestDatabase, istDate, istInstant, key, makePatientUser, makePractitioner, q, TEST_DB, type Fixture } from "./helpers/booking-fixture";

/** WhatsApp channel (addendum WAP-01..03): channel choice, positional template params, console provider. */

configureTestDatabase();
const engine = await import("@/lib/booking/engine");
const { contactChannels, fanOutBatch, sendBatch } = await import("@/lib/messaging/dispatch");
const { whatsapp } = await import("@/lib/messaging/whatsapp");

const base = { mobile: "+919812345678", email: "a@example.com", sms_ok: null, email_ok: null, wa_ok: null, wa_enabled: null };

describe("channel choice (pure)", () => {
  it("uses SMS and email by default", () => {
    expect(contactChannels(base)).toEqual(["sms", "email"]);
  });
  it("needs the flag and the opt-in, then replaces SMS", () => {
    expect(contactChannels({ ...base, wa_ok: true })).toEqual(["sms", "email"]);
    expect(contactChannels({ ...base, wa_enabled: true })).toEqual(["sms", "email"]);
    expect(contactChannels({ ...base, wa_enabled: true, wa_ok: true })).toEqual(["whatsapp", "email"]);
  });
  it("never uses WhatsApp without a verified mobile, and respects SMS opt-out", () => {
    expect(contactChannels({ ...base, mobile: null, wa_enabled: true, wa_ok: true })).toEqual(["email"]);
    expect(contactChannels({ ...base, sms_ok: false })).toEqual(["email"]);
    expect(contactChannels({ ...base, sms_ok: false, wa_enabled: true, wa_ok: true })).toEqual(["whatsapp", "email"]);
  });
});

describe.skipIf(!TEST_DB)("WhatsApp delivery on PostgreSQL", () => {
  let fx: Fixture;
  beforeAll(async () => {
    fx = await makePractitioner();
    await q(`UPDATE feature_flags SET enabled = true WHERE key = 'messaging.whatsapp'`);
  });
  afterAll(async () => {
    await q(`UPDATE feature_flags SET enabled = false WHERE key = 'messaging.whatsapp'`);
    await closeFixtures();
  });

  it("an opted-in patient gets the confirmation on WhatsApp with ordered params, not SMS", async () => {
    const u = await makePatientUser();
    await q(`UPDATE users SET mobile = $2, mobile_verified_at = now() WHERE id = $1`, [u.userId, `+919${randomInt(100_000_000, 999_999_999)}`]);
    await q(`INSERT INTO notification_preferences (user_id, whatsapp_opt_in) VALUES ($1, true) ON CONFLICT (user_id) DO UPDATE SET whatsapp_opt_in = true`, [u.userId]);
    const hold = await engine.createHold({ userId: u.userId }, { offeringId: fx.offeringId, startsAt: istInstant(istDate(4), "11:00"), patientId: u.patientId, idempotencyKey: key() });
    const b = await engine.confirmBooking({ userId: u.userId }, { holdToken: hold.holdToken, expectedTotalPaise: hold.quote.totalPaise, expectedPolicyVersion: hold.quote.policyVersion, idempotencyKey: key() });
    while ((await fanOutBatch()) > 0);
    const channels = await q<{ channel: string; template: string }>(
      `SELECT d.channel, t.event_type AS template FROM notification_deliveries d JOIN notification_templates t ON t.id = d.template_id
       WHERE d.booking_id = $1 AND d.recipient_type = 'user' AND d.recipient_id = $2`, [b.bookingId, u.userId]);
    expect(channels.filter((c) => c.template === "booking.confirmed").map((c) => c.channel).sort()).toEqual(["whatsapp"]);

    const spy = vi.spyOn(whatsapp(), "sendTemplate");
    while ((await sendBatch()) > 0);
    const call = spy.mock.calls.find((c) => c[1].text.includes(b.reference) && c[1].text.includes("confirmed"));
    expect(call).toBeDefined();
    const [, msg] = call!;
    expect(msg.params.length).toBe(5); // reference, localDateTime, clinicName, locality, manageUrl
    expect(msg.params[0]).toBe(b.reference);
    const [row] = await q<{ state: string }>(`SELECT d.state FROM notification_deliveries d JOIN notification_templates t ON t.id = d.template_id WHERE d.booking_id = $1 AND d.channel = 'whatsapp' AND t.event_type = 'booking.confirmed'`, [b.bookingId]);
    expect(row.state).toBe("sent");
  });
});
