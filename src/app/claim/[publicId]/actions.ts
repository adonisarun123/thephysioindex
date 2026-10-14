"use server";

import { z } from "zod";
import { ApiError } from "@/lib/api";
import { getViewer } from "@/lib/auth/session";
import { normaliseIndianMobile } from "@/lib/messaging/sms";
import { createClaim, getClaimTarget } from "@/lib/workspace/claims";
import { bool, done, failTo, opt, str } from "@/lib/workspace/forms";

const Evidence = z.object({
  authorityId: z.uuid().optional(),
  registrationNumber: z.string().trim().max(60).optional(),
  clinicPhone: z.string().trim().max(20).optional(),
  clinicEmail: z.email("Enter a valid email").max(160).optional(),
  note: z.string().trim().max(1000).optional(),
  dispute: z.boolean(),
  confirm: z.literal(true, { error: "Confirm that you are this practitioner" }),
});

/** PRO-04: records a claim with reviewer-visible evidence; never transfers ownership directly. */
export async function submitClaim(formData: FormData) {
  const publicId = str(formData, "publicId");
  const back = `/claim/${publicId}`;
  try {
    const viewer = await getViewer();
    if (!viewer) throw new ApiError("UNAUTHENTICATED", "Sign in to continue");
    const target = await getClaimTarget(publicId);
    if (!target) throw new ApiError("NOT_FOUND", "Profile not found");
    const input = Evidence.parse({
      authorityId: opt(formData, "authorityId"),
      registrationNumber: opt(formData, "registrationNumber"),
      clinicPhone: opt(formData, "clinicPhone"),
      clinicEmail: opt(formData, "clinicEmail"),
      note: opt(formData, "note"),
      dispute: bool(formData, "dispute"),
      confirm: bool(formData, "confirm"),
    });
    if (!input.registrationNumber && !input.clinicPhone && !input.clinicEmail && !input.note) throw new ApiError("INVALID_INPUT", "Provide at least one piece of evidence a reviewer can check");
    const phone = input.clinicPhone ? normaliseIndianMobile(input.clinicPhone) ?? input.clinicPhone : null;
    const { duplicateWarning } = await createClaim(target, viewer.userId, {
      authorityId: input.authorityId ?? null,
      registrationNumber: input.registrationNumber ?? null,
      clinicPhone: phone,
      clinicEmail: input.clinicEmail ?? null,
      note: input.note ?? null,
      dispute: input.dispute || target.claimed,
    });
    done(back, { ok: duplicateWarning ? "duplicate" : "submitted" });
  } catch (err) {
    failTo(back, err);
  }
}
