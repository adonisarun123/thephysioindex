/** Server-rendered GET form; works without JavaScript (DIR-05). */
export function SearchForm({ defaultQuery = "", compact = false }: { defaultQuery?: string; compact?: boolean }) {
  return (
    <form action="/physiotherapists" method="get" role="search" className={`flex flex-col gap-2 sm:flex-row sm:items-stretch ${compact ? "" : ""}`}>
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
        className="input min-w-0 flex-1"
      />
      <button type="submit" className="btn btn-primary">
        Find physiotherapists
      </button>
    </form>
  );
}
