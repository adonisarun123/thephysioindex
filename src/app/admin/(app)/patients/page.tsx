import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { PageHeader } from "@/components/admin/admin-shell";
import { Empty, Hidden, Input, Notice, Pager, Pill, Select, Table, Td } from "@/components/admin/ui";
import { clampInt, first, fmtDate, fmtDateTime, maskMobile, qs, type SP } from "@/lib/admin/format";
import { listPatients, recentReveals } from "@/lib/admin/patients";
import { hasRole, requireStaff } from "@/lib/auth/session";
import { revealPatientAction } from "../actions/patients";

export default function Page({ searchParams }: PageProps<"/admin/patients">) {
  return (
    <>
      <PageHeader title="Patients" description="Identifiers are masked by default. Revealing a contact requires the support role and a purpose, and is written to the access log (ADM-04)." actions={<Link href="/admin/patients/export" className="btn btn-quiet py-1.5">Export (purpose-bound)</Link>} />
      <Suspense fallback={<p className="text-muted">Loading…</p>}>
        <List searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function List({ searchParams }: { searchParams: PageProps<"/admin/patients">["searchParams"] }) {
  const sp = (await searchParams) as SP;
  await connection();
  const v = await requireStaff("support_agent");
  const q = first(sp.q) ?? "";
  const status = first(sp.status) || undefined;
  const page = clampInt(sp.page, 1, 100_000, 1);
  const [{ rows, total }, revealed] = await Promise.all([listPatients({ q, status, page, pageSize: 50 }), recentReveals(v.userId)]);
  const canReveal = hasRole(v, "support_agent");
  const self = `/admin/patients${qs({ q, status, page })}`;
  return (
    <>
      <Notice sp={sp} />
      <form method="get" className="mb-4 grid gap-2 sm:grid-cols-[2fr_1fr_auto]">
        <Input name="q" defaultValue={q} placeholder="Name, or last digits of a mobile" aria-label="Search patients" />
        <Select name="status" aria-label="Status" defaultValue={status ?? ""} options={[{ value: "", label: "Any status" }, { value: "active", label: "Active" }, { value: "merged", label: "Merged" }, { value: "closed", label: "Closed" }]} />
        <button className="btn btn-secondary" type="submit">Search</button>
      </form>
      <Table head={["Patient", "Mobile", "Account", "Age band", "Status", "Bookings", "Last appointment", "Created", "Reveal"]}>
        {rows.length === 0 ? <Empty>No patients match.</Empty> : null}
        {rows.map((p) => {
          const shown = revealed.has(p.id);
          return (
            <tr key={p.id}>
              <Td>{p.displayName}{p.isTestAccount ? <span className="ml-1 pill bg-surface-2 text-muted">test</span> : null}<div className="text-xs text-muted">{p.id.slice(0, 8)}</div></Td>
              <Td><code>{shown ? p.mobile ?? "—" : maskMobile(p.mobile)}</code>{p.mobileVerified ? <span className="ml-1 text-xs text-muted">verified</span> : null}</Td>
              <Td className="text-xs">{p.accountContact ? (shown ? p.accountContact : "linked") : <span className="text-muted">walk-in / dependant</span>}</Td>
              <Td>{p.ageBand ?? "—"}</Td>
              <Td><Pill status={p.status} /></Td>
              <Td><Link href={`/admin/bookings?patientId=${p.id}`} className="underline">{p.bookings}</Link></Td>
              <Td className="text-xs">{fmtDateTime(p.lastBookingAt)}</Td>
              <Td className="text-xs">{fmtDate(p.createdAt)}</Td>
              <Td>
                {canReveal && !shown ? (
                  <details>
                    <summary className="cursor-pointer text-sm underline">Reveal</summary>
                    <form action={revealPatientAction} className="mt-1 grid w-60 gap-1 text-sm">
                      <Hidden name="patientId" value={p.id} /><Hidden name="returnTo" value={self} />
                      <Input name="purpose" required minLength={5} placeholder="Purpose (e.g. support case ref)" className="py-1" aria-label="Purpose" />
                      <button className="btn btn-quiet py-1" type="submit">Reveal and log</button>
                    </form>
                  </details>
                ) : shown ? <span className="text-xs text-muted">revealed</span> : null}
              </Td>
            </tr>
          );
        })}
      </Table>
      <Pager base="/admin/patients" sp={sp} page={page} pageSize={50} total={total} />
    </>
  );
}
