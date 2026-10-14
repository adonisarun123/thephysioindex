"use client";
import { useState } from "react";
import type { Option } from "@/lib/workspace/catalog";

type Props = { states: Option[]; cities: Option[]; localities: Option[]; selected: { stateId?: string; cityId?: string }; reloadAction: string };

/**
 * State → city → locality selects for a new clinic branch (LOC-01, DIR-08).
 * With JavaScript the next level loads in place; without it, the "Load"
 * button submits a GET round-trip (the server renders the lists).
 */
export function PlaceCascade({ states, cities: initialCities, localities: initialLocalities, selected, reloadAction }: Props) {
  const [stateId, setStateId] = useState(selected.stateId ?? "");
  const [cityId, setCityId] = useState(selected.cityId ?? "");
  const [cities, setCities] = useState<Option[]>(initialCities);
  const [localities, setLocalities] = useState<Option[]>(initialLocalities);
  const [loading, setLoading] = useState<"cities" | "localities" | null>(null);

  async function load(kind: "cities" | "localities", id: string) {
    setLoading(kind);
    try {
      const res = await fetch(`/api/v1/locations?${kind === "cities" ? "stateId" : "cityId"}=${encodeURIComponent(id)}`, { headers: { accept: "application/json" } });
      const body = (await res.json()) as { items?: Option[] };
      const items = Array.isArray(body.items) ? body.items : [];
      if (kind === "cities") setCities(items);
      else setLocalities(items);
    } catch {
      if (kind === "cities") setCities([]);
      else setLocalities([]);
    } finally {
      setLoading(null);
    }
  }

  return (
    <>
      <div>
        <label className="label" htmlFor="stateId">State</label>
        <select id="stateId" name="stateId" className="input" required value={stateId} onChange={(e) => { const v = e.target.value; setStateId(v); setCityId(""); setLocalities([]); if (v) void load("cities", v); else setCities([]); }}>
          <option value="">Select…</option>
          {states.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="cityId">City</label>
        <select id="cityId" name="cityId" className="input" required value={cityId} disabled={!stateId || loading === "cities"} onChange={(e) => { const v = e.target.value; setCityId(v); if (v) void load("localities", v); else setLocalities([]); }}>
          <option value="">{loading === "cities" ? "Loading…" : stateId ? "Select…" : "Choose a state first"}</option>
          {cities.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="localityId">Locality</label>
        <select id="localityId" name="localityId" className="input" defaultValue="" disabled={!cityId || loading === "localities"}>
          <option value="">{loading === "localities" ? "Loading…" : cityId ? "Select…" : "Choose a city first"}</option>
          {localities.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
          <option value="__new">Propose a new locality…</option>
        </select>
        <p className="mt-1 text-xs text-muted">Not listed? Choose “Propose a new locality” and type its name; it goes to review (DIR-08).</p>
      </div>
      <div>
        <label className="label" htmlFor="newLocalityName">New locality name (if proposing)</label>
        <input id="newLocalityName" name="newLocalityName" className="input" maxLength={120} />
      </div>
      <noscript>
        <div className="text-sm sm:col-span-2">
          <button type="submit" formAction={reloadAction} formMethod="get" formNoValidate className="btn btn-quiet py-1.5 text-sm">Load cities and localities for the selected state/city</button>
          <span className="ml-2 text-muted">Other fields will need re-entering after reloading.</span>
        </div>
      </noscript>
    </>
  );
}
