import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { PageHeader } from "@/components/admin/admin-shell";
import { Empty, Hidden, Input, Notice, Pill, Select, Table, Td } from "@/components/admin/ui";
import type { SP } from "@/lib/admin/format";
import { listStatesAdmin, pendingLocalityProposals } from "@/lib/admin/master";
import { hasRole, requireStaff } from "@/lib/auth/session";
import { updateStateAction } from "../actions/geography";

export default function Page({ searchParams }: PageProps<"/admin/geography">) {
  return (
    <>
      <PageHeader title="Geography" description="States, cities and localities are controlled records with stable ids, status and aliases (DIR-07). Merges keep old slugs as redirects (DIR-15)." actions={<Link href="/admin/queues/locality_proposal" className="btn btn-quiet py-1.5">Locality proposals</Link>} />
      <Suspense fallback={<p className="text-muted">Loading…</p>}>
        <States searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function States({ searchParams }: { searchParams: PageProps<"/admin/geography">["searchParams"] }) {
  const sp = (await searchParams) as SP;
  await connection();
  const v = await requireStaff();
  const [states, pending] = await Promise.all([listStatesAdmin(), pendingLocalityProposals()]);
  const isSuper = hasRole(v, "super_admin");
  return (
    <>
      <Notice sp={sp} />
      {pending ? <p className="mb-3 text-sm"><Link href="/admin/queues/locality_proposal" className="underline">{pending} locality proposal(s) awaiting review</Link></p> : null}
      <Table head={["State / UT", "Code", "Kind", "Status", "Active cities", "Practitioners", isSuper ? "Edit" : ""]}>
        {states.length === 0 ? <Empty>No states seeded.</Empty> : null}
        {states.map((s) => (
          <tr key={s.id}>
            <Td><Link href={`/admin/geography/${s.id}`} className="font-semibold underline">{s.name}</Link><div className="text-xs text-muted">/{s.slug}</div></Td>
            <Td><code>{s.code}</code></Td>
            <Td>{s.kind.replace("_", " ")}</Td>
            <Td><Pill status={s.status} /></Td>
            <Td>{s.cities}</Td>
            <Td>{s.practitioners}</Td>
            <Td>
              {isSuper ? (
                <details>
                  <summary className="cursor-pointer text-sm underline">Edit</summary>
                  <form action={updateStateAction} className="mt-2 grid w-64 gap-1 text-sm">
                    <Hidden name="stateId" value={s.id} />
                    <Input name="name" defaultValue={s.name} required aria-label="Name" className="py-1" />
                    <Select name="kind" defaultValue={s.kind} aria-label="Kind" className="py-1" options={[{ value: "state", label: "State" }, { value: "union_territory", label: "Union territory" }]} />
                    <Select name="status" defaultValue={s.status} aria-label="Status" className="py-1" options={[{ value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }]} />
                    <Input name="sortOrder" type="number" defaultValue={s.sortOrder} aria-label="Sort order" className="py-1" />
                    <Input name="reason" required placeholder="Reason" aria-label="Reason" className="py-1" />
                    <button className="btn btn-secondary py-1" type="submit">Save</button>
                  </form>
                </details>
              ) : null}
            </Td>
          </tr>
        ))}
      </Table>
    </>
  );
}
