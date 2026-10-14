import { connection } from "next/server";
import { z } from "zod";
import { handler, ok } from "@/lib/api";
import { cancelByPatient } from "@/lib/booking/engine";
import { bookingRequest, pathParam } from "@/lib/booking/http";

const Body = z.object({ expectedVersion: z.number().int().positive(), reason: z.string().max(500).optional().nullable() });

/** POST /api/v1/bookings/{id}/cancel — direct before the cutoff, otherwise a request to the clinic (BKG-15). */
export const POST = handler(async (req, rid) => {
  await connection();
  const { actor, idempotencyKey } = await bookingRequest(req);
  const body = Body.parse(await req.json());
  const result = await cancelByPatient(actor, { bookingId: pathParam(req, 1), ...body, idempotencyKey });
  return ok(result, { requestId: rid });
});
