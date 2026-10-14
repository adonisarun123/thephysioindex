"use server";

import { revalidatePath } from "next/cache";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { audit } from "@/lib/audit";
import { requireStaff } from "@/lib/auth/session";
import { act, parseForm, zOpt, zReq, zUuid } from "@/lib/admin/forms";
import { actorRole } from "@/lib/admin/practitioner-ops";

/** ADM-04: revealing a patient identifier needs the support role and a stated purpose; every reveal is logged. */
export async function revealPatientAction(fd: FormData) {
  const v = await requireStaff("support_agent");
  const { patientId, purpose, returnTo } = parseForm(z.object({ patientId: zUuid, purpose: zReq(500, 5), returnTo: zOpt(300) }), fd);
  const back = returnTo?.startsWith("/admin") ? returnTo : "/admin/patients";
  await act(back, async () => {
    await db().execute(sql`INSERT INTO record_access_log (actor_user_id, object_type, object_id, purpose) VALUES (${v.userId}, 'patient', ${patientId}, ${purpose})`);
    await audit({ actorUserId: v.userId, actorRole: actorRole(v), action: "patient.reveal_contact", objectType: "patient", objectId: patientId, reason: purpose });
    revalidatePath("/admin/patients");
    return { notice: "Contact revealed for 10 minutes; access logged." };
  });
}
