import { sql } from "drizzle-orm";
import { z } from "zod";
import { db, withTransaction, type Db } from "@/db/client";
import { ApiError } from "@/lib/api";
import { audit } from "@/lib/audit";
import { getConfigMap } from "@/lib/config";
import { openCase } from "@/lib/admin/cases";
import { recalcReviews } from "@/lib/admin/practitioner-ops";

/**
 * Patient reviews and provider replies (Section 17: REV-01..REV-03).
 *
 * - Eligibility is the booking relation: one review per completed booking,
 *   by the account that holds authority over the patient (REV-01).
 * - Every review and reply goes through the review_moderation queue; nothing
 *   is public until a moderator approves it (REV-03). Averages are recalculated
 *   from published reviews only, on every state change.
 * - A rejected review can be appealed once; the appeal reopens moderation.
 */

/** Same authority rule as bookings: own record, or an active guardian link (BKG-16). */
const AUTHORITY = (userId: string) => sql`(
  pt.account_user_id = ${userId}
  OR EXISTS (SELECT 1 FROM guardian_links g WHERE g.patient_id = pt.id AND g.guardian_user_id = ${userId} AND g.revoked_at IS NULL AND g.verification_state <> 'revoked')
)`;

/** Phone numbers and email addresses are flagged for the moderator (REV-02: no other person's private data). */
export function looksLikeContactDetails(text: string): boolean {
  return /[\w.+-]+@[\w-]+\.[\w.]+/.test(text) || /(?:\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}\b/.test(text);
}

/** Suggested public name: first name and last initial, never the full name or contact (REV-02). */
export function suggestedDisplayName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "Patient";
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}

async function textLimits(): Promise<{ min: number; max: number }> {
  const c = await getConfigMap(["reviews.text_min_chars", "reviews.text_max_chars"]);
  return { min: Number(c["reviews.text_min_chars"] ?? 20), max: Number(c["reviews.text_max_chars"] ?? 2000) };
}

export type ReviewForBooking = {
  bookingId: string;
  reference: string;
  practitionerName: string;
  practitionerPath: string;
  status: string;
  patientName: string;
  eligible: boolean;
  ineligibleReason: string | null;
  review: { id: string; rating: number; text: string | null; displayName: string; state: string; moderationReason: string | null; appealed: boolean; reply: string | null } | null;
  limits: { min: number; max: number };
};

export async function getReviewForBooking(userId: string, bookingId: string): Promise<ReviewForBooking | null> {
  const res = await db().execute<{
    id: string;
    reference: string;
    status: string;
    practitioner_name: string;
    practitioner_path: string;
    patient_name: string;
    review_id: string | null;
    rating: number | null;
    text: string | null;
    display_name: string | null;
    state: string | null;
    moderation_reason: string | null;
    appealed: boolean;
    reply: string | null;
  }>(sql`
    SELECT bk.id, bk.reference, bk.status::text AS status, p.display_name AS practitioner_name, '/physiotherapist/' || p.slug || '-' || p.public_id AS practitioner_path,
      pt.display_name AS patient_name, r.id AS review_id, r.rating, r.text, r.display_name, r.state::text AS state, r.moderation_reason,
      EXISTS (SELECT 1 FROM verification_cases vc WHERE vc.subject_type = 'review' AND vc.subject_id = r.id AND vc.evidence ? 'appeal') AS appealed,
      (SELECT rr.text FROM review_replies rr WHERE rr.review_id = r.id AND rr.state = 'approved' ORDER BY rr.version DESC LIMIT 1) AS reply
    FROM bookings bk
    JOIN patients pt ON pt.id = bk.patient_id
    JOIN practitioners p ON p.id = bk.practitioner_id
    LEFT JOIN reviews r ON r.booking_id = bk.id
    WHERE bk.id = ${bookingId} AND ${AUTHORITY(userId)}`);
  const b = res.rows[0];
  if (!b) return null;
  const ineligibleReason = b.review_id ? "already_reviewed" : b.status !== "completed" ? "not_completed" : null;
  return {
    bookingId: b.id,
    reference: b.reference,
    practitionerName: b.practitioner_name,
    practitionerPath: b.practitioner_path,
    status: b.status,
    patientName: b.patient_name,
    eligible: ineligibleReason === null,
    ineligibleReason,
    review: b.review_id
      ? { id: b.review_id, rating: Number(b.rating), text: b.text, displayName: b.display_name ?? "", state: b.state ?? "pending", moderationReason: b.moderation_reason, appealed: b.appealed, reply: b.reply }
      : null,
    limits: await textLimits(),
  };
}

export const ReviewInput = z.object({
  bookingId: z.string().uuid(),
  rating: z.coerce.number().int().min(1, "Choose a rating from 1 to 5").max(5, "Choose a rating from 1 to 5"),
  text: z.string().trim().max(2000).optional(),
  displayName: z.string().trim().min(2, "Enter the name to show").max(40, "Keep the display name under 40 characters"),
  confirmedNoPrivateData: z.literal(true, { message: "Confirm the review has no health records or other people's private details" }),
});

export async function submitReview(userId: string, input: z.infer<typeof ReviewInput>): Promise<string> {
  const { min, max } = await textLimits();
  const text = input.text ? input.text : null;
  if (text !== null && (text.length < min || text.length > max)) throw new ApiError("INVALID_INPUT", `Write between ${min} and ${max} characters, or leave the text empty and just rate`);
  if (/^\d|@|https?:\/\//i.test(input.displayName) || looksLikeContactDetails(input.displayName)) throw new ApiError("INVALID_INPUT", "The display name cannot contain contact details or links");

  return withTransaction(async (_c, tx) => {
    const b = (
      await tx.execute<{ id: string; status: string; patient_id: string; practitioner_id: string; has_review: boolean }>(sql`
        SELECT bk.id, bk.status::text AS status, bk.patient_id, bk.practitioner_id, EXISTS (SELECT 1 FROM reviews r WHERE r.booking_id = bk.id) AS has_review
        FROM bookings bk JOIN patients pt ON pt.id = bk.patient_id
        WHERE bk.id = ${input.bookingId} AND ${AUTHORITY(userId)}
        FOR UPDATE OF bk`)
    ).rows[0];
    if (!b) throw new ApiError("NOT_FOUND", "Appointment not found");
    if (b.status !== "completed") throw new ApiError("CONFLICT", "You can review an appointment once the clinic has marked it completed");
    if (b.has_review) throw new ApiError("CONFLICT", "This appointment already has a review");

    const r = await tx.execute<{ id: string }>(sql`
      INSERT INTO reviews (booking_id, patient_id, practitioner_id, rating, text, display_name, state)
      VALUES (${b.id}, ${b.patient_id}, ${b.practitioner_id}, ${input.rating}, ${text}, ${input.displayName}, 'pending')
      ON CONFLICT (booking_id) DO NOTHING
      RETURNING id`);
    const reviewId = r.rows[0]?.id;
    if (!reviewId) throw new ApiError("CONFLICT", "This appointment already has a review");
    const flagged = text !== null && looksLikeContactDetails(text);
    await openCase(tx, {
      caseType: "review_moderation",
      subjectType: "review",
      subjectId: reviewId,
      practitionerId: b.practitioner_id,
      submittedByUserId: userId,
      priority: flagged ? "high" : "normal",
      evidence: { kind: "review", rating: input.rating, contactDetailsSuspected: flagged },
    });
    await audit({ actorUserId: userId, actorRole: "patient", action: "review.submit", objectType: "review", objectId: reviewId, changedFields: { rating: input.rating } }, tx);
    return reviewId;
  });
}

async function lockOwnReview(tx: Db, userId: string, reviewId: string) {
  const r = (
    await tx.execute<{ id: string; state: string; practitioner_id: string; booking_id: string }>(sql`
      SELECT r.id, r.state::text AS state, r.practitioner_id, r.booking_id
      FROM reviews r JOIN patients pt ON pt.id = r.patient_id
      WHERE r.id = ${reviewId} AND ${AUTHORITY(userId)}
      FOR UPDATE OF r`)
  ).rows[0];
  if (!r) throw new ApiError("NOT_FOUND", "Review not found");
  return r;
}

/** The author can take their review down at any time; it leaves the average immediately. */
export async function withdrawReview(userId: string, reviewId: string): Promise<void> {
  await withTransaction(async (_c, tx) => {
    const r = await lockOwnReview(tx, userId, reviewId);
    if (r.state === "withdrawn") return;
    await tx.execute(sql`UPDATE reviews SET state = 'withdrawn' WHERE id = ${r.id}`);
    // Close any open moderation case for it; there is nothing left to decide.
    await tx.execute(sql`
      UPDATE verification_cases SET state = 'closed', decision = 'dismissed', decision_reason = 'withdrawn by the author', decided_at = now()
      WHERE subject_type = 'review' AND subject_id = ${r.id} AND state IN ('open', 'in_review', 'awaiting_evidence')`);
    await recalcReviews(tx, r.practitioner_id);
    await audit({ actorUserId: userId, actorRole: "patient", action: "review.withdraw", objectType: "review", objectId: r.id, changedFields: { state: { from: r.state, to: "withdrawn" } } }, tx);
  });
}

/** REV-03: one appeal against a rejection, reviewed afresh with the author's explanation. */
export async function appealReview(userId: string, reviewId: string, explanation: string): Promise<void> {
  const why = explanation.trim();
  if (why.length < 10 || why.length > 1000) throw new ApiError("INVALID_INPUT", "Explain the appeal in 10 to 1000 characters");
  await withTransaction(async (_c, tx) => {
    const r = await lockOwnReview(tx, userId, reviewId);
    if (r.state !== "rejected") throw new ApiError("CONFLICT", "Only a rejected review can be appealed");
    const prior = await tx.execute(sql`SELECT 1 FROM verification_cases WHERE subject_type = 'review' AND subject_id = ${r.id} AND evidence ? 'appeal' LIMIT 1`);
    if (prior.rows.length) throw new ApiError("CONFLICT", "This review has already been appealed once");
    await tx.execute(sql`UPDATE reviews SET state = 'appealed' WHERE id = ${r.id}`);
    await openCase(tx, {
      caseType: "review_moderation",
      subjectType: "review",
      subjectId: r.id,
      practitionerId: r.practitioner_id,
      submittedByUserId: userId,
      priority: "high",
      evidence: { kind: "review", appeal: why },
    });
    await audit({ actorUserId: userId, actorRole: "patient", action: "review.appeal", objectType: "review", objectId: r.id }, tx);
  });
}

// ---------------------------------------------------------------- provider side

export type PractitionerReview = {
  id: string;
  rating: number;
  text: string | null;
  displayName: string;
  publishedAt: Date;
  reply: { text: string; state: string; moderationReason: string | null; version: number } | null;
};

/** Published reviews of one practitioner with the latest reply version (any state), for the workspace. */
export async function listPractitionerReviews(practitionerId: string): Promise<PractitionerReview[]> {
  const res = await db().execute<{ id: string; rating: number; text: string | null; display_name: string; published_at: Date; reply_text: string | null; reply_state: string | null; reply_reason: string | null; reply_version: number | null }>(sql`
    SELECT r.id, r.rating, r.text, r.display_name, r.published_at,
      rr.text AS reply_text, rr.state::text AS reply_state, rr.moderation_reason AS reply_reason, rr.version AS reply_version
    FROM reviews r
    LEFT JOIN LATERAL (SELECT * FROM review_replies x WHERE x.review_id = r.id ORDER BY x.version DESC LIMIT 1) rr ON true
    WHERE r.practitioner_id = ${practitionerId} AND r.state = 'published'
    ORDER BY r.published_at DESC
    LIMIT 200`);
  return res.rows.map((r) => ({
    id: r.id,
    rating: Number(r.rating),
    text: r.text,
    displayName: r.display_name,
    publishedAt: new Date(r.published_at),
    reply: r.reply_text ? { text: r.reply_text, state: r.reply_state ?? "pending", moderationReason: r.reply_reason, version: Number(r.reply_version) } : null,
  }));
}

/**
 * REV-03: a provider reply, moderated before it shows. Each edit is a new
 * version; the public page shows the latest approved one.
 */
export async function submitReply(practitionerId: string, authorUserId: string, reviewId: string, text: string): Promise<void> {
  const body = text.trim();
  if (body.length < 2 || body.length > 1000) throw new ApiError("INVALID_INPUT", "Write a reply of up to 1000 characters");
  await withTransaction(async (_c, tx) => {
    const r = (await tx.execute<{ id: string }>(sql`SELECT id FROM reviews WHERE id = ${reviewId} AND practitioner_id = ${practitionerId} AND state = 'published' FOR UPDATE`)).rows[0];
    if (!r) throw new ApiError("NOT_FOUND", "Review not found");
    const pending = await tx.execute(sql`SELECT 1 FROM review_replies WHERE review_id = ${r.id} AND state = 'pending' LIMIT 1`);
    if (pending.rows.length) throw new ApiError("CONFLICT", "Your previous reply is still being moderated");
    const v = await tx.execute<{ id: string }>(sql`
      INSERT INTO review_replies (review_id, practitioner_id, author_user_id, version, text, state)
      VALUES (${r.id}, ${practitionerId}, ${authorUserId}, (SELECT coalesce(max(version), 0) + 1 FROM review_replies WHERE review_id = ${r.id}), ${body}, 'pending')
      RETURNING id`);
    const flagged = looksLikeContactDetails(body);
    await openCase(tx, {
      caseType: "review_moderation",
      subjectType: "review_reply",
      subjectId: v.rows[0].id,
      practitionerId,
      submittedByUserId: authorUserId,
      priority: flagged ? "high" : "normal",
      evidence: { kind: "reply", reviewId: r.id, contactDetailsSuspected: flagged },
    });
    await audit({ actorUserId: authorUserId, actorRole: "practitioner", action: "review.reply", objectType: "review_reply", objectId: v.rows[0].id }, tx);
  });
}
