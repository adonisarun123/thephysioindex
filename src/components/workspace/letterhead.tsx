import type { Letterhead } from "@/lib/practice/letterhead";

/** Printed header for prescriptions and receipts (RCP-03). */
export function LetterheadBlock({ lh }: { lh: Letterhead }) {
  return (
    <header className="border-b-2 border-ink-2 pb-3">
      <p className="text-xl font-bold">{lh.name}</p>
      {lh.degrees ? <p className="text-sm">{lh.degrees}</p> : null}
      {lh.registration ? <p className="text-sm">{lh.registration}</p> : null}
      {lh.clinicName || lh.address || lh.phone ? (
        <p className="mt-1 text-sm">{[lh.clinicName, lh.address, lh.phone ? `Ph: ${lh.phone}` : null].filter(Boolean).join(" · ")}</p>
      ) : null}
    </header>
  );
}
