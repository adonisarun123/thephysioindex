import { connection } from "next/server";
import { ApiError, handler, ok } from "@/lib/api";
import { expireElapsedHolds } from "@/lib/booking/engine";
import { runDispatch } from "@/lib/messaging/dispatch";

/**
 * Notification tick (MSG-01, MSG-02): fans out outbox events, sends due
 * reminders and retries. Confirmations normally go out inline after the
 * booking request; this tick is what delivers reminders and retries, so it
 * must be called every few minutes (external scheduler on the current plan).
 * It also expires elapsed holds (BKG-09) so one scheduler covers both.
 * Protected by CRON_SECRET as a bearer token.
 */
export const maxDuration = 60;

export const GET = handler(async (req, rid) => {
  await connection();
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) throw new ApiError("UNAUTHORISED", "Not allowed");
  const expired = await expireElapsedHolds();
  const result = await runDispatch({ budgetMs: 45_000 });
  return ok({ expired, ...result }, { requestId: rid });
});
