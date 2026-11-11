"use server";

import { revalidatePath } from "next/cache";
import { ApiError } from "@/lib/api";
import { listServiceOptions } from "@/lib/workspace/catalog";
import { requireManage } from "@/lib/workspace/context";
import { FinishSchema, finishProfile } from "@/lib/workspace/finish";
import { done, failTo, list, rupeesToPaise, str } from "@/lib/workspace/forms";

/**
 * One-screen completion (PRO-03; owner decision 8 Nov 2026). Saves every open
 * checklist item from one form and submits for verification when it reaches 100%.
 */
export async function finishProfileAction(formData: FormData) {
  const PAGE_FINISH = "/workspace/onboarding";
  try {
    const { viewer, practitioner } = await requireManage();
    const has = (k: string) => formData.has(k);
    const fee = has("feeRupees") ? rupeesToPaise(str(formData, "feeRupees")) : undefined;
    if (fee === null) throw new ApiError("INVALID_INPUT", "Enter the fee in rupees, e.g. 600");
    const serviceId = str(formData, "serviceId");
    const services = has("serviceId") ? await listServiceOptions() : [];
    const input = FinishSchema.parse({
      about: has("about") ? str(formData, "about") : undefined,
      primarySpecialtyId: has("primarySpecialtyId") ? str(formData, "primarySpecialtyId") : undefined,
      otherSpecialtyIds: has("primarySpecialtyId") ? list(formData, "otherSpecialtyIds") : undefined,
      languageIds: has("languagesShown") ? list(formData, "languageIds") : undefined,
      service: has("serviceId") ? { serviceId, displayName: services.find((s) => s.id === serviceId)?.label ?? "Physiotherapy session", feePaise: fee } : undefined,
      hours: has("hoursShown") ? { weekdays: list(formData, "weekdays").map(Number), localStart: str(formData, "localStart"), localEnd: str(formData, "localEnd") } : undefined,
      qualification: has("degree") ? { degree: str(formData, "degree"), institution: str(formData, "institution") } : undefined,
      credential: has("authorityId") ? { authorityId: str(formData, "authorityId"), number: str(formData, "registrationNumber") } : undefined,
      consent: has("consentShown") ? formData.get("consent") === "on" : undefined,
      submit: true,
    });
    const res = await finishProfile(practitioner.id, viewer.userId, practitioner.listingStatus, input);
    revalidatePath("/workspace");
    if (res.submitted) done("/workspace", { ok: "Profile submitted for verification. We will email you once it is live." });
    done(PAGE_FINISH, { error: `Saved (${res.percent}%). Still needed: ${res.gaps.join("; ")}` });
  } catch (err) {
    failTo(PAGE_FINISH, err);
  }
}
