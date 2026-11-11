"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireStaff } from "@/lib/auth/session";
import { CHANGE_REASONS, REJECT_REASONS, quickApprove, quickDecline } from "@/lib/admin/approvals";
import { act, parseForm, zList, zOpt, zUuid } from "@/lib/admin/forms";

const BACK = "/admin/approvals";

function refresh(practitionerId: string, publicPath?: string) {
  revalidatePath("/admin", "layout");
  revalidatePath(`/admin/practitioners/${practitionerId}`);
  if (publicPath) revalidatePath(publicPath);
}

/** One click: approve the listing, mark ticked registrations checked, switch booking on when eligible (VER-02, VER-04). */
export async function approveAction(fd: FormData) {
  const v = await requireStaff("verification_reviewer");
  const input = parseForm(z.object({ caseId: zUuid, practitionerId: zUuid, name: zOpt(160), checked: zList }), fd);
  await act(BACK, async () => {
    const msg = await quickApprove(v, { caseId: input.caseId, practitionerId: input.practitionerId, checkedCredentialIds: input.checked });
    refresh(input.practitionerId);
    return { notice: `${input.name ?? "Profile"}: ${msg}` };
  });
}

/** Changes requested or rejected with a preset reason plus an optional note; the physio is told why (Section 13). */
export async function declineAction(fd: FormData) {
  const v = await requireStaff("verification_reviewer");
  const input = parseForm(
    z.object({ caseId: zUuid, practitionerId: zUuid, name: zOpt(160), decision: z.enum(["changes_requested", "rejected"]), preset: zOpt(40), note: zOpt(1000) }),
    fd,
  );
  await act(BACK, async () => {
    const presets = input.decision === "rejected" ? REJECT_REASONS : CHANGE_REASONS;
    const reason = [input.preset ? presets[input.preset] : null, input.note].filter(Boolean).join(" ").trim();
    if (reason.length < 3) throw new Error("Pick a reason or write a short note so the physiotherapist knows what to do");
    await quickDecline(v, { caseId: input.caseId, decision: input.decision, reason });
    refresh(input.practitionerId);
    return { notice: `${input.name ?? "Profile"}: ${input.decision === "rejected" ? "rejected" : "changes requested"}. They have been told why.` };
  });
}
