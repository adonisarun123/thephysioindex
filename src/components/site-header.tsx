import Link from "next/link";
import { getViewer } from "@/lib/auth/session";
import { Logo } from "./logo";

/** Public shell header per Visual Design Specification §6.1. */
export async function SiteHeader() {
  const viewer = await getViewer().catch(() => null);
  const accountHref = viewer ? (viewer.kind === "staff" ? "/admin" : viewer.kind === "practitioner" ? "/workspace" : "/account") : null;
  const accountLabel = viewer ? (viewer.kind === "staff" ? "Admin" : viewer.kind === "practitioner" ? "Workspace" : "My account") : null;
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur" style={{ boxShadow: "var(--shadow-1)" }}>
      <div className="mx-auto flex h-16 max-w-[1280px] items-center justify-between gap-4 px-4 md:h-20 md:px-6">
        <Link href="/" aria-label="The Physio Index — home" className="shrink-0">
          <Logo />
        </Link>
        <nav aria-label="Primary" className="flex items-center gap-1 text-sm font-medium sm:gap-2">
          <Link href="/physiotherapists" className="rounded-[var(--r-ctl)] px-3 py-2 hover:bg-surface-2">
            Find a physiotherapist
          </Link>
          <Link href="/for-physiotherapists" className="hidden rounded-[var(--r-ctl)] px-3 py-2 hover:bg-surface-2 md:inline-block">
            For physiotherapists
          </Link>
          <Link href="/help" className="hidden rounded-[var(--r-ctl)] px-3 py-2 hover:bg-surface-2 md:inline-block">
            Help
          </Link>
          {accountHref ? (
            <Link href={accountHref} className="btn btn-secondary btn-sm">
              {accountLabel}
            </Link>
          ) : (
            <Link href="/sign-in" className="btn btn-secondary btn-sm">
              Sign in
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
