"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ApiError } from "@/lib/api";
import { imageKitEnabled, practitionerFolder, uploadAuth } from "@/lib/media/imagekit";
import { requireManage } from "@/lib/workspace/context";
import { saveProfilePhoto } from "@/lib/workspace/photo";

/**
 * Profile photo upload (PRO-12; ImageKit, owner request 11 Nov 2026).
 * Step 1 signs a browser upload into this practitioner's own folder.
 * Step 2 records the uploaded file after re-reading it from ImageKit.
 * Both re-check management rights server-side (IAM-01).
 */

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

function fail(err: unknown): { ok: false; error: string } {
  if (err instanceof ApiError) return { ok: false, error: err.message };
  if (err instanceof z.ZodError) return { ok: false, error: err.issues[0]?.message ?? "Invalid input" };
  console.error("[photo]", err);
  return { ok: false, error: "Something went wrong. Try again." };
}

export async function photoUploadAuthAction(): Promise<Result<{ token: string; expire: number; signature: string; publicKey: string; folder: string; fileName: string }>> {
  try {
    const { practitioner } = await requireManage();
    if (!imageKitEnabled()) throw new ApiError("FEATURE_DISABLED", "Photo upload is not switched on yet");
    return { ok: true, data: { ...uploadAuth(), folder: practitionerFolder(practitioner.publicId, "profile_photo"), fileName: `${practitioner.publicId}-photo` } };
  } catch (err) {
    return fail(err);
  }
}

const SaveInput = z.object({ fileId: z.string().min(6).max(64), ownershipConfirmed: z.literal(true, "Confirm the photo is of you and you may use it") });

export async function savePhotoAction(input: { fileId: string; ownershipConfirmed: boolean }): Promise<Result<null>> {
  try {
    const { viewer, practitioner } = await requireManage();
    const { fileId } = SaveInput.parse(input);
    await saveProfilePhoto(practitioner, viewer.userId, { fileId, ownershipConfirmed: true });
    revalidatePath("/workspace", "layout");
    return { ok: true, data: null };
  } catch (err) {
    return fail(err);
  }
}
