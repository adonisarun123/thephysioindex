"use client";

import { useRef, useState } from "react";
import { reviewPhotoAuthAction } from "@/app/review/[token]/actions";
import { checkPhotoFile, PHOTO_ACCEPT, uploadPhoto } from "@/components/photo-upload-client";

/**
 * Optional photos on an invited review. Each chosen photo is uploaded at once
 * and its id carried in a hidden field; the review form's submit records them.
 * The consent tick box belongs to the patient: these are their own photos.
 */
export function ReviewPhotoPicker({ token, max, enabled, consentStatement }: { token: string; max: number; enabled: boolean; consentStatement: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState<{ fileId: string; preview: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  async function onFile(file: File | undefined) {
    setError(null);
    if (!file) return;
    const bad = checkPhotoFile(file);
    if (bad) return setError(bad);
    setBusy(true);
    setProgress(0);
    try {
      const auth = await reviewPhotoAuthAction(token);
      if (!auth.ok) throw new Error(auth.error);
      const fileId = await uploadPhoto(file, auth.data, setProgress);
      setPhotos((cur) => [...cur, { fileId, preview: URL.createObjectURL(file) }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed. Try again.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  if (!enabled) return null;
  return (
    <fieldset>
      <legend className="label">Add photos (optional)</legend>
      <p className="mt-1 text-xs text-muted">Up to {max} photos of your own, for example you doing your exercises. Please do not include other people, reports or scans.</p>
      {photos.length ? (
        <ul className="mt-3 flex flex-wrap gap-3">
          {photos.map((p) => (
            <li key={p.fileId} className="relative">
              <input type="hidden" name="photoFileId" value={p.fileId} />
              {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview */}
              <img src={p.preview} alt="Photo you added" className="h-24 w-24 rounded-[var(--r-sm)] border border-line object-cover" />
              <button type="button" className="mt-1 block text-xs underline" onClick={() => setPhotos((cur) => cur.filter((x) => x.fileId !== p.fileId))}>Remove</button>
            </li>
          ))}
        </ul>
      ) : null}
      <input ref={input} type="file" accept={PHOTO_ACCEPT} className="sr-only" aria-label="Choose a photo" onChange={(e) => onFile(e.target.files?.[0])} disabled={busy} />
      {photos.length < max ? (
        <button type="button" className="btn btn-quiet mt-3 py-1.5 text-sm" disabled={busy} onClick={() => input.current?.click()}>
          {busy ? `Uploading… ${progress}%` : photos.length ? "Add another photo" : "Add a photo"}
        </button>
      ) : null}
      {error ? <p role="alert" className="mt-2 text-sm text-alert">{error}</p> : null}
      {photos.length ? (
        <label className="mt-3 flex items-start gap-2 text-sm">
          <input type="checkbox" name="photoConsent" className="mt-0.5" required />
          <span>{consentStatement}</span>
        </label>
      ) : null}
    </fieldset>
  );
}
