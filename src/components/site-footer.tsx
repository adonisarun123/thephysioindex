import Link from "next/link";
import { Logo } from "./logo";

export function SiteFooter() {
  return (
    <footer className="mt-20 border-t border-line bg-surface text-sm text-muted">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:grid-cols-4">
        <div className="sm:col-span-2">
          <Logo />
          <p className="mt-3 max-w-sm leading-relaxed">
            An India-wide directory and appointment platform for physiotherapists. Listings are published after review. A verification label describes the check we performed, not treatment quality.
          </p>
        </div>
        <nav aria-label="Patients" className="grid gap-2">
          <p className="font-semibold text-foreground">For patients</p>
          <Link href="/physiotherapists" className="hover:underline">Browse by state</Link>
          <Link href="/conditions" className="hover:underline">Conditions we cover</Link>
          <Link href="/blog" className="hover:underline">Guides</Link>
          <Link href="/news" className="hover:underline">News</Link>
          <Link href="/help" className="hover:underline">Help and verification</Link>
        </nav>
        <nav aria-label="Physiotherapists and policies" className="grid gap-2">
          <p className="font-semibold text-foreground">For physiotherapists</p>
          <Link href="/for-physiotherapists" className="hover:underline">List your practice</Link>
          <Link href="/claim" className="hover:underline">Claim your profile</Link>
          <p className="mt-2 font-semibold text-foreground">Policies</p>
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
