import type { ConditionMeta } from "@/db/schema/content";

/**
 * Structured condition sections rendered before the Markdown body (SEO-04:
 * structured data mirrors visible content). The red-flag box is always shown
 * with a generic urgent-care message; condition-specific flags are appended.
 */

const GENERIC_RED_FLAGS = [
  "Sudden severe pain after a fall or accident, or you cannot bear weight",
  "Numbness around the groin or buttocks, or new loss of bladder or bowel control",
  "Fever, feeling unwell, or redness and heat over the painful area",
  "Chest pain, breathlessness, or a hot, swollen, painful calf",
  "Sudden weakness, facial drooping or trouble speaking",
];

export function RedFlagBox({ flags }: { flags: string[] }) {
  const items = [...flags, ...GENERIC_RED_FLAGS.filter((g) => !flags.some((f) => f.toLowerCase() === g.toLowerCase()))];
  return (
    <aside className="rounded-[var(--r)] border border-alert bg-alert-soft p-4 text-sm" aria-labelledby="red-flags-title">
      <p id="red-flags-title" className="font-semibold text-alert">Seek urgent care if…</p>
      <ul className="mt-2 list-disc pl-5 [&_li]:mt-1">
        {items.map((f, i) => <li key={i}>{f}</li>)}
      </ul>
      <p className="mt-3 text-xs text-ink-2">Call 112 or go to the nearest emergency department. Do not wait for a physiotherapy appointment.</p>
    </aside>
  );
}

const SECTIONS: { key: keyof ConditionMeta; title: string; lead?: string }[] = [
  { key: "symptoms", title: "Common symptoms" },
  { key: "commonCauses", title: "Common causes and risk factors" },
  { key: "whenToSeek", title: "When to see a physiotherapist", lead: "Book an assessment if any of these apply." },
  { key: "physiotherapyHelps", title: "How physiotherapy helps", lead: "Treatment is tailored after assessment; these are the usual aims." },
];

export function ConditionSections({ meta }: { meta: ConditionMeta | null }) {
  if (!meta) return null;
  const present = SECTIONS.filter((s) => Array.isArray(meta[s.key]) && (meta[s.key] as string[]).length);
  if (!present.length) return null;
  return (
    <section id="overview" className="mt-8 scroll-mt-6">
      <h2 className="text-2xl font-semibold">At a glance</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {present.map((s) => (
          <div key={s.key} className="card p-4">
            <h3 className="font-semibold">{s.title}</h3>
            {s.lead ? <p className="mt-1 text-xs text-muted">{s.lead}</p> : null}
            <ul className="mt-2 list-disc pl-5 text-sm [&_li]:mt-1">
              {(meta[s.key] as string[]).map((item, i) => <li key={i}>{item}</li>)}
            </ul>
          </div>
        ))}
      </div>
      {meta.bodyArea ? <p className="mt-3 text-sm text-muted">Body area: {meta.bodyArea}</p> : null}
    </section>
  );
}
