"use server";

import { revalidatePath } from "next/cache";
import { FollowUpSchema, updateEnquiry } from "@/lib/practice/enquiries";
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
