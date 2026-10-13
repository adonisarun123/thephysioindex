/** Server-rendered GET form; works without JavaScript (DIR-05). */
export function SearchForm({ defaultQuery = "", compact = false }: { defaultQuery?: string; compact?: boolean }) {
  return (
    <form action="/physiotherapists" method="get" role="search" className={compact ? "flex gap-2" : "flex flex-col gap-2 sm:flex-row"}>
      <label className="sr-only" htmlFor="place">
        Search by city, locality, state or practitioner
      </label>
      <input
        id="place"
        name="q"
        type="search"
        defaultValue={defaultQuery}
        placeholder="City, locality or physiotherapist name"
        autoComplete="off"
        className="w-full rounded-md border border-line bg-surface px-3 py-2 text-base shadow-sm"
      />
      <button type="submit" className="rounded-md bg-brand px-4 py-2 font-medium text-white hover:bg-brand-ink">
        Search
      </button>
    </form>
  );
}
