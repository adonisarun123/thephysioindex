import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { PageHeader } from "@/components/admin/admin-shell";
import { Empty, Input, Notice, Pager, Pill, Select, Table, Td } from "@/components/admin/ui";
import { listBookings } from "@/lib/admin/bookings";
import { clampInt, first, fmtDateTime, isoDateShift, maskMobile, todayIst, type SP } from "@/lib/admin/format";
import { geoOptions } from "@/lib/admin/practitioners";
import { requireStaff } from "@/lib/auth/session";
import { formatPaise } from "@/lib/money";

export default function Page({ searchParams }: PageProps<"/admin/bookings">) {
  return (
    <>
      <PageHeader title="Bookings" description="Read-only oversight. Patient identifiers are masked; the appointment reason is never shown here (ADM-04). Date boundaries use Asia/Kolkata (ANA-01)." />
      <Suspense fallback={<p className="text-muted">Loading…</p>}>
        <List searchParams={searchParams} />
      </Suspense>
    </>
  );
}

const STATUSES = ["confirmed", "completed", "patient_cancelled", "provider_cancelled", "no_show", "requested", "declined", "expired"];

async function List({ searchParams }: { searchParams: PageProps<"/admin/bookings">["searchParams"] }) {
  const sp = (await searchParams) as SP;
  await connection();
  await requireStaff();
  const dateType = (first(sp.dateType) as "created" | "appointment" | "completed" | undefined) ?? "appointment";
  const hasPointFilter = Boolean(first(sp.practitionerId) || first(sp.patientId) || first(sp.bookingId) || first(sp.clinicId) || first(sp.q));
  const from = first(sp.from) ?? (hasPointFilter ? "" : isoDateShift(-7));
  const to = first(sp.to) ?? (hasPointFilter ? "" : isoDateShift(30));
  const f = {
    stateId: first(sp.stateId) || undefined, cityId: first(sp.cityId) || undefined, practitionerId: first(sp.practitionerId) || undefined, clinicId: first(sp.clinicId) || undefined,
    patientId: first(sp.patientId) || undefined, bookingId: first(sp.bookingId) || undefined, source: first(sp.source) || undefined, status: first(sp.status) || undefined, dateType,
    from: from || undefined, to: to || undefined, q: first(sp.q) || undefined,
  };
  const page = clampInt(sp.page, 1, 100_000, 1);
  const [{ rows, total, byStatus }, geo] = await Promise.all([listBookings({ ...f, page, pageSize: 50 }), geoOptions()]);
  const cities = f.stateId ? geo.cities.filter((c) => c.stateId === f.stateId) : geo.cities;
  return (
    <>
      <Notice sp={sp} />
      <form method="get" className="mb-4 grid gap-2 md:grid-cols-4 lg:grid-cols-8">
        <Input name="q" defaultValue={f.q ?? ""} placeholder="Reference" aria-label="Reference" />
        <Select name="dateType" aria-label="Date type" defaultValue={dateType} options={[{ value: "appointment", label: "Appointment date" }, { value: "created", label: "Created date" }, { value: "completed", label: "Completion date" }]} />
        <Input name="from" type="date" defaultValue={from} aria-label="From" />
        <Input name="to" type="date" defaultValue={to} aria-label="To" />
        <Select name="status" aria-label="Status" defaultValue={f.status ?? ""} options={[{ value: "", label: "Any status" }, ...STATUSES.map((s) => ({ value: s, label: s.replace(/_/g, " ") }))]} />
        <Select name="source" aria-label="Source" defaultValue={f.source ?? ""} options={[{ value: "", label: "Any source" }, ...["platform", "phone", "walk_in", "staff"].map((s) => ({ value: s, label: s.replace("_", " ") }))]} />
        <Select name="stateId" aria-label="State" defaultValue={f.stateId ?? ""} options={[{ value: "", label: "Any state" }, ...geo.states.map((s) => ({ value: s.id, label: s.name }))]} />
        <Select name="cityId" aria-label="City" defaultValue={f.cityId ?? ""} options={[{ value: "", label: "Any city" }, ...cities.slice(0, 400).map((c) => ({ value: c.id, label: c.name }))]} />
        {f.practitionerId ? <input type="hidden" name="practitionerId" value={f.practitionerId} /> : null}
        {f.clinicId ? <input type="hidden" name="clinicId" value={f.clinicId} /> : null}
        {f.patientId ? <input type="hidden" name="patientId" value={f.patientId} /> : null}
        <button className="btn btn-secondary" type="submit">Filter</button>
        <Link href="/admin/bookings" className="btn btn-quiet">Reset</Link>
      </form>
      <p className="mb-2 text-xs text-muted">{total} booking(s) · {Object.entries(byStatus).map(([s, n]) => `${n} ${s.replace(/_/g, " ")}`).join(" · ") || "none"} · today is {todayIst()}</p>
      <Table head={["Reference", "Appointment", "Status", "Practitioner", "Clinic · branch", "Place", "Patient", "Offering", "Value", "Source", "Created"]}>
        {rows.length === 0 ? <Empty>No bookings match.</Empty> : null}
        {rows.map((b) => (
          <tr key={b.id} className={b.isTest ? "opacity-70" : ""}>
            <Td><code className="text-xs">{b.reference}</code>{b.isTest ? <div className="text-xs text-muted">test</div> : null}</Td>
            <Td className="text-xs">{fmtDateTime(b.startsAt)}</Td>
            <Td><Pill status={b.status} /></Td>
            <Td><Link href={`/admin/practitioners/${b.practitionerId}`} className="underline">{b.practitionerName}</Link></Td>
            <Td className="text-xs"><Link href={`/admin/clinics/${b.clinicId}`} className="underline">{b.clinicName}</Link> · {b.branchName}</Td>
            <Td className="text-xs">{b.cityName}, {b.stateName}</Td>
            <Td className="text-xs">{b.patientName.split(" ")[0]} <code>{maskMobile(b.patientMobile)}</code></Td>
            <Td className="text-xs">{b.offeringName}</Td>
            <Td>{b.totalPaise == null ? "—" : formatPaise(b.totalPaise)}<div className="text-xs text-muted">{b.paymentMode.replace("_", " ")}</div></Td>
            <Td className="text-xs">{b.source.replace("_", " ")}</Td>
            <Td className="text-xs">{fmtDateTime(b.createdAt)}</Td>
          </tr>
        ))}
      </Table>
      <Pager base="/admin/bookings" sp={sp} page={page} pageSize={50} total={total} />
    </>
  );
}
