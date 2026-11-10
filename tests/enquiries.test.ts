import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import { closeFixtures, configureTestDatabase, makePatientUser, makePractitioner, q, TEST_DB, type Fixture } from "./helpers/booking-fixture";

/** Practitioner enquiry inbox (addendum ENQ-01..04). */

configureTestDatabase();
process.env.BETTER_AUTH_SECRET ??= "test-secret-for-vitest-only-0123456789";
const enq = await import("@/lib/practice/enquiries");
const { fanOutBatch, sendBatch } = await import("@/lib/messaging/dispatch");
const { email } = await import("@/lib/messaging/email");

const code = (e: unknown) => (e instanceof ApiError ? e.code : `UNEXPECTED: ${(e as Error)?.message}`);

describe("helpers (pure)", () => {
  it("builds a wa.me link without the plus sign", () => {
    expect(enq.whatsappChatUrl("+919812345678", "Hi there")).toBe("https://wa.me/919812345678?text=Hi%20there");
  });
  it("uses the first name only", () => {
    expect(enq.firstName("  Priya  Sharma ")).toBe("Priya");
    expect(enq.firstName("")).toBe("a patient");
  });
});

describe.skipIf(!TEST_DB)("enquiry inbox on PostgreSQL", () => {
  let a: Fixture;
  let b: Fixture;
  let ownerId: string;
  let ownerEmail: string;

  async function newEnquiry(practitionerId: string, name = "Priya Sharma"): Promise<string> {
    const [e] = await q<{ id: string }>(
      `INSERT INTO enquiries (practitioner_id, requester_name, requester_mobile, message, status) VALUES ($1, $2, '+919800000001', 'Need home visits for my father', 'new') RETURNING id`,
      [practitionerId, name],
    );
    return e.id;
  }

  beforeAll(async () => {
    a = await makePractitioner();
    b = await makePractitioner();
    const owner = await makePatientUser();
    ownerId = owner.userId;
    ownerEmail = `owner-${Date.now()}@example.com`;
    await q(`UPDATE users SET email = $2, email_verified_at = now() WHERE id = $1`, [ownerId, ownerEmail]);
    await q(`UPDATE practitioners SET owner_user_id = $2 WHERE id = $1`, [a.practitionerId, ownerId]);
  });
  afterAll(async () => {
    await closeFixtures();
  });

  it("lists only the practitioner's enquiries and counts unanswered (ENQ-01, ENQ-03)", async () => {
    const id = await newEnquiry(a.practitionerId);
    await newEnquiry(b.practitionerId, "Other Person");
    const rows = await enq.listInbox(a.practitionerId, "open");
    expect(rows.map((r) => r.id)).toContain(id);
    expect(rows.every((r) => r.requesterName !== "Other Person")).toBe(true);
    expect((await enq.inboxCounts(a.practitionerId)).unanswered).toBeGreaterThanOrEqual(1);
    const err = await enq.updateEnquiry(b.practitionerId, ownerId, { enquiryId: id, action: "contacted" }).catch((e) => e);
    expect(code(err)).toBe("NOT_FOUND");
  });

  it("contacted → follow-up due → closed with outcome → reopen (ENQ-02)", async () => {
    const id = await newEnquiry(a.practitionerId);
    await enq.updateEnquiry(a.practitionerId, ownerId, { enquiryId: id, action: "contacted", note: "Call after 6 pm" });
    let [row] = await q<{ status: string; contacted_at: Date | null; practitioner_note: string }>(`SELECT status, contacted_at, practitioner_note FROM enquiries WHERE id = $1`, [id]);
    expect(row.status).toBe("contacted");
    expect(row.contacted_at).not.toBeNull();
    expect(row.practitioner_note).toBe("Call after 6 pm");

    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
    await enq.updateEnquiry(a.practitionerId, ownerId, { enquiryId: id, action: "follow_up", followUpOn: today });
    expect((await enq.listInbox(a.practitionerId, "due")).some((r) => r.id === id)).toBe(true);
    // Note untouched when not submitted.
    [row] = await q(`SELECT status, contacted_at, practitioner_note FROM enquiries WHERE id = $1`, [id]);
    expect(row.practitioner_note).toBe("Call after 6 pm");

    expect(code(await enq.updateEnquiry(a.practitionerId, ownerId, { enquiryId: id, action: "close" }).catch((e) => e))).toBe("INVALID_INPUT");
    await enq.updateEnquiry(a.practitionerId, ownerId, { enquiryId: id, action: "close", outcome: "booked" });
    const closed = (await enq.listInbox(a.practitionerId, "closed")).find((r) => r.id === id);
    expect(closed?.outcome).toBe("booked");
    expect(closed?.followUpOn).toBeNull();
    expect((await enq.listInbox(a.practitionerId, "due")).some((r) => r.id === id)).toBe(false);

    await enq.updateEnquiry(a.practitionerId, ownerId, { enquiryId: id, action: "reopen" });
    expect((await enq.listInbox(a.practitionerId, "open")).find((r) => r.id === id)?.status).toBe("contacted");
  });

  it("notifies the profile owner by first name only (ENQ-04)", async () => {
    const id = await newEnquiry(a.practitionerId, "Rahul Verma");
    await q(`INSERT INTO outbox_events (aggregate_type, aggregate_id, event_type, payload) VALUES ('enquiry', $1, 'enquiry.created', '{}'::jsonb)`, [id]);
    const unowned = await newEnquiry(b.practitionerId, "Nobody Owner");
    await q(`INSERT INTO outbox_events (aggregate_type, aggregate_id, event_type, payload) VALUES ('enquiry', $1, 'enquiry.created', '{}'::jsonb)`, [unowned]);
    while ((await fanOutBatch()) > 0);
    const queued = await q<{ recipient_id: string; channel: string }>(
      `SELECT d.recipient_id, d.channel FROM notification_deliveries d JOIN outbox_events o ON o.event_id = d.event_id WHERE o.aggregate_id = ANY($1::uuid[])`, [[id, unowned]]);
    expect(queued).toEqual([{ recipient_id: ownerId, channel: "email" }]);

    const spy = vi.spyOn(email(), "send");
    while ((await sendBatch()) > 0);
    const call = spy.mock.calls.find((c) => c[0] === ownerEmail);
    expect(call?.[1]).toBe("New enquiry from Rahul");
    expect(call?.[2]).toContain("/workspace/enquiries");
    expect(call?.[2]).not.toContain("+919800000001");
  });
});
