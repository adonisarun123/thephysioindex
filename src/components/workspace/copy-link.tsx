"use client";

import { useState } from "react";

/** A link the physiotherapist can copy to send to a patient themselves. */
export function CopyLink({ url, compact }: { url: string; compact?: boolean }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }
  if (compact) return <button type="button" className="btn btn-quiet py-1.5 text-sm" onClick={copy} aria-live="polite">{copied ? "Copied" : "Copy link"}</button>;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <input readOnly value={url} aria-label="Review link" className="input min-w-0 flex-1 py-1.5 text-xs" onFocus={(e) => e.currentTarget.select()} />
      <button type="button" className="btn btn-quiet py-1.5 text-sm" onClick={copy} aria-live="polite">{copied ? "Copied" : "Copy link"}</button>
    </div>
  );
}
