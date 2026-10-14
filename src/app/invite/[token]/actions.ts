"use server";

import { ApiError } from "@/lib/api";
import { getViewer } from "@/lib/auth/session";
import { done, failTo, str } from "@/lib/workspace/forms";
import { acceptInvitation } from "@/lib/workspace/team";

/** Accepts an invitation for the signed-in viewer; the token alone never grants access (IAM-02). */
export async function acceptInvitationAction(formData: FormData) {
  const token = str(formData, "token");
  try {
    const viewer = await getViewer();
    if (!viewer) throw new ApiError("UNAUTHENTICATED", "Sign in to accept this invitation");
    await acceptInvitation(token, viewer);
    done("/workspace", { ok: "Invitation accepted. You now have coordinator access." });
  } catch (err) {
    failTo(`/invite/${encodeURIComponent(token)}`, err);
  }
}
