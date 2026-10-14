"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { email } from "@/lib/messaging/email";
import { sms } from "@/lib/messaging/sms";
import { requireOwner } from "@/lib/workspace/context";
import { done, failTo, list, opt, str } from "@/lib/workspace/forms";
import { createInvitation, InviteSchema, revokeAssignment, revokeInvitation } from "@/lib/workspace/team";

const PAGE = "/workspace/team";

async function baseUrl(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  return process.env.NEXT_PUBLIC_APP_URL && process.env.VERCEL_ENV === "production" ? process.env.NEXT_PUBLIC_APP_URL : host ? `${proto}://${host}` : "http://localhost:3000";
}

/** IAM-02: invitation with explicit scope, permission set and seven-day expiry. Delivery happens after the transaction commits. */
export async function inviteAction(formData: FormData) {
  try {
    const { viewer, practitioner } = await requireOwner();
    const input = InviteSchema.parse({ mobile: opt(formData, "mobile"), email: opt(formData, "email"), permissions: list(formData, "permissions") });
    const { token, expiresAt } = await createInvitation(practitioner.id, viewer, input);
    const link = `${await baseUrl()}/invite/${token}`;
    const text = `${practitioner.displayName} invited you to help manage their Physio Index workspace. Accept by ${expiresAt.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })}: ${link}`;
    let delivered = true;
    try {
      if (input.mobile) await sms().sendText(input.mobile.startsWith("+") ? input.mobile : `+91${input.mobile.replace(/\D/g, "").slice(-10)}`, text);
      else if (input.email) await email().send(input.email, "Invitation to a Physio Index workspace", text);
    } catch {
      delivered = false;
    }
    revalidatePath(PAGE);
    done(PAGE, delivered ? { ok: "Invitation sent. It expires in 7 days." } : { error: "Invitation saved but the message could not be sent. Revoke it and try again, or ask support to resend." });
  } catch (err) {
    failTo(PAGE, err);
  }
}

export async function revokeInvitationAction(formData: FormData) {
  try {
    const { viewer, practitioner } = await requireOwner();
    await revokeInvitation(practitioner.id, viewer.userId, str(formData, "invitationId"));
    revalidatePath(PAGE);
    done(PAGE, { ok: "Invitation revoked" });
  } catch (err) {
    failTo(PAGE, err);
  }
}

export async function revokeMemberAction(formData: FormData) {
  try {
    const { viewer, practitioner } = await requireOwner();
    await revokeAssignment(practitioner.id, viewer.userId, str(formData, "assignmentId"));
    revalidatePath(PAGE);
    done(PAGE, { ok: "Access revoked" });
  } catch (err) {
    failTo(PAGE, err);
  }
}
