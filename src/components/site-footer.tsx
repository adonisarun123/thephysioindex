import Link from "next/link";
import { Logo } from "./logo";

/** Public footer per Visual Design Specification §6.1. */
export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-line bg-surface text-sm text-muted">
      <div className="mx-auto grid max-w-[1280px] gap-10 px-4 py-14 md:grid-cols-4 md:px-6">
        <div className="md:col-span-2">
          <Logo />
          <p className="mt-4 max-w-sm leading-relaxed">
            An India-wide physiotherapist directory and appointment platform. Listings are published after review. A verification label describes the check we performed, not treatment quality.
          </p>
        </div>
        <nav aria-label="Browse" className="grid gap-2">
          <p className="font-semibold text-foreground">Browse</p>
          <Link href="/physiotherapists" className="hover:underline">Physiotherapists by location</Link>
          <Link href="/conditions" className="hover:underline">Conditions</Link>
          <Link href="/blog" className="hover:underline">Guides</Link>
          <Link href="/news" className="hover:underline">News</Link>
          <Link href="/for-physiotherapists" className="hover:underline">For physiotherapists</Link>
          <Link href="/claim" className="hover:underline">Claim your profile</Link>
        </nav>
        <nav aria-label="Help and policies" className="grid gap-2">
          <p className="font-semibold text-foreground">Help and policies</p>
          <Link href="/help" className="hover:underline">Help centre</Link>
          <Link href="/help#verification" className="hover:underline">How verification works</Link>
          <Link href="/policies/privacy" className="hover:underline">Privacy notice</Link>
          <Link href="/policies/terms" className="hover:underline">Terms</Link>
          <Link href="/policies/cancellation" className="hover:underline">Cancellation policy</Link>
          <Link href="/policies/provider-terms" className="hover:underline">Provider terms</Link>
          <Link href="/help#accessibility" className="hover:underline">Accessibility</Link>
        </nav>
      </div>
      <div className="border-t border-line">
        <p className="mx-auto max-w-[1280px] px-4 py-4 text-xs md:px-6">© The Physio Index. Not a substitute for medical advice. In an emergency call 112.</p>
      </div>
    </footer>
  );
}
