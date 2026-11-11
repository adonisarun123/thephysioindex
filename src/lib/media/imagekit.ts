import { createHmac, randomUUID } from "node:crypto";
import { ApiError } from "@/lib/api";

/**
 * ImageKit for PUBLIC profile media (PRO-12; owner decision 11 Nov 2026).
 * Only purposes allowed to be public (`media_assets_private_purposes`) go here:
 * profile and clinic photos. Certificates, identity proof and patient
 * documents stay in the private Blob store (`src/lib/storage.ts`).
 *
 * Env: IMAGEKIT_PUBLIC_KEY, IMAGEKIT_PRIVATE_KEY (server only),
 * NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT (e.g. https://ik.imagekit.io/<id>).
 * Without all three, photo upload is switched off and not counted in completion.
 */

export const PHOTO_MAX_BYTES = 5 * 1024 * 1024;
export const PHOTO_MIME = ["image/jpeg", "image/png", "image/webp"] as const;
/** Applied by ImageKit at upload: the stored original is re-encoded, which drops EXIF/GPS (PRO-12). */
export const PHOTO_PRE_TRANSFORM = "w-1200,h-1200,c-at_max,q-85";

const API = "https://api.imagekit.io/v1";

export function imageKitEndpoint(): string | null {
  const e = process.env.NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT?.trim();
  return e ? e.replace(/\/+$/, "") : null;
}

export function imageKitEnabled(): boolean {
  return Boolean(process.env.IMAGEKIT_PUBLIC_KEY && process.env.IMAGEKIT_PRIVATE_KEY && imageKitEndpoint());
}

function keys() {
  const publicKey = process.env.IMAGEKIT_PUBLIC_KEY;
  const privateKey = process.env.IMAGEKIT_PRIVATE_KEY;
  if (!publicKey || !privateKey || !imageKitEndpoint()) throw new ApiError("FEATURE_DISABLED", "Photo upload is not switched on yet");
  return { publicKey, privateKey };
}

/** Folder each practitioner may upload into. Checked again on save. */
export function practitionerFolder(publicId: string, purpose: "profile_photo" | "clinic_photo") {
  const env = process.env.VERCEL_ENV === "production" ? "prod" : "test";
  return `/${env}/practitioners/${publicId}/${purpose === "profile_photo" ? "profile" : "clinic"}`;
}

/** Short-lived client upload signature (10 minutes). The private key never leaves the server. */
export function uploadAuth() {
  const { publicKey, privateKey } = keys();
  // Same algorithm as getUploadAuthParams in @imagekit/next/server (HMAC-SHA1 of token + expire).
  // Inlined because that subpath exports only "main"/"module" conditions, which plain Node (vitest, scripts) cannot resolve.
  const token = randomUUID();
  const expire = Math.floor(Date.now() / 1000) + 600;
  const signature = createHmac("sha1", privateKey).update(token + expire).digest("hex");
  return { token, expire, signature, publicKey };
}

export type ImageKitFile = { fileId: string; filePath: string; fileType: string; mime: string | null; size: number; width: number | null; height: number | null };

function authHeader(privateKey: string) {
  return `Basic ${Buffer.from(`${privateKey}:`).toString("base64")}`;
}

/** Reads what ImageKit actually stored; never trust the browser's description of the upload. */
export async function getFile(fileId: string): Promise<ImageKitFile | null> {
  const { privateKey } = keys();
  if (!/^[A-Za-z0-9_-]{6,64}$/.test(fileId)) return null;
  const res = await fetch(`${API}/files/${fileId}/details`, { headers: { Authorization: authHeader(privateKey) }, cache: "no-store" });
  if (res.status === 404 || res.status === 400) return null;
  if (!res.ok) throw new ApiError("DEPENDENCY_UNAVAILABLE", "Could not reach the image service. Try again.");
  const j = (await res.json()) as Record<string, unknown>;
  return {
    fileId: String(j.fileId),
    filePath: String(j.filePath),
    fileType: String(j.fileType ?? ""),
    mime: typeof j.mime === "string" ? j.mime : null,
    size: Number(j.size ?? 0),
    width: j.width == null ? null : Number(j.width),
    height: j.height == null ? null : Number(j.height),
  };
}

/** Best effort: a leftover file is harmless (unlisted, never referenced), so failures are logged, not thrown. */
export async function deleteFile(fileId: string | null | undefined): Promise<void> {
  if (!fileId || !imageKitEnabled()) return;
  try {
    const res = await fetch(`${API}/files/${fileId}`, { method: "DELETE", headers: { Authorization: authHeader(keys().privateKey) } });
    if (!res.ok && res.status !== 404) console.error(`[imagekit] delete ${fileId} failed: ${res.status}`);
  } catch (err) {
    console.error("[imagekit] delete failed", err);
  }
}

/** Public delivery URL with a square face-centred crop. Delivery strips metadata by default. */
export function photoUrl(objectKey: string | null | undefined, size = 320): string | null {
  const endpoint = imageKitEndpoint();
  if (!objectKey || !endpoint) return null;
  const path = objectKey.startsWith("/") ? objectKey : `/${objectKey}`;
  return `${endpoint}/tr:w-${size},h-${size},fo-face,q-80${path.split("/").map(encodeURIComponent).join("/")}`;
}

/** Folder for photographs of patients that a practitioner uploads to their own gallery. */
export function patientPhotoFolder(publicId: string) {
  const env = process.env.VERCEL_ENV === "production" ? "prod" : "test";
  return `/${env}/practitioners/${publicId}/patients`;
}

/** Folder for photographs a patient attaches to the review written from one invitation. */
export function reviewPhotoFolder(invitationId: string) {
  const env = process.env.VERCEL_ENV === "production" ? "prod" : "test";
  return `/${env}/reviews/${invitationId}`;
}

/** Public delivery URL scaled to fit a width, uncropped (gallery and review photos). */
export function fitUrl(objectKey: string | null | undefined, width = 800): string | null {
  const endpoint = imageKitEndpoint();
  if (!objectKey || !endpoint) return null;
  const path = objectKey.startsWith("/") ? objectKey : `/${objectKey}`;
  return `${endpoint}/tr:w-${width},c-at_max,q-80${path.split("/").map(encodeURIComponent).join("/")}`;
}
