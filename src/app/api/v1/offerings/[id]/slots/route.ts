import { connection } from "next/server";
import { z } from "zod";
import { db } from "@/db/client";
import { ApiError, handler, ok, parseQuery } from "@/lib/api";
import { pathParam } from "@/lib/booking/http";
import { computeSlots, loadOfferingContext, unbookableReason, UNBOOKABLE_MESSAGES } from "@/lib/booking/slots";
import { addDays, daysBetween, isLocalDate, localDateOf } from "@/lib/booking/time";
import { getConfig } from "@/lib/config";

const Query = z.object({ from: z.string().refine(isLocalDate, "Use YYYY-MM-DD").optional(), to: z.string().refine(isLocalDate, "Use YYYY-MM-DD").optional() });

/**
 * GET /api/v1/offerings/{id}/slots?from=YYYY-MM-DD&to=YYYY-MM-DD — advisory
 * bookable slots (CAL-10, CAL-11). Reveals no patient data or block titles.
 * Never authorises a booking: the hold transaction rechecks everything.
 */
export const GET = handler(async (req, rid) => {
  await connection();
  const offeringId = pathParam(req, 1);
  if (!/^[0-9a-f-]{36}$/i.test(offeringId)) throw new ApiError("NOT_FOUND", "Service not found");
  const q = parseQuery(Query, req.url);
  const today = localDateOf(Date.now());
  const from = q.from && q.from > today ? q.from : today;
  const maxDays = await getConfig<number>("slots.max_query_days", 31);
  const to = q.to ?? addDays(from, 6);
  if (to < from || daysBetween(from, to) >= maxDays) throw new ApiError("INVALID_INPUT", `Query at most ${maxDays} days`);
  const ctx = await loadOfferingContext(db(), offeringId);
  if (!ctx) throw new ApiError("NOT_FOUND", "Service not found");
  const reason = unbookableReason(ctx, { showTestAccounts: process.env.SHOW_TEST_ACCOUNTS === "1" });
  if (reason === "hidden") throw new ApiError("NOT_FOUND", "Service not found");
  if (reason) throw new ApiError("PROFILE_NOT_BOOKABLE", UNBOOKABLE_MESSAGES[reason]);
  const slots = await computeSlots(db(), ctx, from, to);
  return ok({ offeringId, from, to, timezone: "Asia/Kolkata", slots }, { requestId: rid, cache: "public", maxAge: 15 });
});
