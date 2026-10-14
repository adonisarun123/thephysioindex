/** Server-rendered GET form; works without JavaScript (DIR-05). */
export function SearchForm({ defaultQuery = "", compact = false }: { defaultQuery?: string; compact?: boolean }) {
  return (
    <form action="/physiotherapists" method="get" role="search" className={`flex items-stretch gap-2 rounded-full bg-surface p-1.5 shadow-[0_1px_0_rgba(27,36,32,0.06),0_8px_24px_-12px_rgba(27,36,32,0.25)] ${compact ? "" : "sm:p-2"}`}>
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
        className="min-w-0 flex-1 rounded-full bg-transparent px-4 py-2 text-base outline-none"
      />
      <button type="submit" className="btn btn-primary">
        Search
      </button>
    </form>
  );
}
