"use server";

import { revalidatePath } from "next/cache";
import { createInvitation, revokeInvitation } from "@/lib/review-invitations";
import { submitReply } from "@/lib/reviews";
import { requireManage } from "@/lib/workspace/context";
import { done, failTo, str } from "@/lib/workspace/forms";

const PAGE = "/workspace/reviews";

/** REV-03: provider reply, moderated before it appears on the profile. */
export async function replyAction(formData: FormData) {
  try {
    const { viewer, practitioner } = await requireManage();
    await submitReply(practitioner.id, viewer.userId, str(formData, "reviewId"), str(formData, "text"));
    revalidatePath(PAGE);
    done(PAGE, { ok: "Reply sent for moderation. It appears on your profile once approved." });
  } catch (err) {
    failTo(PAGE, err);
  }
}

/** Invite a patient treated outside the platform to write a review (labelled "invited" publicly). */
export async function inviteAction(formData: FormData) {
  let id: string;
  try {
    const { viewer, practitioner } = await requireManage();
    ({ id } = await createInvitation({ id: practitioner.id, listingStatus: practitioner.listingStatus }, viewer.userId, str(formData, "patientLabel")));
    revalidatePath(PAGE);
  } catch (err) {
    failTo(PAGE, err);
  }
  done(`${PAGE}?new=${id}#invite`, { ok: "Link ready. Send it to your patient on WhatsApp or copy it." });
}

export async function revokeInviteAction(formData: FormData) {
  try {
    const { viewer, practitioner } = await requireManage();
    await revokeInvitation(practitioner.id, viewer.userId, str(formData, "invitationId"));
    revalidatePath(PAGE);
  } catch (err) {
    failTo(PAGE, err);
  }
  done(`${PAGE}#invite`, { ok: "Invitation cancelled. The link no longer works." });
}
