import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { Empty, Field, PageHeader, Section, StatePill } from "@/components/workspace/forms/ui";
import { formatIst } from "@/lib/workspace/calendar";
import { requireWorkspace } from "@/lib/workspace/context";
import { listBookings } from "@/lib/workspace/queries";

export const metadata: Metadata = { title: "Appointments" };

const STATUSES = ["confirmed", "completed", "patient_cancelled", "provider_cancelled", "no_show", "requested", "declined", "expired"];
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export default function Page({ searchParams }: PageProps<"/workspace/appointments">) {
  return (
    <Suspense fallback={<p className="text-muted">Loading…</p>}>
      <Appointments searchParams={searchParams} />
    </Suspense>
  );
}

/** Section 15: scoped list with filters; detail view per booking; manual entry uses the same conflict rules (PRO-13). */
async function Appointments({ searchParams }: { searchParams: PageProps<"/workspace/appointments">["searchParams"] }) {
  await connection();
  const sp = await searchParams;
  const { practitioner: p } = await requireWorkspace("/workspace/appointments");
  const status = typeof sp.status === "string" && STATUSES.includes(sp.status) ? sp.status : undefined;
  const from = typeof sp.from === "string" && DATE.test(sp.from) ? sp.from : undefined;
  const to = typeof sp.to === "string" && DATE.test(sp.to) ? sp.to : undefined;
  const rows = await listBookings(p.id, { status, from, to, limit: 100 });

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Appointments"
        lede="Every booking for your profile across clinics. Numbers match the underlying scoped records (Section 15)."
        action={
          <Link href="/workspace/appointments/new" className="btn btn-secondary py-2 text-sm">Add walk-in or phone booking</Link>
        }
      />
      <Section title="Filters">
        <form method="get" action="/workspace/appointments" className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
          <Field label="Status" htmlFor="status">
            <select id="status" name="status" className="input" defaultValue={status ?? ""}>
              <option value="">Any</option>
              {STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
            </select>
          </Field>
          <Field label="From" htmlFor="from"><input id="from" name="from" type="date" className="input" defaultValue={from ?? ""} /></Field>
          <Field label="To" htmlFor="to"><input id="to" name="to" type="date" className="input" defaultValue={to ?? ""} /></Field>
          <button type="submit" className="btn btn-secondary py-2 text-sm">Apply</button>
        </form>
      </Section>
      <Section title={`${rows.length} appointment${rows.length === 1 ? "" : "s"}`}>
        {rows.length === 0 ? (
          <Empty>No appointments match. Online booking opens once your profile is approved and eligibility checks pass (VER-04); patients can still send enquiries meanwhile.</Empty>
        ) : (
          <table className="w-full text-sm">
            <caption className="sr-only">Appointments</caption>
            <thead><tr className="text-left text-muted"><th className="py-1 font-normal">When (IST)</th><th className="py-1 font-normal">Reference</th><th className="py-1 font-normal">Patient</th><th className="py-1 font-normal">Service · clinic</th><th className="py-1 font-normal">Status</th></tr></thead>
            <tbody>
              {rows.map((b) => (
                <tr key={b.id} className="border-t border-line">
                  <td className="py-2">{formatIst(b.startsAt)}</td>
                  <td className="py-2"><Link href={`/workspace/appointments/${b.id}`} className="underline">{b.reference}</Link></td>
                  <td className="py-2">{b.patientName}</td>
                  <td className="py-2 text-muted">{b.offeringName} · {b.branchName}</td>
                  <td className="py-2"><StatePill state={b.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
    </div>
  );
}
