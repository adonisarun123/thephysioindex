import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api";
import { closeFixtures, configureTestDatabase, istDate, istInstant, key, makePatientUser, makePractitioner, q, TEST_DB, type Fixture } from "./helpers/booking-fixture";

/**
 * Reviews against PostgreSQL (REV-01..REV-03): eligibility through the
 * booking relation, moderation, averages from published reviews only,
 * one appeal, withdrawal, moderated provider replies and the invitation.
 */

configureTestDatabase();
process.env.BETTER_AUTH_SECRET ??= "test-secret-for-vitest-only-0123456789";
const engine = await import("@/lib/booking/engine");
const reviews = await import("@/lib/reviews");
const { decideCase } = await import("@/lib/admin/decisions");
const { fanOutBatch, sendBatch } = await import("@/lib/messaging/dispatch");
type Viewer = Parameters<typeof decideCase>[0];

const code = (e: unknown) => (e instanceof ApiError ? e.code : `UNEXPECTED: ${(e as Error)?.message}`);

async function moderator(): Promise<Viewer> {
  const [u] = await q<{ id: string }>(`INSERT INTO users (auth_subject, display_name, is_test_account) VALUES ('test-mod-' || gen_random_uuid(), 'TEST Moderator', true) RETURNING id`);
  return { authUserId: u.id, userId: u.id, name: "TEST Moderator", email: null, mobile: null, mobileVerified: false, kind: "staff", twoFactorEnabled: true, grants: [{ role: "verification_reviewer", scopeType: "global", scopeId: null }], sessionId: "s", sessionCreatedAt: new Date() } as unknown as Viewer;
}

async function bookFor(fx: Fixture, u: { userId: string; patientId: string }, day: number) {
  const hold = await engine.createHold({ userId: u.userId }, { offeringId: fx.offeringId, startsAt: istInstant(istDate(day), "10:00"), patientId: u.patientId, idempotencyKey: key() });
  return engine.confirmBooking({ userId: u.userId }, { holdToken: hold.holdToken, expectedTotalPaise: hold.quote.totalPaise, expectedPolicyVersion: hold.quote.policyVersion, idempotencyKey: key() });
}

/** Move a confirmed booking into the past and record it completed through the engine (emits booking.completed). */
async function complete(fx: Fixture, bookingId: string) {
  await q(`UPDATE bookings SET starts_at = now() - interval '2 hours', ends_at = now() - interval '90 minutes' WHERE id = $1`, [bookingId]);
  const [b] = await q<{ version: number }>(`SELECT version FROM bookings WHERE id = $1`, [bookingId]);
  const staff = await makePatientUser(); // any user row can act as the practice user here
  await engine.recordOutcome({ userId: staff.userId, role: "practitioner" }, { bookingId, practitionerId: fx.practitionerId, expectedVersion: Number(b.version), outcome: "completed", idempotencyKey: key() });
}

async function openCaseFor(subjectId: string): Promise<string> {
  const [c] = await q<{ id: string }>(`SELECT id FROM verification_cases WHERE subject_id = $1 AND state IN ('open','in_review','awaiting_evidence') ORDER BY submitted_at DESC LIMIT 1`, [subjectId]);
  return c.id;
}

async function stats(practitionerId: string) {
  const [p] = await q<{ review_count: number; rating_avg_x100: number | null }>(`SELECT review_count, rating_avg_x100 FROM practitioners WHERE id = $1`, [practitionerId]);
  return { count: Number(p.review_count), avg: p.rating_avg_x100 == null ? null : Number(p.rating_avg_x100) };
}

const valid = (bookingId: string, rating = 4, text?: string) => ({ bookingId, rating, text, displayName: "Asha K.", confirmedNoPrivateData: true as const });

describe.skipIf(!TEST_DB)("reviews on PostgreSQL", () => {
  let fx: Fixture;
  let mod: Viewer;

  beforeAll(async () => {
    fx = await makePractitioner();
    mod = await moderator();
  });

  afterAll(async () => {
    await closeFixtures();
  });

  it("REV-01: only a completed booking can be reviewed, once, by someone with authority over the patient", async () => {
    const u = await makePatientUser();
    const b = await bookFor(fx, u, 2);
    await expect(reviews.submitReview(u.userId, valid(b.bookingId))).rejects.toMatchObject({ code: "CONFLICT" });

    await complete(fx, b.bookingId);
    const stranger = await makePatientUser();
    await expect(reviews.submitReview(stranger.userId, valid(b.bookingId))).rejects.toMatchObject({ code: "NOT_FOUND" });

    const id = await reviews.submitReview(u.userId, valid(b.bookingId, 5, "Explained the exercises clearly and was on time."));
    await expect(reviews.submitReview(u.userId, valid(b.bookingId))).rejects.toMatchObject({ code: "CONFLICT" });
    const [r] = await q<{ state: string }>(`SELECT state FROM reviews WHERE id = $1`, [id]);
    expect(r.state).toBe("pending");
    expect((await stats(fx.practitionerId)).count).toBe(0); // not public until moderated
  });

  it("REV-02: text length is enforced and contact details are flagged for the moderator", async () => {
    const u = await makePatientUser();
    const b = await bookFor(fx, u, 3);
    await complete(fx, b.bookingId);
    await expect(reviews.submitReview(u.userId, valid(b.bookingId, 3, "too short"))).rejects.toMatchObject({ code: "INVALID_INPUT" });
    const id = await reviews.submitReview(u.userId, valid(b.bookingId, 3, "Good session, call me on 98450 12345 for details."));
    const [c] = await q<{ priority: string }>(`SELECT priority::text AS priority FROM verification_cases WHERE subject_id = $1`, [id]);
    expect(c.priority).toBe("high");
  });

  it("REV-03: approval publishes and recalculates; rejection can be appealed once; withdrawal leaves the average", async () => {
    const before = await stats(fx.practitionerId);
    const a = await makePatientUser();
    const ba = await bookFor(fx, a, 4);
    await complete(fx, ba.bookingId);
    const ra = await reviews.submitReview(a.userId, valid(ba.bookingId, 2, "Waited forty minutes past my slot, rushed session."));
    await decideCase(mod, { caseId: await openCaseFor(ra), decision: "approved", reason: "Within guidelines" });
    const mid = await stats(fx.practitionerId);
    expect(mid.count).toBe(before.count + 1);

    const c = await makePatientUser();
    const bc = await bookFor(fx, c, 5);
    await complete(fx, bc.bookingId);
    const rc = await reviews.submitReview(c.userId, valid(bc.bookingId, 1, "This is spam spam spam spam spam spam."));
    await decideCase(mod, { caseId: await openCaseFor(rc), decision: "rejected", reason: "Spam" });
    await reviews.appealReview(c.userId, rc, "It is my honest experience, not spam.");
    const [appealed] = await q<{ state: string }>(`SELECT state FROM reviews WHERE id = $1`, [rc]);
    expect(appealed.state).toBe("appealed");
    await decideCase(mod, { caseId: await openCaseFor(rc), decision: "rejected", reason: "Still spam on second look" });
    await expect(reviews.appealReview(c.userId, rc, "Please look again at this.")).rejects.toMatchObject({ code: "CONFLICT" });
    expect((await stats(fx.practitionerId)).count).toBe(mid.count);

    await reviews.withdrawReview(a.userId, ra);
    expect((await stats(fx.practitionerId)).count).toBe(before.count);
  });

  it("provider replies are moderated and one pending reply blocks another", async () => {
    const u = await makePatientUser();
    const b = await bookFor(fx, u, 6);
    await complete(fx, b.bookingId);
    const rid = await reviews.submitReview(u.userId, valid(b.bookingId, 4, "Helpful advice and a clear home plan."));
    await decideCase(mod, { caseId: await openCaseFor(rid), decision: "approved", reason: "ok" });
    const owner = await makePatientUser();

    await reviews.submitReply(fx.practitionerId, owner.userId, rid, "Thank you for the kind words.");
    await expect(reviews.submitReply(fx.practitionerId, owner.userId, rid, "Second thought")).rejects.toMatchObject({ code: "CONFLICT" });
    const [reply] = await q<{ id: string }>(`SELECT id FROM review_replies WHERE review_id = $1`, [rid]);
    await decideCase(mod, { caseId: await openCaseFor(reply.id), decision: "approved", reason: "ok" });
    const list = await reviews.listPractitionerReviews(fx.practitionerId);
    expect(list.find((r) => r.id === rid)?.reply?.state).toBe("approved");

    const otherFx = await makePractitioner();
    await expect(reviews.submitReply(otherFx.practitionerId, owner.userId, rid, "Not my review")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("completion queues a review invitation, which is dropped if the patient already reviewed", async () => {
    const u = await makePatientUser();
    await q(`UPDATE users SET mobile = '+9197' || lpad((floor(random() * 1e8))::bigint::text, 8, '0'), mobile_verified_at = now() WHERE id = $1`, [u.userId]);
    const b = await bookFor(fx, u, 7);
    await complete(fx, b.bookingId);
    while ((await fanOutBatch()) > 0);
    const [inv] = await q<{ id: string; scheduled_for: Date }>(
      `SELECT d.id, d.scheduled_for FROM notification_deliveries d JOIN notification_templates t ON t.id = d.template_id WHERE d.booking_id = $1 AND t.event_type = 'review.invitation'`,
      [b.bookingId],
    );
    expect(inv).toBeTruthy();
    expect(new Date(inv.scheduled_for).getTime()).toBeGreaterThan(Date.now() + 60 * 60_000);

    await reviews.submitReview(u.userId, valid(b.bookingId, 5));
    await q(`UPDATE notification_deliveries SET scheduled_for = now() - interval '1 second' WHERE id = $1`, [inv.id]);
    while ((await sendBatch(100)) > 0);
    const [after] = await q<{ state: string }>(`SELECT state FROM notification_deliveries WHERE id = $1`, [inv.id]);
    expect(after.state).toBe("cancelled");
  });

  it("suggests a display name without the full surname", () => {
    expect(reviews.suggestedDisplayName("Asha Krishnamurthy")).toBe("Asha K.");
    expect(reviews.suggestedDisplayName("Ravi")).toBe("Ravi");
    expect(code(new ApiError("CONFLICT", "x"))).toBe("CONFLICT");
  });
});
