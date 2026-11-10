"use client";

import { useMemo, useState } from "react";

/**
 * Exercise plan builder (HEP-02). Pick from the library, set the dose, reorder.
 * The selection is posted as items[n].field rows; the server re-validates
 * every exercise id against the practitioner's scope (IAM-01).
 */

export type BuilderExercise = {
  id: string;
  name: string;
  bodyRegion: string;
  instructions: string;
  defaultSets: number | null;
  defaultReps: number | null;
  defaultHoldSeconds: number | null;
  defaultFrequency: string | null;
  custom: boolean;
};

export type BuilderItem = { exerciseId: string; sets: string; reps: string; holdSeconds: string; frequency: string; note: string };

const s = (n: number | null) => (n == null ? "" : String(n));

export function PlanBuilder({ exercises, regions, initial, max }: { exercises: BuilderExercise[]; regions: { key: string; label: string }[]; initial: BuilderItem[]; max: number }) {
  const byId = useMemo(() => new Map(exercises.map((e) => [e.id, e])), [exercises]);
  const [items, setItems] = useState<BuilderItem[]>(initial);
  const [query, setQuery] = useState("");
  const [region, setRegion] = useState("");

  const chosen = new Set(items.map((i) => i.exerciseId));
  const q = query.trim().toLowerCase();
  const visible = exercises.filter((e) => (!region || e.bodyRegion === region) && (!q || e.name.toLowerCase().includes(q)));
  const regionLabel = (k: string) => regions.find((r) => r.key === k)?.label ?? k;

  function add(e: BuilderExercise) {
    if (chosen.has(e.id) || items.length >= max) return;
    setItems([...items, { exerciseId: e.id, sets: s(e.defaultSets), reps: s(e.defaultReps), holdSeconds: s(e.defaultHoldSeconds), frequency: e.defaultFrequency ?? "", note: "" }]);
  }
  function update(idx: number, patch: Partial<BuilderItem>) {
    setItems(items.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }
  function move(idx: number, by: -1 | 1) {
    const j = idx + by;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[idx], next[j]] = [next[j], next[idx]];
    setItems(next);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div>
        <p className="label">Exercise library</p>
        <div className="flex flex-wrap gap-2">
          <input type="search" className="input min-w-0 flex-1" placeholder="Search exercises" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search exercises" />
          <select className="input w-auto" value={region} onChange={(e) => setRegion(e.target.value)} aria-label="Body region">
            <option value="">All regions</option>
            {regions.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
          </select>
        </div>
        <ul className="mt-3 max-h-[28rem] divide-y divide-line overflow-y-auto rounded-[var(--r-sm)] border border-line text-sm">
          {visible.length === 0 ? <li className="p-3 text-muted">No exercises match.</li> : visible.map((e) => (
            <li key={e.id} className="flex items-start justify-between gap-3 p-3">
              <div className="min-w-0">
                <p className="font-medium">{e.name}{e.custom ? <span className="pill ml-2 bg-mark-soft text-ink-2">Yours</span> : null}</p>
                <p className="text-xs text-muted">{regionLabel(e.bodyRegion)}</p>
              </div>
              <button type="button" className="btn btn-quiet shrink-0 py-1 text-xs" onClick={() => add(e)} disabled={chosen.has(e.id) || items.length >= max}>
                {chosen.has(e.id) ? "Added" : "Add"}
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <p className="label">In this plan ({items.length}/{max})</p>
        {items.length === 0 ? (
          <p className="rounded-[var(--r-sm)] border border-dashed border-line-strong p-4 text-sm text-muted">Add exercises from the library. You can change the dose for this patient.</p>
        ) : (
          <ol className="grid gap-3">
            {items.map((it, idx) => {
              const e = byId.get(it.exerciseId);
              const p = `items[${idx}]`;
              return (
                <li key={it.exerciseId} className="rounded-[var(--r-sm)] border border-line p-3 text-sm">
                  <input type="hidden" name={`${p}.exerciseId`} value={it.exerciseId} />
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium">{idx + 1}. {e?.name ?? "Exercise"}</p>
                    <div className="flex shrink-0 gap-1">
                      <button type="button" className="btn btn-quiet px-2 py-0.5 text-xs" onClick={() => move(idx, -1)} disabled={idx === 0} aria-label="Move up">↑</button>
                      <button type="button" className="btn btn-quiet px-2 py-0.5 text-xs" onClick={() => move(idx, 1)} disabled={idx === items.length - 1} aria-label="Move down">↓</button>
                      <button type="button" className="btn btn-quiet px-2 py-0.5 text-xs" onClick={() => setItems(items.filter((_, i) => i !== idx))}>Remove</button>
                    </div>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    <label className="text-xs text-muted">Sets<input name={`${p}.sets`} className="input mt-0.5" inputMode="numeric" value={it.sets} onChange={(ev) => update(idx, { sets: ev.target.value })} /></label>
                    <label className="text-xs text-muted">Reps<input name={`${p}.reps`} className="input mt-0.5" inputMode="numeric" value={it.reps} onChange={(ev) => update(idx, { reps: ev.target.value })} /></label>
                    <label className="text-xs text-muted">Hold (s)<input name={`${p}.holdSeconds`} className="input mt-0.5" inputMode="numeric" value={it.holdSeconds} onChange={(ev) => update(idx, { holdSeconds: ev.target.value })} /></label>
                  </div>
                  <label className="mt-2 block text-xs text-muted">How often<input name={`${p}.frequency`} className="input mt-0.5" maxLength={80} value={it.frequency} onChange={(ev) => update(idx, { frequency: ev.target.value })} placeholder="e.g. Twice a day" /></label>
                  <label className="mt-2 block text-xs text-muted">Note for the patient (optional)<input name={`${p}.note`} className="input mt-0.5" maxLength={300} value={it.note} onChange={(ev) => update(idx, { note: ev.target.value })} placeholder="e.g. Stop if pain goes above 5/10" /></label>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
}
