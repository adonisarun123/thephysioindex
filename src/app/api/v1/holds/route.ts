import { connection } from "next/server";
import { z } from "zod";
import { handler, ok } from "@/lib/api";
import { createHold, releaseHold } from "@/lib/booking/engine";
import { bookingRequest } from "@/lib/booking/http";
import { apiViewer } from "@/lib/auth/session";

const Body = z.object({
  offeringId: z.uuid(),
  startsAt: z.iso.datetime({ offset: true }),
  patientId: z.uuid(),
  offerCode: z.string().trim().max(40).optional().nullable(),
});

/** POST /api/v1/holds — five-minute hold with an opaque token (BKG-07 steps 1–3). Requires Idempotency-Key. */
export const POST = handler(async (req, rid) => {
  await connection();
  const { actor, idempotencyKey } = await bookingRequest(req);
  const body = Body.parse(await req.json());
  const hold = await createHold(actor, { ...body, idempotencyKey });
  return ok(hold, { requestId: rid, status: 201 });
});

/** DELETE /api/v1/holds — release the caller's own hold. */
export const DELETE = handler(async (req, rid) => {
  await connection();
  const viewer = await apiViewer();
  const { holdToken } = z.object({ holdToken: z.string().min(20).max(200) }).parse(await req.json());
  await releaseHold({ userId: viewer.userId }, holdToken);
  return ok({ released: true }, { requestId: rid });
});
