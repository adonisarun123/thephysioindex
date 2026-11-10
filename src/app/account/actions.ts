"use server";

import { sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { audit } from "@/lib/audit";
import { requireViewer } from "@/lib/auth/session";
import { bool, done } from "@/lib/workspace/forms";

/** WAP-02: explicit WhatsApp opt-in for booking updates (WhatsApp Business policy; DPDP consent). */
export async function saveWhatsAppAction(formData: FormData) {
  const v = await requireViewer("/account");
  const optIn = bool(formData, "whatsappOptIn");
  await db().execute(sql`
    INSERT INTO notification_preferences (user_id, whatsapp_opt_in) VALUES (${v.userId}, ${optIn})
    ON CONFLICT (user_id) DO UPDATE SET whatsapp_opt_in = excluded.whatsapp_opt_in`);
  await audit({ actorUserId: v.userId, action: optIn ? "notifications.whatsapp_opt_in" : "notifications.whatsapp_opt_out", objectType: "user", objectId: v.userId });
  revalidatePath("/account");
  done("/account", { ok: optIn ? "Booking updates will come on WhatsApp instead of SMS." : "WhatsApp updates turned off. You will get SMS instead." });
}
