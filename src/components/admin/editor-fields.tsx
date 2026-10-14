"use client";

import { useState, useTransition } from "react";
import type { FaqItem, SourceRef } from "@/db/schema/content";
import type { PractitionerOption } from "@/lib/content/constants";
import { searchPractitionersForEditor } from "@/lib/content/actions";

/** Repeatable rows and the author picker for the content editor. Field names match formToArticleInput. */

export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
      {error ? <p className="mt-1 text-xs text-alert">{error}</p> : null}
    </div>
  );
}

export function FaqRows({ initial }: { initial: FaqItem[] }) {
  const [rows, setRows] = useState<FaqItem[]>(initial.length ? initial : []);
  return (
    <div className="grid gap-3">
      {rows.map((r, i) => (
        <div key={i} className="card grid gap-2 p-3">
          <input name="faq_q" className="input py-1.5" placeholder="Question" value={r.question} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, question: e.target.value } : x)))} />
          <textarea name="faq_a" className="input min-h-20 py-1.5" placeholder="Answer (Markdown: paragraphs, lists, links)" value={r.answer} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, answer: e.target.value } : x)))} />
          <button type="button" className="btn btn-quiet w-fit py-1 text-xs" onClick={() => setRows(rows.filter((_, j) => j !== i))}>Remove</button>
        </div>
      ))}
      <button type="button" className="btn btn-secondary w-fit py-1.5 text-sm" onClick={() => setRows([...rows, { question: "", answer: "" }])}>Add FAQ</button>
    </div>
  );
}

export function SourceRows({ initial }: { initial: SourceRef[] }) {
  const [rows, setRows] = useState<SourceRef[]>(initial);
  const upd = (i: number, patch: Partial<SourceRef>) => setRows(rows.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  return (
    <div className="grid gap-3">
      {rows.map((r, i) => (
        <div key={i} className="card grid gap-2 p-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
          <input name="src_title" className="input py-1.5" placeholder="Title" value={r.title} onChange={(e) => upd(i, { title: e.target.value })} />
          <input name="src_url" className="input py-1.5" placeholder="https://…" value={r.url} onChange={(e) => upd(i, { url: e.target.value })} inputMode="url" />
          <input name="src_publisher" className="input py-1.5" placeholder="Publisher (optional)" value={r.publisher ?? ""} onChange={(e) => upd(i, { publisher: e.target.value })} />
          <button type="button" className="btn btn-quiet py-1 text-xs" onClick={() => setRows(rows.filter((_, j) => j !== i))}>Remove</button>
        </div>
      ))}
      <button type="button" className="btn btn-secondary w-fit py-1.5 text-sm" onClick={() => setRows([...rows, { title: "", url: "" }])}>Add source</button>
    </div>
  );
}

export function PractitionerPicker({ initialId, initialName }: { initialId: string | null; initialName: string | null }) {
  const [picked, setPicked] = useState<{ id: string; name: string } | null>(initialId ? { id: initialId, name: initialName ?? initialId } : null);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<PractitionerOption[]>([]);
  const [pending, start] = useTransition();
  return (
    <div className="grid gap-2">
      <input type="hidden" name="author_practitioner_id" value={picked?.id ?? ""} />
      {picked ? (
        <p className="flex items-center gap-2 text-sm">
          <span className="pill bg-brand-soft text-brand-ink">{picked.name}</span>
          <button type="button" className="underline" onClick={() => setPicked(null)}>Clear</button>
        </p>
      ) : (
        <p className="text-sm text-muted">No practitioner author linked.</p>
      )}
      <div className="flex gap-2">
        <input className="input py-1.5" placeholder="Search practitioners by name" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); start(async () => setResults(await searchPractitionersForEditor(q))); } }} />
        <button type="button" className="btn btn-quiet py-1.5" disabled={pending || q.trim().length < 2} onClick={() => start(async () => setResults(await searchPractitionersForEditor(q)))}>
          {pending ? "Searching…" : "Search"}
        </button>
      </div>
      {results.length ? (
        <ul className="card divide-y divide-line text-sm">
          {results.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 px-3 py-2">
              <span>
                {r.displayName}
                <span className="text-muted"> {r.where ? `· ${r.where}` : ""} · {r.listingStatus}</span>
              </span>
              <button type="button" className="underline" onClick={() => { setPicked({ id: r.id, name: r.displayName }); setResults([]); }}>Select</button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
