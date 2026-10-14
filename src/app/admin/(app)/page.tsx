import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { PageHeader } from "@/components/admin/admin-shell";
import { Bar, Notice, Pill, Section, Stat } from "@/components/admin/ui";
import { CASE_TYPE_LABELS, fmtAge, fmtDateTime, titleCase, type SP } from "@/lib/admin/format";
import { loadOverview } from "@/lib/admin/overview";
import { requireStaff } from "@/lib/auth/session";

export default function Page({ searchParams }: PageProps<"/admin">) {
  return (
    <>
      <PageHeader title="Overview" description="Operational snapshot from the authoritative database. Test accounts are excluded from counts (ANA-01)." />
      <Suspense fallback={<p className="text-muted">Loading overview…</p>}>
        <Overview searchParams={searchParams} />
      </Suspense>
    </>
  );
}

const FUNNEL_ORDER = ["draft", "submitted", "changes_requested", "published", "rejected", "suspended", "archived"];

function Delta({ now, prior }: { now: number; prior: number }) {
  const diff = now - prior;
  return <span className={diff > 0 ? "text-brand-ink" : diff < 0 ? "text-alert" : "text-muted"}>{diff > 0 ? "+" : ""}{diff} vs prior 7 days ({prior})</span>;
}

async function Overview({ searchParams }: { searchParams: PageProps<"/admin">["searchParams"] }) {
  const sp = (await searchParams) as SP;
  await connection();
  await requireStaff();
  const o = await loadOverview();
  const funnel = new Map(o.funnel.map((f) => [f.listingStatus, f.n]));
  const published = funnel.get("published") ?? 0;
  const funnelMax = Math.max(1, ...o.funnel.map((f) => f.n));
  const bookingsTodayTotal = o.bookingsToday.reduce((a, b) => a + b.n, 0);

  return (
    <>
      <Notice sp={{ ...sp, error: sp.error === "forbidden" ? "Your role does not include that area." : sp.error }} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Published profiles" value={published} hint={`${o.claimed} claimed · ${o.verified} verified · ${o.bookable} bookable`} />
        <Stat label="Open cases" value={o.queues.reduce((a, q) => a + q.open, 0)} hint={`${o.queues.reduce((a, q) => a + q.overdue, 0)} overdue (target ${o.target} business days)`} />
        <Stat label="Bookings today" value={bookingsTodayTotal} hint={o.bookingsToday.map((b) => `${b.n} ${b.status.replace("_", " ")}`).join(" · ") || "none"} />
        <Stat label="Staff accounts" value={o.staffCount} hint={`${o.openTasks} open resolution tasks`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Listing funnel">
          <ul className="grid gap-2 text-sm">
            {FUNNEL_ORDER.map((s) => (
              <li key={s} className="grid grid-cols-[9rem_1fr_3rem] items-center gap-2">
                <Link href={`/admin/practitioners?listingStatus=${s}`} className="underline">{titleCase(s)}</Link>
                <Bar value={funnel.get(s) ?? 0} max={funnelMax} label={`${s}: ${funnel.get(s) ?? 0}`} />
                <span className="text-right font-semibold">{funnel.get(s) ?? 0}</span>
              </li>
            ))}
          </ul>
          <dl className="mt-4 grid grid-cols-3 gap-2 text-sm">
            <div><dt className="text-muted">Claimed</dt><dd className="font-semibold">{o.claimed}</dd></div>
            <div><dt className="text-muted">Verified</dt><dd className="font-semibold">{o.verified}</dd></div>
            <div><dt className="text-muted">Bookable</dt><dd className="font-semibold">{o.bookable}</dd></div>
          </dl>
        </Section>

        <Section title="Queue ageing" actions={<span className="text-xs text-muted">First response within {o.target} business days (ADM-02)</span>}>
          {o.queues.length === 0 ? <p className="text-sm text-muted">No open cases.</p> : null}
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-muted"><th className="py-1">Queue</th><th>Open</th><th>Oldest</th><th>Overdue</th></tr></thead>
            <tbody className="divide-y divide-line">
              {o.queues.map((q) => (
                <tr key={q.caseType}>
                  <td className="py-1.5"><Link href={`/admin/queues/${q.caseType}`} className="underline">{CASE_TYPE_LABELS[q.caseType] ?? q.caseType}</Link></td>
                  <td>{q.open}</td>
                  <td>{fmtAge(q.oldestAt)}</td>
                  <td>{q.overdue ? <Pill status="urgent" label={String(q.overdue)} /> : <span className="text-muted">0</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>

        <Section title="Last 7 days">
          <dl className="grid gap-3 text-sm sm:grid-cols-3">
            <div><dt className="text-muted">Practitioners published</dt><dd className="text-xl font-bold">{o.trend.publishedLast7}</dd><dd className="text-xs"><Delta now={o.trend.publishedLast7} prior={o.trend.publishedPrior7} /></dd></div>
            <div><dt className="text-muted">Cases decided</dt><dd className="text-xl font-bold">{o.trend.decidedLast7}</dd><dd className="text-xs"><Delta now={o.trend.decidedLast7} prior={o.trend.decidedPrior7} /></dd></div>
            <div><dt className="text-muted">Bookings created</dt><dd className="text-xl font-bold">{o.trend.bookingsLast7}</dd><dd className="text-xs"><Delta now={o.trend.bookingsLast7} prior={o.trend.bookingsPrior7} /></dd></div>
          </dl>
        </Section>

        <Section title="Recent audit events" actions={<Link href="/admin/audit" className="text-sm underline">All events</Link>}>
          <ul className="divide-y divide-line text-sm">
            {o.recentAudit.map((a) => (
              <li key={a.id} className="flex flex-wrap items-baseline gap-x-2 py-1.5">
                <span className="w-36 shrink-0 text-xs text-muted">{fmtDateTime(a.occurredAt)}</span>
                <code className="text-xs">{a.action}</code>
                <span className="text-muted">{a.objectType}{a.objectId ? ` ${a.objectId.slice(0, 8)}` : ""}</span>
                <span className="text-muted">by {a.actorName ?? "system"}</span>
                {a.reason ? <span className="w-full truncate text-xs text-ink-2">{a.reason}</span> : null}
              </li>
            ))}
            {o.recentAudit.length === 0 ? <li className="py-2 text-muted">No audit events yet.</li> : null}
          </ul>
        </Section>
      </div>
    </>
  );
}
