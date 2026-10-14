import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { PageHeader } from "@/components/admin/admin-shell";
import { Empty, Input, Notice, Pager, Pill, Select, Table, Td } from "@/components/admin/ui";
import { listClinics } from "@/lib/admin/clinics";
import { clampInt, first, fmtDate, type SP } from "@/lib/admin/format";
import { requireStaff } from "@/lib/auth/session";

export default function Page({ searchParams }: PageProps<"/admin/clinics">) {
  return (
    <>
      <PageHeader title="Clinics" description="Care organisations and their branches (LOC-01). Ownership is reviewed separately from practitioner affiliation (LOC-03)." />
      <Suspense fallback={<p className="text-muted">Loading…</p>}>
        <List searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function List({ searchParams }: { searchParams: PageProps<"/admin/clinics">["searchParams"] }) {
  const sp = (await searchParams) as SP;
  await connection();
  await requireStaff();
  const q = first(sp.q) ?? "";
  const status = first(sp.status) || undefined;
  const page = clampInt(sp.page, 1, 100_000, 1);
  const { rows, total } = await listClinics({ q, status, page, pageSize: 50 });
  return (
    <>
      <Notice sp={sp} />
      <form method="get" className="mb-4 grid gap-2 sm:grid-cols-[2fr_1fr_auto]">
        <Input name="q" defaultValue={q} placeholder="Clinic name or public id" aria-label="Search clinics" />
        <Select name="status" aria-label="Status" defaultValue={status ?? ""} options={[{ value: "", label: "Any status" }, ...["draft", "published", "suspended", "archived"].map((s) => ({ value: s, label: s }))]} />
        <button className="btn btn-secondary" type="submit">Filter</button>
      </form>
      <Table head={["Clinic", "Status", "Owner", "Branches", "Practitioners", "Cities", "Created"]}>
        {rows.length === 0 ? <Empty>No clinics match.</Empty> : null}
        {rows.map((c) => (
          <tr key={c.id}>
            <Td><Link href={`/admin/clinics/${c.id}`} className="font-semibold underline">{c.name}</Link><div className="text-xs text-muted">{c.publicId}</div></Td>
            <Td><Pill status={c.status} /></Td>
            <Td>{c.ownerName ?? <span className="text-muted">unclaimed</span>}</Td>
            <Td>{c.branches}</Td><Td>{c.practitioners}</Td><Td className="text-xs">{c.cities ?? "—"}</Td><Td className="text-xs">{fmtDate(c.createdAt)}</Td>
          </tr>
        ))}
      </Table>
      <Pager base="/admin/clinics" sp={sp} page={page} pageSize={50} total={total} />
    </>
  );
}
