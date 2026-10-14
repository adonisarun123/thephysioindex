"use server";

import { redirect } from "next/navigation";
import { getViewer } from "@/lib/auth/session";
import { cancelByPatient, rescheduleByPatient } from "@/lib/booking/engine";
import { appealReview, ReviewInput, submitReview, withdrawReview } from "@/lib/reviews";
import { failTo, num, opt, str, withQuery } from "@/lib/workspace/forms";

/** Patient self-service: cancel (BKG-15) and reschedule (BKG-03). Authority is rechecked inside the engine. */

export async function cancelAction(formData: FormData) {
  const id = str(formData, "bookingId");
  const back = `/account/bookings/${id}`;
  const v = await getViewer();
  if (!v) redirect(`/sign-in?next=${encodeURIComponent(back)}`);
  let outcome: string;
  try {
    const r = await cancelByPatient({ userId: v.userId, role: v.kind }, { bookingId: id, expectedVersion: num(formData, "version") ?? 0, reason: opt(formData, "reason") ?? null, idempotencyKey: str(formData, "idempotencyKey") });
    outcome = r.requested ? "cancellation_requested" : "cancelled";
  } catch (err) {
    failTo(back, err);
  }
  redirect(withQuery(back, { ok: outcome }));
}

export async function rescheduleAction(formData: FormData) {
  const id = str(formData, "bookingId");
  const newStartsAt = str(formData, "newStartsAt");
  const date = str(formData, "date");
  const back = withQuery(`/account/bookings/${id}/reschedule`, { d: date, t: newStartsAt });
  const v = await getViewer();
  if (!v) redirect(`/sign-in?next=${encodeURIComponent(back)}`);
  try {
    await rescheduleByPatient(
      { userId: v.userId, role: v.kind },
      { bookingId: id, expectedVersion: num(formData, "version") ?? 0, newStartsAt, acceptedTotalPaise: num(formData, "acceptedTotalPaise") ?? null, idempotencyKey: str(formData, "idempotencyKey") },
    );
  } catch (err) {
    const e = err as { code?: string; details?: { totalPaise?: number } };
    if (e?.code === "PRICE_CHANGED" && e.details?.totalPaise != null) redirect(withQuery(back, { price: String(e.details.totalPaise) }));
    failTo(back, err);
  }
  redirect(withQuery(`/account/bookings/${id}`, { ok: "rescheduled" }));
}

/** REV-01..REV-03: submit, withdraw and appeal a review. Eligibility and authority are rechecked in the transaction. */
export async function submitReviewAction(formData: FormData) {
  const id = str(formData, "bookingId");
  const back = `/account/bookings/${id}/review`;
  const v = await getViewer();
  if (!v) redirect(`/sign-in?next=${encodeURIComponent(back)}`);
  try {
    const input = ReviewInput.parse({
      bookingId: id,
      rating: str(formData, "rating"),
      text: opt(formData, "text"),
      displayName: str(formData, "displayName"),
      confirmedNoPrivateData: formData.get("confirmedNoPrivateData") === "on",
    });
    await submitReview(v.userId, input);
  } catch (err) {
    failTo(back, err);
  }
  redirect(withQuery(back, { ok: "submitted" }));
}

export async function withdrawReviewAction(formData: FormData) {
  const id = str(formData, "bookingId");
  const back = `/account/bookings/${id}/review`;
  const v = await getViewer();
  if (!v) redirect(`/sign-in?next=${encodeURIComponent(back)}`);
  try {
    await withdrawReview(v.userId, str(formData, "reviewId"));
  } catch (err) {
    failTo(back, err);
  }
  redirect(withQuery(back, { ok: "withdrawn" }));
}

export async function appealReviewAction(formData: FormData) {
  const id = str(formData, "bookingId");
  const back = `/account/bookings/${id}/review`;
  const v = await getViewer();
  if (!v) redirect(`/sign-in?next=${encodeURIComponent(back)}`);
  try {
    await appealReview(v.userId, str(formData, "reviewId"), str(formData, "explanation"));
  } catch (err) {
    failTo(back, err);
  }
  redirect(withQuery(back, { ok: "appealed" }));
}
