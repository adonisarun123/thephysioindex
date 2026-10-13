import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-line bg-surface text-sm text-muted">
      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-10 sm:grid-cols-3">
        <div>
          <p className="font-semibold text-foreground">The Physio Index</p>
          <p className="mt-2 max-w-xs">
            A directory and appointment platform for physiotherapists across India. Listings are published after review; verification labels describe the check performed, not treatment quality.
          </p>
        </div>
        <nav aria-label="Footer" className="grid gap-2">
          <Link href="/physiotherapists" className="hover:underline">Browse by state</Link>
          <Link href="/for-physiotherapists" className="hover:underline">List your practice</Link>
          <Link href="/help" className="hover:underline">Help and verification explained</Link>
        </nav>
        <nav aria-label="Policies" className="grid gap-2">
          <Link href="/policies/privacy" className="hover:underline">Privacy notice</Link>
          <Link href="/policies/terms" className="hover:underline">Terms</Link>
          <Link href="/policies/cancellation" className="hover:underline">Cancellation policy</Link>
        </nav>
      </div>
      <div className="border-t border-line">
        <p className="mx-auto max-w-6xl px-4 py-4 text-xs">© The Physio Index. Not a substitute for medical advice. In an emergency call 112.</p>
      </div>
    </footer>
  );
}
