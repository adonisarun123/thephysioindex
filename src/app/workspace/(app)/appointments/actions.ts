"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { ApiError } from "@/lib/api";
import { cancelByProvider, createManualBooking, recordOutcome, reportPaymentReceived } from "@/lib/booking/engine";
import { normaliseIndianMobile } from "@/lib/messaging/sms";
import { istToUtc } from "@/lib/workspace/calendar";
import { requireManage } from "@/lib/workspace/context";
import { done, failTo, num, opt, str } from "@/lib/workspace/forms";

/** Practice-side booking actions (Section 11 table, PRO-13, PAY-01). Scope is the viewer's practitioner (IAM-01). */

function actorOf(v: { userId: string; grants: { role: string }[] }) {
  return { userId: v.userId, role: v.grants.some((g) => g.role === "super_admin") ? "super_admin" : "practitioner" };
}

export async function outcomeAction(formData: FormData) {
  const id = str(formData, "bookingId");
  const page = `/workspace/appointments/${id}`;
  try {
    const { viewer, practitioner } = await requireManage();
    const outcome = z.enum(["completed", "no_show"]).parse(str(formData, "outcome"));
    await recordOutcome(actorOf(viewer), { bookingId: id, practitionerId: practitioner.id, expectedVersion: num(formData, "version") ?? 0, outcome, idempotencyKey: str(formData, "idempotencyKey") });
    done(page, { ok: outcome === "completed" ? "Marked completed" : "No-show recorded" });
  } catch (err) {
    failTo(page, err);
  }
}

export async function providerCancelAction(formData: FormData) {
  const id = str(formData, "bookingId");
  const page = `/workspace/appointments/${id}`;
  try {
    const { viewer, practitioner } = await requireManage();
    await cancelByProvider(actorOf(viewer), { bookingId: id, practitionerId: practitioner.id, expectedVersion: num(formData, "version") ?? 0, reason: str(formData, "reason"), idempotencyKey: str(formData, "idempotencyKey") });
    done(page, { ok: "Appointment cancelled; the patient will be notified" });
  } catch (err) {
    failTo(page, err);
  }
}

export async function paymentAction(formData: FormData) {
  const id = str(formData, "bookingId");
  const page = `/workspace/appointments/${id}`;
  try {
    const { viewer, practitioner } = await requireManage();
    await reportPaymentReceived(actorOf(viewer), { bookingId: id, practitionerId: practitioner.id });
    done(page, { ok: "Payment recorded as self-reported" });
  } catch (err) {
    failTo(page, err);
  }
}

const Manual = z.object({
  offeringId: z.uuid("Choose a service"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date"),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Time must be HH:MM"),
  patientName: z.string().trim().min(2, "Enter the patient's name").max(80),
  source: z.enum(["walk_in", "phone"]),
});

export async function manualBookingAction(formData: FormData) {
  const page = "/workspace/appointments/new";
  let bookingId: string;
  try {
    const { viewer, practitioner } = await requireManage();
    const input = Manual.parse({ offeringId: str(formData, "offeringId"), date: str(formData, "date"), time: str(formData, "time"), patientName: str(formData, "patientName"), source: str(formData, "source") });
    const rawMobile = opt(formData, "patientMobile");
    const mobile = rawMobile ? normaliseIndianMobile(rawMobile) : null;
    if (rawMobile && !mobile) throw new ApiError("INVALID_INPUT", "Enter a valid Indian mobile number or leave it blank");
    const r = await createManualBooking(actorOf(viewer), {
      practitionerId: practitioner.id,
      offeringId: input.offeringId,
      startsAt: istToUtc(input.date, input.time).toISOString(),
      patientName: input.patientName,
      patientMobile: mobile,
      source: input.source,
      idempotencyKey: str(formData, "idempotencyKey"),
    });
    bookingId = r.bookingId;
  } catch (err) {
    failTo(page, err);
  }
  redirect(`/workspace/appointments/${bookingId}?ok=${encodeURIComponent("Appointment added")}`);
}
