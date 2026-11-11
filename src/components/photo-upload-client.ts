"use client";

import { ImageKitAbortError, ImageKitInvalidRequestError, ImageKitServerError, ImageKitUploadNetworkError, upload } from "@imagekit/next";

/**
 * Browser side of a photo upload, shared by the patient-photo gallery and the
 * review form. Same steps as the profile photo: shrink to ≤1600 px JPEG in the
 * browser (which also drops EXIF/GPS), then send straight to ImageKit with a
 * short-lived signature from the server. The server re-reads the file before
 * recording anything.
 */

export const PHOTO_ACCEPT = "image/jpeg,image/png,image/webp";
const RAW_MAX = 25 * 1024 * 1024;
const PRE_TRANSFORM = "w-1600,h-1600,c-at_max,q-85";

export type UploadAuth = { token: string; expire: number; signature: string; publicKey: string; folder: string; fileName: string };

async function shrink(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * scale);
  const h = Math.round(bmp.height * scale);
  if (Math.min(w, h) < 300) throw new Error("This photo is too small. Use one at least 300 pixels on each side.");
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Your browser could not read this photo");
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  return await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not prepare the photo"))), "image/jpeg", 0.88));
}

export function checkPhotoFile(file: File): string | null {
  if (!PHOTO_ACCEPT.split(",").includes(file.type)) return "Use a JPG, PNG or WebP photo";
  if (file.size > RAW_MAX) return "That file is too large. Choose a photo under 25 MB.";
  return null;
}

/** Uploads one photo and returns ImageKit's fileId. Throws an Error with a message fit to show. */
export async function uploadPhoto(file: File, auth: UploadAuth, onProgress: (percent: number) => void, signal?: AbortSignal): Promise<string> {
  try {
    const blob = await shrink(file);
    const res = await upload({
      file: blob,
      fileName: `${auth.fileName}.jpg`,
      folder: auth.folder,
      useUniqueFileName: true,
      transformation: { pre: PRE_TRANSFORM },
      token: auth.token,
      expire: auth.expire,
      signature: auth.signature,
      publicKey: auth.publicKey,
      onProgress: (e) => onProgress(Math.round((e.loaded / e.total) * 100)),
      abortSignal: signal,
    });
    if (!res.fileId) throw new Error("Upload did not complete. Try again.");
    return res.fileId;
  } catch (err) {
    if (err instanceof ImageKitAbortError) throw new Error("Upload cancelled");
    if (err instanceof ImageKitUploadNetworkError) throw new Error("Network problem. Check your connection and try again.");
    if (err instanceof ImageKitInvalidRequestError || err instanceof ImageKitServerError) throw new Error("The image service rejected this photo. Try another one.");
    throw err instanceof Error ? err : new Error("Upload failed. Try again.");
  }
}
