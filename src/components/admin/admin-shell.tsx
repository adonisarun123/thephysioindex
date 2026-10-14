import Link from "next/link";
import type { Viewer } from "@/lib/auth/session";
import { Logo } from "@/components/logo";

export type NavItem = { href: string; label: string; count?: number; superOnly?: boolean };
export type NavGroup = { label: string; items: NavItem[] };

/**
 * Admin shell: grouped sidebar with live queue counts, compact top bar.
 * Authorisation happens in each page via requireStaff(); the shell only
 * decides what to show (IAM-01).
 */
export function AdminShell({ viewer, groups, current, children }: { viewer: Viewer; groups: NavGroup[]; current: string; children: React.ReactNode }) {
  const isSuper = viewer.grants.some((g) => g.role === "super_admin");
  return (
    <div className="min-h-screen bg-background lg:grid lg:grid-cols-[15.5rem_1fr]">
      <aside className="border-b border-line bg-surface lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between px-4 py-4">
          <Link href="/admin" aria-label="Admin home"><Logo /></Link>
          <span className="pill bg-surface-2 text-ink-2">Admin</span>
        </div>
        <nav aria-label="Admin" className="px-2 pb-4">
          {groups.map((g) => (
            <div key={g.label} className="mt-3">
              <p className="px-2 text-xs font-semibold text-muted">{g.label}</p>
              <ul className="mt-1 grid gap-0.5">
                {g.items
                  .filter((i) => !i.superOnly || isSuper)
                  .map((i) => {
                    const active = current === i.href || (i.href !== "/admin" && current.startsWith(i.href));
                    return (
                      <li key={i.href}>
                        <Link
                          href={i.href}
                          aria-current={active ? "page" : undefined}
                          className={`flex items-center justify-between rounded-[var(--r-sm)] px-2 py-1.5 text-sm ${active ? "bg-brand-soft font-semibold text-brand-ink" : "hover:bg-surface-2"}`}
                        >
                          <span>{i.label}</span>
                          {i.count ? <span className="pill bg-mark-soft text-ink-2">{i.count}</span> : null}
                        </Link>
                      </li>
                    );
                  })}
              </ul>
            </div>
          ))}
        </nav>
      </aside>
      <div className="min-w-0">
        <header className="flex items-center justify-between gap-4 border-b border-line bg-surface px-4 py-2 text-sm">
          <form action="/admin/search" method="get" role="search" className="flex max-w-md flex-1 gap-2">
            <input name="q" className="input py-1.5" placeholder="Search practitioners, clinics, bookings, patients" aria-label="Admin search" />
          </form>
          <div className="flex items-center gap-3">
            <span className="hidden text-muted sm:inline">{viewer.email ?? viewer.name}</span>
            <Link href="/admin/security" className="underline">Security</Link>
            <form action="/sign-out" method="post"><button className="underline" type="submit">Sign out</button></form>
          </div>
        </header>
        <main className="px-4 py-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold">{title}</h1>
        {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex gap-2">{actions}</div> : null}
    </div>
  );
}
