import { connection } from "next/server";
import { ApiError, handler, ok } from "@/lib/api";
import { getPublicProfile } from "@/lib/directory";

/** GET /api/v1/practitioners/{publicId} — published profile only (PRO-10, DAT-02). */
export const GET = handler(async (req, rid) => {
  await connection();
  const publicId = new URL(req.url).pathname.split("/").pop() ?? "";
  const profile = await getPublicProfile(publicId);
  if (!profile || profile.listingStatus !== "published") throw new ApiError("NOT_FOUND", "Profile not available");
  return ok(profile, { requestId: rid, cache: "public", maxAge: 120 });
});
