import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { PageHeader } from "@/components/admin/admin-shell";
import { Input, Pill, Section } from "@/components/admin/ui";
import { CASE_TYPE_LABELS, first, fmtDateTime, maskMobile, type SP } from "@/lib/admin/format";
import { adminSearch } from "@/lib/admin/search";
import { hasRole, requireStaff } from "@/lib/auth/session";

export default function Page({ searchParams }: PageProps<"/admin/search">) {
  return (
    <>
      <PageHeader title="Search" description="Practitioners by name, public id or registration number; clinics by name; bookings by reference; patients by mobile digits (masked)." />
      <Suspense fallback={<p className="text-muted">Searching…</p>}>
        <Results searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Results({ searchParams }: { searchParams: PageProps<"/admin/search">["searchParams"] }) {
  const sp = (await searchParams) as SP;
  await connection();
  const v = await requireStaff();
  const q = (first(sp.q) ?? "").trim();
  const r = q.length >= 2 ? await adminSearch(q) : null;
  const canSeePatients = hasRole(v, "support_agent");
  return (
    <>
      <form method="get" className="mb-4 flex max-w-xl gap-2">
        <Input name="q" defaultValue={q} placeholder="Search" aria-label="Search" autoFocus />
        <button className="btn btn-primary" type="submit">Search</button>
      </form>
      {!r ? <p className="text-sm text-muted">Enter at least two characters.</p> : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Section title={`Practitioners (${r.practitioners.length})`}>
            <ul className="divide-y divide-line text-sm">{r.practitioners.map((p) => <li key={p.id} className="flex items-center gap-2 py-1.5"><Link href={`/admin/practitioners/${p.id}`} className="font-semibold underline">{p.name}</Link><code className="text-xs text-muted">{p.publicId}</code><Pill status={p.listingStatus} /><Pill status={p.claimState} /></li>)}{r.practitioners.length === 0 ? <li className="py-1.5 text-muted">None</li> : null}</ul>
          </Section>
          <Section title={`Clinics (${r.clinics.length})`}>
            <ul className="divide-y divide-line text-sm">{r.clinics.map((c) => <li key={c.id} className="flex items-center gap-2 py-1.5"><Link href={`/admin/clinics/${c.id}`} className="font-semibold underline">{c.name}</Link><code className="text-xs text-muted">{c.publicId}</code><Pill status={c.status} /></li>)}{r.clinics.length === 0 ? <li className="py-1.5 text-muted">None</li> : null}</ul>
          </Section>
          <Section title={`Bookings (${r.bookings.length})`}>
            <ul className="divide-y divide-line text-sm">{r.bookings.map((b) => <li key={b.id} className="flex items-center gap-2 py-1.5"><Link href={`/admin/bookings?bookingId=${b.id}`} className="font-semibold underline">{b.reference}</Link><span>{b.practitionerName}</span><span className="text-xs text-muted">{fmtDateTime(b.startsAt)}</span><Pill status={b.status} /></li>)}{r.bookings.length === 0 ? <li className="py-1.5 text-muted">None</li> : null}</ul>
          </Section>
          <Section title={`Patients (${canSeePatients ? r.patients.length : "support role required"})`}>
            <ul className="divide-y divide-line text-sm">{canSeePatients ? r.patients.map((p) => <li key={p.id} className="flex items-center gap-2 py-1.5"><Link href={`/admin/patients?q=${encodeURIComponent(p.mobile ?? "")}`} className="font-semibold underline">{p.name}</Link><code className="text-xs">{maskMobile(p.mobile)}</code><Pill status={p.status} /></li>) : null}{canSeePatients && r.patients.length === 0 ? <li className="py-1.5 text-muted">None (search needs at least four digits of the mobile)</li> : null}</ul>
          </Section>
          {r.cases.length ? <Section title={`Cases (${r.cases.length})`}><ul className="text-sm">{r.cases.map((c) => <li key={c.id}><Link href={`/admin/cases/${c.id}`} className="underline">{CASE_TYPE_LABELS[c.caseType]}</Link> <Pill status={c.state} /></li>)}</ul></Section> : null}
        </div>
      )}
    </>
  );
}
