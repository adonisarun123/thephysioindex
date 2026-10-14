import { connection } from "next/server";
import { ApiError, handler, ok } from "@/lib/api";
import { expireElapsedHolds } from "@/lib/booking/engine";

/**
 * Expiry worker (BKG-09). Every booking attempt also expires holds for the
 * calendar it locks, so a delayed run never blocks capacity indefinitely.
 * Protected by CRON_SECRET (Vercel Cron sends it as a bearer token).
 */
export const GET = handler(async (req, rid) => {
  await connection();
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) throw new ApiError("UNAUTHORISED", "Not allowed");
  const expired = await expireElapsedHolds();
  return ok({ expired }, { requestId: rid });
});
