import { connection } from "next/server";
import { Suspense } from "react";
import { PageHeader } from "@/components/admin/admin-shell";
import { Input, Notice, Section, Select, Stat, Table, Td } from "@/components/admin/ui";
import { loadAnalytics, suppress, type DateType } from "@/lib/admin/analytics";
import { first, fmtDateTime, isoDateShift, pct, todayIst, type SP } from "@/lib/admin/format";
import { requireStaff } from "@/lib/auth/session";
import { formatPaise } from "@/lib/money";

export default function Page({ searchParams }: PageProps<"/admin/analytics">) {
  return (
    <>
      <PageHeader title="Analytics" description="Metric definitions follow SRS Section 16. Test accounts excluded; Asia/Kolkata boundaries; cohorts under five suppressed (ANA-01, ANA-03)." />
      <Suspense fallback={<p className="text-muted">Computing…</p>}>
        <Body searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Body({ searchParams }: { searchParams: PageProps<"/admin/analytics">["searchParams"] }) {
  const sp = (await searchParams) as SP;
  await connection();
  await requireStaff("analyst");
  const from = /^\d{4}-\d{2}-\d{2}$/.test(first(sp.from) ?? "") ? first(sp.from)! : isoDateShift(-30);
  const to = /^\d{4}-\d{2}-\d{2}$/.test(first(sp.to) ?? "") ? first(sp.to)! : todayIst();
  const dateType = (["created", "appointment", "completed"].includes(first(sp.dateType) ?? "") ? first(sp.dateType) : "appointment") as DateType;
  const a = await loadAnalytics(from, to, dateType);
  const cancelled = a.cancellation.patient + a.cancellation.provider;
  const elapsed = a.noShow.noShow + a.noShow.completed;
  return (
    <>
      <Notice sp={sp} />
      <form method="get" className="mb-4 flex flex-wrap items-end gap-2 text-sm">
        <div><label className="label" htmlFor="from">From</label><Input name="from" type="date" defaultValue={from} className="py-1.5" /></div>
        <div><label className="label" htmlFor="to">To</label><Input name="to" type="date" defaultValue={to} className="py-1.5" /></div>
        <div><label className="label" htmlFor="dateType">Date type (ANA-01)</label><Select name="dateType" defaultValue={dateType} className="py-1.5" options={[{ value: "appointment", label: "Appointment date" }, { value: "created", label: "Creation date" }, { value: "completed", label: "Completion date" }]} /></div>
        <button className="btn btn-secondary py-1.5" type="submit">Apply</button>
        <a className="btn btn-quiet py-1.5" href={`/admin/analytics/export?from=${from}&to=${to}&dateType=${dateType}`}>Download CSV</a>
        <span className="ml-auto text-xs text-muted">Refreshed {fmtDateTime(a.refreshedAt)} (computed on request)</span>
      </form>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Approved profiles" value={a.profiles.published} hint={`${a.profiles.claimed} claimed · ${a.profiles.verified} verified · ${a.profiles.bookable} bookable`} />
        <Stat label="Completed visits" value={suppress(a.completedVisits)} hint="Marked completed, by appointment date in range" />
        <Stat label="Booking value" value={formatPaise(a.bookingValuePaise)} hint="Sum of agreed amounts for confirmed + completed. Booking value, not revenue." />
        <Stat label="Approval turnaround" value={a.turnaround.medianHours == null ? "—" : `${a.turnaround.medianHours.toFixed(1)} h`} hint={`median · p90 ${a.turnaround.p90Hours == null ? "—" : a.turnaround.p90Hours.toFixed(1) + " h"} · ${a.turnaround.decided} listing decisions in range`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title={`Bookings by status (${dateType} date, ${from} → ${to})`}>
          <Table head={["Status", "Count", "Booking value"]}>
            {a.bookingsByStatus.length === 0 ? <tr><Td colSpan={3} className="text-center text-muted">No bookings in range.</Td></tr> : null}
            {a.bookingsByStatus.map((s) => <tr key={s.status}><Td>{s.status.replace(/_/g, " ")}</Td><Td>{suppress(s.n)}</Td><Td>{formatPaise(s.valuePaise)}</Td></tr>)}
          </Table>
          <h3 className="mt-3 text-sm font-semibold">By source</h3>
          <ul className="text-sm">{a.bySource.map((s) => <li key={s.source}>{s.source.replace("_", " ")}: {suppress(s.n)}</li>)}{a.bySource.length === 0 ? <li className="text-muted">—</li> : null}</ul>
        </Section>
        <Section title={`Funnel (${from} → ${to})`}>
          <Table head={["Step", "Count", "Notes"]}>
            <tr><Td>Searches</Td><Td>{suppress(a.funnel.searches)}</Td><Td className="text-xs text-muted">First results page; no query text stored</Td></tr>
            <tr><Td>Profile views</Td><Td>{suppress(a.funnel.profileViews)}</Td><Td className="text-xs text-muted">Published profiles</Td></tr>
            <tr><Td>Booking starts</Td><Td>{suppress(a.funnel.bookingStarts)}</Td><Td className="text-xs text-muted">Entries into the booking flow</Td></tr>
            <tr><Td>Confirmed platform bookings</Td><Td>{suppress(a.conversion.confirmed)}</Td><Td className="text-xs text-muted">From booking records, by creation date</Td></tr>
          </Table>
        </Section>
        <Section title="Rates">
          <Table head={["Metric", "Value", "Definition"]}>
            <tr><Td>Cancellation rate</Td><Td className="font-semibold">{pct(cancelled, a.cancellation.confirmedCohort)}</Td><Td className="text-xs text-muted">{suppress(cancelled)} cancelled of {suppress(a.cancellation.confirmedCohort)} confirmed cohort · patient {suppress(a.cancellation.patient)} · provider {suppress(a.cancellation.provider)}</Td></tr>
            <tr><Td>No-show rate</Td><Td className="font-semibold">{pct(a.noShow.noShow, elapsed)}</Td><Td className="text-xs text-muted">{suppress(a.noShow.noShow)} no-shows of {suppress(elapsed)} elapsed appointments (completed + no-show)</Td></tr>
            <tr><Td>Booking conversion</Td><Td className="font-semibold">{a.conversion.starts ? pct(a.conversion.confirmed, a.conversion.starts) : "—"}</Td><Td className="text-xs text-muted">{suppress(a.conversion.confirmed)} confirmed platform bookings / {suppress(a.conversion.starts)} booking starts (creation date). Gaps: starts are recorded from {a.funnel.trackedSince ? fmtDateTime(a.funnel.trackedSince) : "the analytics release (none yet)"}; bots and link previewers are not counted; one start per entry into the booking flow (ANA-02).</Td></tr>
            <tr><Td>Utilisation</Td><Td className="font-semibold">{a.utilisation.ratio == null ? "—" : pct(a.utilisation.bookedMinutes, a.utilisation.availableMinutes)}</Td><Td className="text-xs text-muted">{a.utilisation.bookedMinutes.toLocaleString("en-IN")} booked service minutes / {a.utilisation.availableMinutes.toLocaleString("en-IN")} published available minutes (appointment dates in range). Available excludes leave, blocks and external busy time; buffers count as available but not booked, so a full calendar reads below 100 %.</Td></tr>
          </Table>
        </Section>
      </div>
    </>
  );
}
