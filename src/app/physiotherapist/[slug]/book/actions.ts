"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { ApiError } from "@/lib/api";
import { getViewer } from "@/lib/auth/session";
import { confirmBooking, createHold, releaseHold } from "@/lib/booking/engine";
import { addAdultDependant, ensureSelfPatient } from "@/lib/booking/patients";
import { failTo, opt, str, withQuery } from "@/lib/workspace/forms";

/**
 * Patient booking flow as plain server-rendered forms. The hold token travels
 * in an httpOnly cookie, never in a URL (BKG-07 step 3: token scoped to the actor).
 * Each form render carries its own idempotency key, so a double submit replays
 * the first result instead of creating a second hold or booking (BKG-10).
 */

const HOLD_COOKIE = "tpi_hold";

async function viewerOrSignIn(back: string) {
  const v = await getViewer();
  if (!v) redirect(`/sign-in?next=${encodeURIComponent(back)}`);
  return v;
}

export async function holdAction(formData: FormData) {
  const slug = str(formData, "slug");
  const offeringId = str(formData, "offeringId");
  const startsAt = str(formData, "startsAt");
  const date = str(formData, "date");
  const back = withQuery(`/physiotherapist/${slug}/book`, { o: offeringId, d: date, t: startsAt });
  const viewer = await viewerOrSignIn(back);
  try {
    let patientId = str(formData, "patient");
    if (patientId === "self") {
      patientId = await ensureSelfPatient({ userId: viewer.userId, name: viewer.name, mobile: viewer.mobile, mobileVerified: viewer.mobileVerified });
    } else if (patientId === "other") {
      const d = z
        .object({ name: z.string().trim().min(2, "Enter the patient's name").max(80), relationship: z.string().trim().min(2, "Say how you are related").max(40) })
        .parse({ name: str(formData, "otherName"), relationship: str(formData, "otherRelationship") });
      patientId = await addAdultDependant(viewer.userId, { displayName: d.name, relationship: d.relationship, confirmedAuthority: formData.get("otherAuthority") === "on" });
    } else if (!/^[0-9a-f-]{36}$/i.test(patientId)) {
      throw new ApiError("INVALID_INPUT", "Choose who the appointment is for");
    }
    const hold = await createHold(
      { userId: viewer.userId, role: viewer.kind },
      { offeringId, startsAt, patientId, offerCode: opt(formData, "offerCode") ?? null, idempotencyKey: str(formData, "idempotencyKey") },
    );
    (await cookies()).set(HOLD_COOKIE, hold.holdToken, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 15 * 60 });
  } catch (err) {
    failTo(back, err);
  }
  redirect(`/physiotherapist/${slug}/book/review`);
}

export async function confirmAction(formData: FormData) {
  const slug = str(formData, "slug");
  const back = `/physiotherapist/${slug}/book/review`;
  const viewer = await viewerOrSignIn(back);
  const jar = await cookies();
  const token = jar.get(HOLD_COOKIE)?.value;
  let bookingId: string;
  try {
    if (!token) throw new ApiError("HOLD_EXPIRED", "Your hold has ended. Please choose a time again.");
    const r = await confirmBooking(
      { userId: viewer.userId, role: viewer.kind },
      {
        holdToken: token,
        expectedTotalPaise: Number(str(formData, "expectedTotalPaise")),
        expectedPolicyVersion: str(formData, "expectedPolicyVersion"),
        appointmentReason: opt(formData, "reason") ?? null,
        idempotencyKey: str(formData, "idempotencyKey"),
      },
    );
    bookingId = r.bookingId;
    jar.delete(HOLD_COOKIE);
  } catch (err) {
    failTo(back, err);
  }
  redirect(`/account/bookings/${bookingId}?ok=confirmed`);
}

export async function releaseAction(formData: FormData) {
  const slug = str(formData, "slug");
  const viewer = await getViewer();
  const jar = await cookies();
  const token = jar.get(HOLD_COOKIE)?.value;
  if (viewer && token) await releaseHold({ userId: viewer.userId }, token);
  jar.delete(HOLD_COOKIE);
  redirect(`/physiotherapist/${slug}/book`);
}
