"use server";

import { redirect } from "next/navigation";
import { getViewer } from "@/lib/auth/session";
import { cancelByPatient, rescheduleByPatient } from "@/lib/booking/engine";
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
