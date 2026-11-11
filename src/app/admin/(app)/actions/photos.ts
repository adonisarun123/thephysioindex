"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireStaff } from "@/lib/auth/session";
import { act, parseForm, zOpt, zReason, zUuid } from "@/lib/admin/forms";
import { decidePhoto, staffRemovePhoto } from "@/lib/treatment-photos";

const BACK = "/admin/photos";
const staffOf = (v: { userId: string; grants: { role: string }[] }) => ({ userId: v.userId, role: v.grants.find((g) => g.role === "super_admin")?.role ?? v.grants[0]?.role ?? null });

/** Approve or reject a patient photo a physiotherapist uploaded (moderation before anything is public). */
export async function decidePhotoAction(fd: FormData) {
  const v = await requireStaff("verification_reviewer");
  const input = parseForm(z.object({ photoId: zUuid, decision: z.enum(["approve", "reject"]), reason: zOpt(500) }), fd);
  await act(BACK, async () => {
    await decidePhoto(staffOf(v), input.photoId, input.decision, input.reason ?? null);
    revalidatePath("/admin", "layout");
    return { notice: input.decision === "approve" ? "Photo approved. It is now on the profile." : "Photo rejected. The physiotherapist sees the reason." };
  });
}

/** Take a live photo down for good, for example when the person pictured objects. */
export async function removePhotoAction(fd: FormData) {
  const v = await requireStaff("verification_reviewer");
  const input = parseForm(z.object({ photoId: zUuid, reason: zReason }), fd);
  await act(`${BACK}?view=live`, async () => {
    await staffRemovePhoto(staffOf(v), input.photoId, input.reason);
    revalidatePath("/admin", "layout");
    return { notice: "Photo removed from the site and deleted from the image service." };
  });
}
