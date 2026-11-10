"use client";

import { useState } from "react";

/** Read-only value with a copy button (falls back to manual select when the clipboard API is unavailable). */
export function CopyField({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex gap-2">
      <input className="input min-w-0 flex-1 font-mono text-xs" readOnly value={value} aria-label={label} onFocus={(e) => e.currentTarget.select()} />
      <button
        type="button"
        className="btn btn-secondary shrink-0 py-2 text-sm"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          } catch {
            setCopied(false);
          }
        }}
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
