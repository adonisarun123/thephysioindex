"use client";

/** Opens the browser print dialog (save as PDF or print). Hidden in the printout itself. */
export function PrintButton({ label = "Print or save as PDF" }: { label?: string }) {
  return (
    <button type="button" className="btn btn-primary py-2 text-sm print:hidden" onClick={() => window.print()}>
      {label}
    </button>
  );
}
