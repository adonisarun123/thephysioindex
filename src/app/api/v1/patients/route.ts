import { connection } from "next/server";
import { handler, ok } from "@/lib/api";
import { apiViewer } from "@/lib/auth/session";
import { ensureSelfPatient, listBookablePatients } from "@/lib/booking/patients";

/** GET /api/v1/patients — patient records the caller may book for; creates the caller's own record on first use (BKG-16). */
export const GET = handler(async (_req, rid) => {
  await connection();
  const v = await apiViewer();
  await ensureSelfPatient({ userId: v.userId, name: v.name, mobile: v.mobile, mobileVerified: v.mobileVerified });
  return ok({ patients: await listBookablePatients(v.userId) }, { requestId: rid });
});
