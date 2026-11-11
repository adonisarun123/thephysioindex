"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { addPatientPhotoAction, patientPhotoAuthAction } from "@/app/workspace/(app)/photos/actions";
import { checkPhotoFile, PHOTO_ACCEPT, uploadPhoto } from "@/components/photo-upload-client";

/**
 * Adds one patient photo to the practitioner's gallery. The file picker stays
 * locked until the consent declaration is ticked; the wording shown is the
 * wording stored with the photo.
 */
export function PatientPhotoUploader({ enabled, disabledReason, consentStatement, remaining }: { enabled: boolean; disabledReason?: string; consentStatement: string; remaining: number }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const abort = useRef<AbortController | null>(null);
  const [declared, setDeclared] = useState(false);
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function onFile(file: File | undefined) {
    setMessage(null);
    if (!file) return;
    const bad = checkPhotoFile(file);
    if (bad) return setMessage({ ok: false, text: bad });
    setBusy(true);
    setProgress(0);
    try {
      const auth = await patientPhotoAuthAction();
      if (!auth.ok) throw new Error(auth.error);
      abort.current = new AbortController();
      const fileId = await uploadPhoto(file, auth.data, setProgress, abort.current.signal);
      const saved = await addPatientPhotoAction({ fileId, caption: caption.trim() || undefined, consentDeclared: declared });
      if (!saved.ok) throw new Error(saved.error);
      setMessage({ ok: true, text: "Photo saved. It appears on your profile once our team has checked it." });
      setCaption("");
      setDeclared(false);
      router.refresh();
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : "Upload failed. Try again." });
    } finally {
      setBusy(false);
      abort.current = null;
      if (input.current) input.current.value = "";
    }
  }

  if (!enabled) return <p className="rounded-[var(--r-sm)] border border-dashed border-line-strong p-4 text-sm text-muted">{disabledReason}</p>;
  if (remaining <= 0) return <p className="rounded-[var(--r-sm)] border border-dashed border-line-strong p-4 text-sm text-muted">Your gallery is full. Remove a photo to add another.</p>;

  return (
    <div className="grid gap-3 text-sm">
      <div>
        <label className="label" htmlFor="pp-caption">Caption (optional)</label>
        <input id="pp-caption" className="input" maxLength={140} value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Balance training after knee surgery" disabled={busy} />
        <p className="mt-1 text-xs text-muted">Describe the activity, not the person. No names, phone numbers or promised results.</p>
      </div>
      <label className="flex items-start gap-2">
        <input type="checkbox" className="mt-0.5" checked={declared} onChange={(e) => setDeclared(e.target.checked)} disabled={busy} />
        <span>{consentStatement}</span>
      </label>
      <input ref={input} type="file" accept={PHOTO_ACCEPT} className="sr-only" aria-label="Choose a patient photo" onChange={(e) => onFile(e.target.files?.[0])} disabled={busy || !declared} />
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn btn-primary py-2 text-sm" disabled={busy || !declared} onClick={() => input.current?.click()}>
          {busy ? `Uploading… ${progress}%` : "Choose photo"}
        </button>
        {busy ? <button type="button" className="btn btn-quiet py-2 text-sm" onClick={() => abort.current?.abort()}>Cancel</button> : null}
        {!declared && !busy ? <span className="text-xs text-muted">Tick the consent box to choose a photo.</span> : null}
      </div>
      {message ? <p role={message.ok ? "status" : "alert"} className={message.ok ? "text-muted" : "text-alert"}>{message.text}</p> : null}
    </div>
  );
}
