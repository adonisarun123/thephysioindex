import Link from "next/link";
import { Logo } from "@/components/logo";

export type WsNavItem = { href: string; label: string; badge?: string };

/** Practitioner workspace shell (Section 15). Pages enforce ownership via canManagePractitioner. */
export function WorkspaceShell({ practitionerName, status, current, children }: { practitionerName: string | null; status: string | null; current: string; children: React.ReactNode }) {
  const items: WsNavItem[] = [
    { href: "/workspace", label: "Overview" },
    { href: "/workspace/profile", label: "Profile" },
    { href: "/workspace/clinics", label: "Clinics and services" },
    { href: "/workspace/calendar", label: "Calendar" },
    { href: "/workspace/appointments", label: "Appointments" },
    { href: "/workspace/offers", label: "Offers" },
    { href: "/workspace/reviews", label: "Reviews" },
    { href: "/workspace/team", label: "Team" },
    { href: "/workspace/reports", label: "Reports" },
    { href: "/workspace/settings", label: "Settings" },
  ];
  return (
    <div className="min-h-screen bg-background lg:grid lg:grid-cols-[15rem_1fr]">
      <aside className="border-b border-line bg-surface lg:border-b-0 lg:border-r">
        <div className="px-4 py-4">
          <Link href="/" aria-label="The Physio Index home"><Logo /></Link>
          <p className="mt-3 truncate text-sm font-semibold">{practitionerName ?? "Your profile"}</p>
          {status ? <span className="pill mt-1 bg-surface-2 text-ink-2">{statusLabel(status)}</span> : null}
        </div>
        <nav aria-label="Workspace" className="px-2 pb-4">
          <ul className="grid gap-0.5">
            {items.map((i) => {
              const active = current === i.href || (i.href !== "/workspace" && current.startsWith(i.href));
              return (
                <li key={i.href}>
                  <Link href={i.href} aria-current={active ? "page" : undefined} className={`flex items-center justify-between rounded-[var(--r-sm)] px-2 py-1.5 text-sm ${active ? "bg-brand-soft font-semibold text-brand-ink" : "hover:bg-surface-2"}`}>
                    {i.label}
                    {i.badge ? <span className="pill bg-mark-soft text-ink-2">{i.badge}</span> : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </aside>
      <div className="min-w-0">
        <header className="flex items-center justify-end gap-3 border-b border-line bg-surface px-4 py-2 text-sm">
          <Link href="/account" className="underline">My account</Link>
          <form action="/sign-out" method="post"><button className="underline" type="submit">Sign out</button></form>
        </header>
        <main className="px-4 py-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}

export function statusLabel(s: string) {
  return (
    {
      draft: "Draft",
      submitted: "Under review",
      changes_requested: "Changes requested",
      published: "Published",
      rejected: "Not approved",
      suspended: "Suspended",
      archived: "Archived",
    } as Record<string, string>
  )[s] ?? s;
}
