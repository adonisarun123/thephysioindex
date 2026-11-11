"use client";

import { ImageKitAbortError, ImageKitInvalidRequestError, ImageKitServerError, ImageKitUploadNetworkError, upload } from "@imagekit/next";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { photoUploadAuthAction, savePhotoAction } from "@/app/workspace/photo-actions";

/**
 * Profile photo picker (PRO-12). Works inside or outside a <form>: it never
 * submits the surrounding form and its inputs carry no `name`.
 *
 * The browser shrinks the photo to ≤1200 px JPEG before upload (phone photos are
 * often 4–8 MB on slow connections; re-encoding also drops EXIF/GPS), uploads it
 * straight to ImageKit with a signature from the server, then asks the server to
 * record it. ImageKit re-encodes again on its side (PHOTO_PRE_TRANSFORM).
 */

const ACCEPT = "image/jpeg,image/png,image/webp";
const RAW_MAX = 25 * 1024 * 1024;
const PRE_TRANSFORM = "w-1200,h-1200,c-at_max,q-85"; // keep in step with PHOTO_PRE_TRANSFORM

type Props = {
  displayName: string;
  publishedUrl: string | null;
  pending: { url: string | null; state: "pending" | "rejected" } | null;
  enabled: boolean;
  compact?: boolean;
};

async function shrink(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1200 / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * scale);
  const h = Math.round(bmp.height * scale);
  if (Math.min(w, h) < 200) throw new Error("This photo is too small. Use one at least 200 × 200 pixels.");
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Your browser could not read this photo");
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  return await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not prepare the photo"))), "image/jpeg", 0.88));
}

function initials(name: string) {
  return name.split(/\s+/).filter((w) => !/^dr\.?$/i.test(w)).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");
}

export function PhotoUploader({ displayName, publishedUrl, pending, enabled, compact }: Props) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const abort = useRef<AbortController | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const shown = preview ?? (pending?.state === "pending" ? pending.url : null) ?? publishedUrl;
  const status = busy
    ? `Uploading… ${progress}%`
    : pending?.state === "pending" || preview
      ? publishedUrl
        ? "New photo saved. It replaces your current one once our team has checked it."
        : "Photo saved. It appears on your profile once we verify it."
      : pending?.state === "rejected"
        ? "Our team could not use your last photo. Please upload a clear photo of your face."
        : publishedUrl
          ? "This photo is live on your profile."
          : "No photo yet. Profiles with a photo get noticeably more enquiries.";

  async function onFile(file: File | undefined) {
    setError(null);
    if (!file) return;
    if (!ACCEPT.split(",").includes(file.type)) return setError("Use a JPG, PNG or WebP photo");
    if (file.size > RAW_MAX) return setError("That file is too large. Choose a photo under 25 MB.");
    setBusy(true);
    setProgress(0);
    const local = URL.createObjectURL(file);
    try {
      const blob = await shrink(file);
      const auth = await photoUploadAuthAction();
      if (!auth.ok) throw new Error(auth.error);
      abort.current = new AbortController();
      const res = await upload({
        file: blob,
        fileName: `${auth.data.fileName}.jpg`,
        folder: auth.data.folder,
        useUniqueFileName: true,
        transformation: { pre: PRE_TRANSFORM },
        token: auth.data.token,
        expire: auth.data.expire,
        signature: auth.data.signature,
        publicKey: auth.data.publicKey,
        onProgress: (e) => setProgress(Math.round((e.loaded / e.total) * 100)),
        abortSignal: abort.current.signal,
      });
      if (!res.fileId) throw new Error("Upload did not complete. Try again.");
      const saved = await savePhotoAction({ fileId: res.fileId, ownershipConfirmed: confirmed });
      if (!saved.ok) throw new Error(saved.error);
      setPreview(local);
      router.refresh();
    } catch (err) {
      URL.revokeObjectURL(local);
      if (err instanceof ImageKitAbortError) setError("Upload cancelled");
      else if (err instanceof ImageKitUploadNetworkError) setError("Network problem. Check your connection and try again.");
      else if (err instanceof ImageKitInvalidRequestError || err instanceof ImageKitServerError) setError("The image service rejected this photo. Try another one.");
      else setError(err instanceof Error ? err.message : "Upload failed. Try again.");
    } finally {
      setBusy(false);
      abort.current = null;
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className={compact ? "" : "card p-5"}>
      <p className="font-semibold">Profile photo</p>
      <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="relative h-28 w-28 shrink-0 overflow-hidden rounded-[20px] bg-brand-soft">
          {shown ? (
            // eslint-disable-next-line @next/next/no-img-element -- ImageKit URL already sized; blob: previews cannot use next/image
            <img src={shown} alt={`${displayName}, physiotherapist`} className="h-full w-full object-cover" />
          ) : (
            <div aria-hidden className="flex h-full w-full items-center justify-center text-3xl font-semibold text-brand-ink">{initials(displayName)}</div>
          )}
          {busy ? <div className="absolute inset-x-0 bottom-0 h-1.5 bg-black/10"><div className="h-full bg-brand transition-[width]" style={{ width: `${progress}%` }} /></div> : null}
        </div>
        <div className="grid gap-2 text-sm">
          {!enabled ? (
            <p className="text-muted">Photo upload is being switched on. You can add your photo from your workspace soon.</p>
          ) : (
            <>
              <p className="text-muted">A clear, recent photo of your face, on a plain background. No logos, text, certificates or patients.</p>
              <label className="flex items-start gap-2">
                <input type="checkbox" className="mt-0.5" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} disabled={busy} />
                <span>This is a photo of me and I have the right to use it</span>
              </label>
              <input ref={input} type="file" accept={ACCEPT} className="sr-only" aria-label="Choose a profile photo" onChange={(e) => onFile(e.target.files?.[0])} disabled={busy || !confirmed} />
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn btn-secondary py-2 text-sm" disabled={busy || !confirmed} onClick={() => input.current?.click()}>
                  {busy ? "Uploading…" : shown ? "Change photo" : "Upload photo"}
                </button>
                {busy ? <button type="button" className="btn btn-quiet py-2 text-sm" onClick={() => abort.current?.abort()}>Cancel</button> : null}
              </div>
              {!confirmed && !busy ? <p className="text-xs text-muted">Tick the box above to choose a photo. On a phone you can take one with the camera.</p> : null}
            </>
          )}
          <p role="status" aria-live="polite" className={error ? "text-alert" : "text-muted"}>{error ?? status}</p>
        </div>
      </div>
    </div>
  );
}
