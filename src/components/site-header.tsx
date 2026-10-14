import Link from "next/link";
import { getViewer } from "@/lib/auth/session";
import { Logo } from "./logo";

export async function SiteHeader() {
  const viewer = await getViewer().catch(() => null);
  const workspaceHref = viewer ? (viewer.kind === "staff" ? "/admin" : viewer.kind === "practitioner" ? "/workspace" : "/account") : null;
  return (
    <header className="bg-background">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4">
        <Link href="/" aria-label="The Physio Index home">
          <Logo />
        </Link>
        <nav aria-label="Primary" className="flex items-center gap-2 text-sm sm:gap-4">
          <Link href="/physiotherapists" className="rounded-full px-3 py-1.5 font-medium hover:bg-surface-2">
            Find a physiotherapist
          </Link>
          <Link href="/conditions" className="hidden rounded-full px-3 py-1.5 font-medium hover:bg-surface-2 md:inline-block">
            Conditions
          </Link>
          <Link href="/blog" className="hidden rounded-full px-3 py-1.5 font-medium hover:bg-surface-2 md:inline-block">
            Guides
          </Link>
          {workspaceHref ? (
            <Link href={workspaceHref} className="btn btn-secondary py-1.5">
              {viewer!.kind === "staff" ? "Admin" : viewer!.kind === "practitioner" ? "Workspace" : "My account"}
            </Link>
          ) : (
            <>
              <Link href="/sign-in" className="hidden rounded-full px-3 py-1.5 font-medium hover:bg-surface-2 sm:inline-block">
                Sign in
              </Link>
              <Link href="/for-physiotherapists" className="btn btn-secondary py-1.5">
                For physiotherapists
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
