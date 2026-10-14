import Link from "next/link";
import type { ArticleSummary } from "@/lib/content/public";

export const LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z", "0-9"];

export function letterOf(title: string): string {
  const c = title.trim().charAt(0).toUpperCase();
  return /[0-9]/.test(c) ? "0-9" : /[A-Z]/.test(c) ? c : "0-9";
}

/** A–Z strip: letters with no published conditions are shown but not linked (SEO-02: no empty pages). */
export function LetterStrip({ counts, active }: { counts: Record<string, number>; active?: string }) {
  return (
    <nav aria-label="Browse conditions by letter" className="mt-6 flex flex-wrap gap-1.5 text-sm">
      {LETTERS.map((l) => {
        const n = counts[l] ?? 0;
        const isActive = active === l;
        return n > 0 ? (
          <Link key={l} href={`/conditions/browse/${l.toLowerCase()}`} aria-current={isActive ? "page" : undefined} className={`inline-flex h-9 min-w-9 items-center justify-center rounded-[var(--r-sm)] border px-2 font-medium ${isActive ? "border-brand bg-brand text-white" : "border-line bg-surface hover:border-brand"}`}>
            {l}
          </Link>
        ) : (
          <span key={l} aria-disabled className="inline-flex h-9 min-w-9 items-center justify-center rounded-[var(--r-sm)] border border-line px-2 text-muted opacity-60">{l}</span>
        );
      })}
    </nav>
  );
}

export function ConditionGroups({ items }: { items: ArticleSummary[] }) {
  const groups = new Map<string, ArticleSummary[]>();
  for (const a of items) {
    const l = letterOf(a.title);
    groups.set(l, [...(groups.get(l) ?? []), a]);
  }
  return (
    <div className="mt-8 grid gap-8">
      {LETTERS.filter((l) => groups.has(l)).map((l) => (
        <section key={l} id={`letter-${l.toLowerCase()}`} className="scroll-mt-6">
          <h2 className="text-xl font-semibold">{l}</h2>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {groups.get(l)!.map((a) => (
              <li key={a.id} className="card p-4">
                <Link href={a.path} className="font-medium hover:underline">{a.title}</Link>
                {a.dek ? <p className="mt-1 line-clamp-2 text-sm text-muted">{a.dek}</p> : null}
                <p className="mt-2 text-xs text-muted">{a.reviewed ? "Clinically reviewed" : "Not yet clinically reviewed"}</p>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
