import { connection } from "next/server";
import { z } from "zod";
import { handler, ok } from "@/lib/api";
import { apiViewer } from "@/lib/auth/session";
import { confirmBooking } from "@/lib/booking/engine";
import { bookingRequest } from "@/lib/booking/http";
import { listPatientBookings } from "@/lib/booking/queries";

const Body = z.object({
  holdToken: z.string().min(20).max(200),
  expectedTotalPaise: z.number().int().nonnegative(),
  expectedPolicyVersion: z.string().min(1).max(80),
  appointmentReason: z.string().max(500).optional().nullable(),
});

/** POST /api/v1/bookings — convert a hold into a confirmed booking (BKG-02, BKG-07 step 4). Requires Idempotency-Key. */
export const POST = handler(async (req, rid) => {
  await connection();
  const { actor, idempotencyKey } = await bookingRequest(req);
  const body = Body.parse(await req.json());
  const booking = await confirmBooking(actor, { ...body, idempotencyKey });
  return ok(booking, { requestId: rid, status: 201 });
});

/** GET /api/v1/bookings — the caller's and their dependants' appointments (BKG-13). */
export const GET = handler(async (_req, rid) => {
  await connection();
  const viewer = await apiViewer();
  const bookings = await listPatientBookings(viewer.userId);
  return ok({ bookings: bookings.map((b) => ({ ...b, policyText: undefined })) }, { requestId: rid });
});
