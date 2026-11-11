"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ApiError } from "@/lib/api";
import { imageKitEnabled, patientPhotoFolder, uploadAuth } from "@/lib/media/imagekit";
import { addPractitionerPhoto, removeOwnPhoto } from "@/lib/treatment-photos";
import { requireManage } from "@/lib/workspace/context";
import { done, failTo, str } from "@/lib/workspace/forms";

/**
 * Patient photos for the public profile. Step 1 signs a browser upload into
 * this practitioner's own folder; step 2 records the file after re-reading it
 * from ImageKit, with the consent declaration. Both re-check management rights (IAM-01).
 */

const PAGE = "/workspace/photos";
type Result<T> = { ok: true; data: T } | { ok: false; error: string };

function fail(err: unknown): { ok: false; error: string } {
  if (err instanceof ApiError) return { ok: false, error: err.message };
  if (err instanceof z.ZodError) return { ok: false, error: err.issues[0]?.message ?? "Invalid input" };
  console.error("[patient-photo]", err);
  return { ok: false, error: "Something went wrong. Try again." };
}

export async function patientPhotoAuthAction(): Promise<Result<{ token: string; expire: number; signature: string; publicKey: string; folder: string; fileName: string }>> {
  try {
    const { practitioner } = await requireManage();
    if (!imageKitEnabled()) throw new ApiError("FEATURE_DISABLED", "Photo upload is not switched on yet");
    if (practitioner.listingStatus !== "published") throw new ApiError("CONFLICT", "Patient photos can be added once your profile is approved and published");
    return { ok: true, data: { ...uploadAuth(), folder: patientPhotoFolder(practitioner.publicId), fileName: `${practitioner.publicId}-patient` } };
  } catch (err) {
    return fail(err);
  }
}

const SaveInput = z.object({ fileId: z.string().min(6).max(64), caption: z.string().max(200).optional(), consentDeclared: z.literal(true, "Confirm that you hold the patient's written consent") });

export async function addPatientPhotoAction(input: { fileId: string; caption?: string; consentDeclared: boolean }): Promise<Result<null>> {
  try {
    const { viewer, practitioner } = await requireManage();
    const parsed = SaveInput.parse(input);
    await addPractitionerPhoto({ id: practitioner.id, publicId: practitioner.publicId, listingStatus: practitioner.listingStatus }, viewer.userId, { fileId: parsed.fileId, caption: parsed.caption, consentDeclared: true });
    revalidatePath(PAGE);
    return { ok: true, data: null };
  } catch (err) {
    return fail(err);
  }
}

export async function removePatientPhotoAction(formData: FormData) {
  try {
    const { viewer, practitioner } = await requireManage();
    await removeOwnPhoto(practitioner.id, viewer.userId, str(formData, "photoId"));
    revalidatePath(PAGE);
    revalidatePath(`/physiotherapist/${practitioner.slug}-${practitioner.publicId}`);
  } catch (err) {
    failTo(PAGE, err);
  }
  done(PAGE, { ok: "Photo removed. It is no longer on your profile and has been deleted." });
}
