import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight text-brand-ink">
          <span aria-hidden className="inline-block h-6 w-6 rounded-md bg-brand" />
          The Physio Index
        </Link>
        <nav aria-label="Primary" className="flex items-center gap-4 text-sm">
          <Link href="/physiotherapists" className="hover:underline">
            Find a physiotherapist
          </Link>
          <Link href="/for-physiotherapists" className="hidden rounded-md border border-brand px-3 py-1.5 font-medium text-brand-ink hover:bg-brand-soft sm:inline-block">
            For physiotherapists
          </Link>
        </nav>
      </div>
    </header>
  );
}
