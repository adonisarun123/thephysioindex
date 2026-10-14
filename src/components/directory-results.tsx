import { resultBucket, track } from "@/lib/analytics";
import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { languages, specialties } from "@/db/schema";
import { searchPractitioners, type SearchFilters } from "@/lib/directory";
import { EmptyCoverage } from "./empty-coverage";
import { PractitionerCardRow } from "./practitioner-card";

export type RawSearchParams = Record<string, string | string[] | undefined>;

const str = (v: string | string[] | undefined) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
const num = (v: string | string[] | undefined) => {
  const n = Number(str(v));
  return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : undefined;
};

/** Parse URL filters (DIR-05: filters live in the URL and are shareable). */
export function filtersFromSearchParams(sp: RawSearchParams, scope: Pick<SearchFilters, "stateSlug" | "citySlug" | "localitySlug">): SearchFilters {
  const gender = str(sp.gender);
  const verification = str(sp.verification);
  const sort = str(sp.sort);
  const feeMin = num(sp.fee_min);
  const feeMax = num(sp.fee_max);
  return {
    ...scope,
    q: str(sp.q),
    specialtySlug: str(sp.specialty),
    languageCode: str(sp.language),
    gender: gender === "female" || gender === "male" || gender === "non_binary" ? gender : undefined,
    verification: verification === "registration_checked" || verification === "document_reviewed" || verification === "any_reviewed" ? verification : undefined,
    bookable: str(sp.bookable) === "1",
    feeMinPaise: feeMin != null ? feeMin * 100 : undefined,
    feeMaxPaise: feeMax != null ? feeMax * 100 : undefined,
    sort: sort === "fee_asc" || sort === "fee_desc" ? sort : undefined,
    cursor: str(sp.cursor),
  };
}

function activeFilterCount(f: SearchFilters) {
  const values: (string | number | undefined)[] = [f.q, f.specialtySlug, f.languageCode, f.gender, f.verification, f.bookable ? "1" : undefined, f.feeMinPaise, f.feeMaxPaise];
  return values.filter((v) => v != null && v !== "").length;
}

export async function DirectoryResults({
  filters,
  basePath,
  scopeLabel,
  broaderHref,
  broaderLabel,
}: {
  filters: SearchFilters;
  basePath: string;
  scopeLabel: string;
  broaderHref: string;
  broaderLabel: string;
}) {
  const [result, specs, langs] = await Promise.all([
    searchPractitioners(filters),
    db().select({ slug: specialties.slug, label: specialties.label }).from(specialties).where(eq(specialties.active, true)).orderBy(asc(specialties.sortOrder)),
    db().select({ code: languages.code, label: languages.label }).from(languages).where(eq(languages.active, true)).orderBy(asc(languages.sortOrder)),
  ]);
  const active = activeFilterCount(filters);
  // ANA-02: first page of results only, no free text (the query could contain a name or a condition).
  if (!filters.cursor) {
    void track("search", {
      stateSlug: filters.stateSlug,
      citySlug: filters.citySlug,
      properties: { hasQuery: Boolean(filters.q), specialty: filters.specialtySlug, language: filters.languageCode, bookableOnly: filters.bookable, resultBucket: resultBucket(result.items.length), page: "first" },
    });
  }
  const nextHref = result.nextCursor ? `${basePath}?${new URLSearchParams({ ...stripCursor(filters), cursor: result.nextCursor }).toString()}` : null;

  return (
    <section className="mt-8 grid gap-8 lg:grid-cols-[16rem_1fr]">
      <form method="get" action={basePath} className="self-start card p-4 text-sm lg:sticky lg:top-4" aria-label="Filter results">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Filters{active ? ` (${active})` : ""}</h2>
          {active ? (
            <Link href={basePath} className="text-xs underline">Reset</Link>
          ) : null}
        </div>
        <label className="mt-3 block">
          <span className="text-muted">Name or clinic</span>
          <input name="q" defaultValue={filters.q ?? ""} className="mt-1 input py-1.5" />
        </label>
        <label className="mt-3 block">
          <span className="text-muted">Area of practice</span>
          <select name="specialty" defaultValue={filters.specialtySlug ?? ""} className="mt-1 input py-1.5">
            <option value="">Any</option>
            {specs.map((s) => (
              <option key={s.slug} value={s.slug}>{s.label}</option>
            ))}
          </select>
        </label>
        <label className="mt-3 block">
          <span className="text-muted">Language</span>
          <select name="language" defaultValue={filters.languageCode ?? ""} className="mt-1 input py-1.5">
            <option value="">Any</option>
            {langs.map((l) => (
              <option key={l.code} value={l.code}>{l.label}</option>
            ))}
          </select>
        </label>
        <label className="mt-3 block">
          <span className="text-muted">Verification</span>
          <select name="verification" defaultValue={filters.verification ?? ""} className="mt-1 input py-1.5">
            <option value="">Any</option>
            <option value="registration_checked">Registration checked</option>
            <option value="document_reviewed">Registration checked or document reviewed</option>
            <option value="any_reviewed">Any reviewed credential</option>
          </select>
        </label>
        <fieldset className="mt-3">
          <legend className="text-muted">Fee (₹)</legend>
          <div className="mt-1 flex gap-2">
            <input name="fee_min" type="number" min={0} step={50} placeholder="Min" defaultValue={filters.feeMinPaise != null ? filters.feeMinPaise / 100 : ""} className="input w-1/2 py-1.5" aria-label="Minimum fee" />
            <input name="fee_max" type="number" min={0} step={50} placeholder="Max" defaultValue={filters.feeMaxPaise != null ? filters.feeMaxPaise / 100 : ""} className="input w-1/2 py-1.5" aria-label="Maximum fee" />
          </div>
        </fieldset>
        <label className="mt-3 block">
          <span className="text-muted">Practitioner gender (optional)</span>
          <select name="gender" defaultValue={filters.gender ?? ""} className="mt-1 input py-1.5">
            <option value="">No preference</option>
            <option value="female">Female</option>
            <option value="male">Male</option>
            <option value="non_binary">Non-binary</option>
          </select>
        </label>
        <label className="mt-3 flex items-center gap-2">
          <input type="checkbox" name="bookable" value="1" defaultChecked={filters.bookable} />
          <span>Online booking available</span>
        </label>
        <label className="mt-3 block">
          <span className="text-muted">Sort</span>
          <select name="sort" defaultValue={filters.sort ?? ""} className="mt-1 input py-1.5">
            <option value="">Best match</option>
            <option value="fee_asc">Fee, low to high</option>
            <option value="fee_desc">Fee, high to low</option>
          </select>
        </label>
        <button type="submit" className="mt-4 btn btn-primary w-full">
          Apply filters
        </button>
      </form>

      <div>
        <p className="text-sm text-muted" aria-live="polite">
          {result.total === 0 ? "No matching physiotherapists" : `${result.total} ${result.total === 1 ? "physiotherapist" : "physiotherapists"}`} in {scopeLabel}
          {active ? " matching your filters" : ""}. Ranking {result.rankingVersion}.
        </p>
        {result.items.length === 0 ? (
          active ? (
            <div className="mt-4 card border-dashed p-6">
              <p className="font-medium">No results with these filters.</p>
              <p className="mt-1 text-sm text-muted">
                <Link href={basePath} className="underline">Clear filters</Link> or try <Link href={broaderHref} className="underline">{broaderLabel}</Link>.
              </p>
            </div>
          ) : (
            <EmptyCoverage scope={scopeLabel} backHref={broaderHref} backLabel={broaderLabel} />
          )
        ) : (
          <ul className="mt-2 border-t border-line">
            {result.items.map((c) => (
              <PractitionerCardRow key={c.id} card={c} />
            ))}
          </ul>
        )}
        {nextHref ? (
          <p className="mt-6">
            <Link href={nextHref} rel="next" className="btn btn-quiet py-2">
              Next page
            </Link>
          </p>
        ) : null}
      </div>
    </section>
  );
}

function stripCursor(f: SearchFilters): Record<string, string> {
  const out: Record<string, string> = {};
  if (f.q) out.q = f.q;
  if (f.specialtySlug) out.specialty = f.specialtySlug;
  if (f.languageCode) out.language = f.languageCode;
  if (f.gender) out.gender = f.gender;
  if (f.verification) out.verification = f.verification;
  if (f.bookable) out.bookable = "1";
  if (f.feeMinPaise != null) out.fee_min = String(f.feeMinPaise / 100);
  if (f.feeMaxPaise != null) out.fee_max = String(f.feeMaxPaise / 100);
  if (f.sort) out.sort = f.sort;
  return out;
}
