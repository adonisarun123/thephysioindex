import { connection } from "next/server";
import { z } from "zod";
import { handler, ok } from "@/lib/api";
import { rescheduleByPatient } from "@/lib/booking/engine";
import { bookingRequest, pathParam } from "@/lib/booking/http";

const Body = z.object({
  expectedVersion: z.number().int().positive(),
  newStartsAt: z.iso.datetime({ offset: true }),
  acceptedTotalPaise: z.number().int().nonnegative().optional().nullable(),
});

/** POST /api/v1/bookings/{id}/reschedule — keeps the booking ID; the old slot stays if the new one fails (BKG-03, BKG-11). */
export const POST = handler(async (req, rid) => {
  await connection();
  const { actor, idempotencyKey } = await bookingRequest(req);
  const body = Body.parse(await req.json());
  const result = await rescheduleByPatient(actor, { bookingId: pathParam(req, 1), ...body, idempotencyKey });
  return ok(result, { requestId: rid });
});
