"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { confirmRequestedTime, FollowUpSchema, updateEnquiry } from "@/lib/practice/enquiries";
import { requireManage } from "@/lib/workspace/context";
import { done, failTo, opt, str } from "@/lib/workspace/forms";

const PAGE = "/workspace/enquiries";

const OK: Record<string, string> = {
  contacted: "Marked as contacted.",
  follow_up: "Follow-up date saved.",
  close: "Enquiry closed.",
  reopen: "Enquiry reopened.",
};

/** ENQ-02: one action for the inbox card's buttons (the pressed button carries `action`). */
export async function enquiryAction(formData: FormData) {
  const back = `${PAGE}?show=${encodeURIComponent(str(formData, "show") || "open")}`;
  let action = "";
  try {
    const { viewer, practitioner } = await requireManage();
    const input = FollowUpSchema.parse({
      enquiryId: str(formData, "enquiryId"),
      action: str(formData, "action"),
      followUpOn: opt(formData, "followUpOn"),
      note: formData.has("note") ? str(formData, "note") : undefined,
      outcome: opt(formData, "outcome"),
    });
    action = input.action;
    await updateEnquiry(practitioner.id, viewer.userId, input);
    revalidatePath(PAGE);
  } catch (err) {
    failTo(back, err);
  }
  done(back, { ok: OK[action] });
}

/** One tap on a requested time: creates the appointment and closes the enquiry as booked (CAL-10, BKG-07). */
export async function confirmRequestedAction(formData: FormData) {
  const back = `${PAGE}?show=${encodeURIComponent(str(formData, "show") || "open")}`;
  let bookingId = "";
  try {
    const { viewer, practitioner } = await requireManage();
    const enquiryId = z.uuid().parse(str(formData, "enquiryId"));
    const actor = { userId: viewer.userId, role: viewer.grants.some((g) => g.role === "super_admin") ? "super_admin" : "practitioner" };
    bookingId = (await confirmRequestedTime(practitioner.id, actor, enquiryId)).bookingId;
    revalidatePath(PAGE);
  } catch (err) {
    failTo(back, err);
  }
  redirect(`/workspace/appointments/${bookingId}?ok=${encodeURIComponent("Appointment confirmed. Tell the patient it is booked.")}`);
}
