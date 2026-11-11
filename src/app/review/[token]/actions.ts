"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ApiError } from "@/lib/api";
import { getViewer } from "@/lib/auth/session";
import { imageKitEnabled, reviewPhotoFolder, uploadAuth } from "@/lib/media/imagekit";
import { removeOwnReviewPhoto, resolveInvitation, submitInvitedReview, withdrawInvitedReview } from "@/lib/review-invitations";
import { bool, done, failTo, list, str } from "@/lib/workspace/forms";

/**
 * Patient side of an invited review. Every action needs a signed-in account
 * (one-time code) and a valid, unused link; the practitioner is taken from
 * the link on the server, never from the form.
 */

type Result<T> = { ok: true; data: T } | { ok: false; error: string };
const page = (token: string) => `/review/${encodeURIComponent(token)}`;

export async function reviewPhotoAuthAction(token: string): Promise<Result<{ token: string; expire: number; signature: string; publicKey: string; folder: string; fileName: string }>> {
  try {
    const viewer = await getViewer();
    if (!viewer) throw new ApiError("UNAUTHENTICATED", "Sign in to add photos");
    if (!imageKitEnabled()) throw new ApiError("FEATURE_DISABLED", "Photo upload is not switched on yet");
    const inv = await resolveInvitation(String(token ?? ""));
    if (!inv || inv.status !== "open") throw new ApiError("CONFLICT", "This review link is no longer active");
    return { ok: true, data: { ...uploadAuth(), folder: reviewPhotoFolder(inv.id), fileName: "review-photo" } };
  } catch (err) {
    if (err instanceof ApiError) return { ok: false, error: err.message };
    console.error("[review-photo]", err);
    return { ok: false, error: "Something went wrong. Try again." };
  }
}

export async function submitInvitedReviewAction(formData: FormData) {
  const token = str(formData, "token");
  try {
    const viewer = await getViewer();
    if (!viewer) throw new ApiError("UNAUTHENTICATED", "Sign in to send your review");
    await submitInvitedReview(viewer.userId, token, {
      rating: str(formData, "rating"),
      text: str(formData, "text"),
      displayName: str(formData, "displayName"),
      confirmedGenuine: bool(formData, "confirmedGenuine"),
      photoFileIds: list(formData, "photoFileId"),
      photoConsent: bool(formData, "photoConsent"),
    });
    revalidatePath("/admin", "layout");
  } catch (err) {
    if (err instanceof z.ZodError) failTo(page(token), new ApiError("INVALID_INPUT", err.issues[0]?.message ?? "Check the form and try again"));
    failTo(page(token), err);
  }
  done(page(token), { ok: "submitted" });
}

export async function withdrawInvitedReviewAction(formData: FormData) {
  const token = str(formData, "token");
  try {
    const viewer = await getViewer();
    if (!viewer) throw new ApiError("UNAUTHENTICATED", "Sign in to continue");
    await withdrawInvitedReview(viewer.userId, str(formData, "reviewId"));
  } catch (err) {
    failTo(page(token), err);
  }
  done(page(token), { ok: "withdrawn" });
}

export async function removeReviewPhotoAction(formData: FormData) {
  const token = str(formData, "token");
  try {
    const viewer = await getViewer();
    if (!viewer) throw new ApiError("UNAUTHENTICATED", "Sign in to continue");
    await removeOwnReviewPhoto(viewer.userId, str(formData, "photoId"));
  } catch (err) {
    failTo(page(token), err);
  }
  done(page(token), { ok: "photo_removed" });
}
