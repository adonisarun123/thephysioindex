"use server";

import { revalidatePath } from "next/cache";
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
