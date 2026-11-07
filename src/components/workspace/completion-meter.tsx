import Link from "next/link";
import { completionPercent, type CompletionItem } from "@/lib/workspace/completion";

/** Profile completion meter (PRO-03): one checklist, the same everywhere. */
export function CompletionMeter({ items, compact = false }: { items: CompletionItem[]; compact?: boolean }) {
  const pct = completionPercent(items);
  const left = items.filter((i) => !i.done).length;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-2xl font-semibold tracking-tight">{pct}%</p>
        <p className="text-sm text-muted">{left === 0 ? "Complete. Submit for verification." : `${left} step${left === 1 ? "" : "s"} to go`}</p>
      </div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-label="Profile completion" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full bg-brand transition-[width]" style={{ width: `${pct}%` }} />
      </div>
      <ul className={`mt-3 grid gap-1.5 text-sm ${compact ? "" : "sm:grid-cols-2 sm:gap-x-6"}`}>
        {items.map((i) => (
          <li key={i.key} className="flex items-center justify-between gap-3">
            <span className={i.done ? "text-muted" : undefined}>
              <span aria-hidden className={`mr-2 inline-block w-4 ${i.done ? "text-brand" : "text-muted"}`}>{i.done ? "✓" : "○"}</span>
              {i.label}
            </span>
            {i.done ? <span className="sr-only">done</span> : <Link href={i.href} className="text-xs underline">Add</Link>}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-muted">At 100% you can submit your profile. We verify your registration, then your profile goes live and patients can book you.</p>
    </div>
  );
}
