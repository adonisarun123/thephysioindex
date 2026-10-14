import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { PageHeader } from "@/components/admin/admin-shell";
import { Empty, Input, JsonView, Notice, Select, Table, Td } from "@/components/admin/ui";
import { listAudit } from "@/lib/admin/audit-log";
import { first, fmtDateTime, qs, type SP } from "@/lib/admin/format";
import { requireStaff } from "@/lib/auth/session";

export default function Page({ searchParams }: PageProps<"/admin/audit">) {
  return (
    <>
      <PageHeader title="Audit log" description="Append-only record of privileged actions with actor, role, reason and changed fields (Section 22). Secrets are redacted before insert." />
      <Suspense fallback={<p className="text-muted">Loading…</p>}>
        <List searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function List({ searchParams }: { searchParams: PageProps<"/admin/audit">["searchParams"] }) {
  const sp = (await searchParams) as SP;
  await connection();
  await requireStaff();
  const f = { action: first(sp.action) || undefined, objectType: first(sp.objectType) || undefined, objectId: first(sp.objectId) || undefined, actor: first(sp.actor) || undefined, from: first(sp.from) || undefined, to: first(sp.to) || undefined, cursor: first(sp.cursor) || undefined };
  const { rows, nextCursor, actions, objectTypes } = await listAudit({ ...f, limit: 50 });
  const detail = first(sp.detail);
  return (
    <>
      <Notice sp={sp} />
      <form method="get" className="mb-4 grid gap-2 md:grid-cols-3 lg:grid-cols-7">
        <Select name="action" aria-label="Action" defaultValue={f.action ?? ""} options={[{ value: "", label: "Any action" }, ...actions.map((a) => ({ value: a, label: a }))]} />
        <Select name="objectType" aria-label="Object type" defaultValue={f.objectType ?? ""} options={[{ value: "", label: "Any object" }, ...objectTypes.map((t) => ({ value: t, label: t }))]} />
        <Input name="objectId" defaultValue={f.objectId ?? ""} placeholder="Object id" aria-label="Object id" />
        <Input name="actor" defaultValue={f.actor ?? ""} placeholder="Actor name or email" aria-label="Actor" />
        <Input name="from" type="date" defaultValue={f.from ?? ""} aria-label="From" />
        <Input name="to" type="date" defaultValue={f.to ?? ""} aria-label="To" />
        <button className="btn btn-secondary" type="submit">Filter</button>
      </form>
      <Table head={["When", "Action", "Object", "Actor", "Reason", "Changed fields"]}>
        {rows.length === 0 ? <Empty>No audit events match.</Empty> : null}
        {rows.map((a) => (
          <tr key={a.id} className={detail === a.id ? "bg-brand-soft/40" : ""}>
            <Td className="text-xs">{fmtDateTime(a.occurredAt)}</Td>
            <Td><code className="text-xs">{a.action}</code></Td>
            <Td className="text-xs">{a.objectType}{a.objectId ? <div><Link href={`/admin/audit${qs({ objectId: a.objectId })}`} className="underline">{a.objectId.slice(0, 8)}…</Link></div> : null}</Td>
            <Td className="text-xs">{a.actorName ?? "system"}{a.actorRole ? <div className="text-muted">{a.actorRole}</div> : null}</Td>
            <Td className="max-w-xs text-xs">{a.reason ?? "—"}</Td>
            <Td className="text-xs">{a.changedFields ? (detail === a.id ? <JsonView value={a.changedFields} /> : <Link href={`/admin/audit${qs({ ...f, detail: a.id })}`} className="underline">show</Link>) : "—"}</Td>
          </tr>
        ))}
      </Table>
      <div className="mt-3 flex gap-2 text-sm">
        {f.cursor ? <Link href={`/admin/audit${qs({ ...f, cursor: undefined })}`} className="btn btn-quiet py-1">First page</Link> : null}
        {nextCursor ? <Link href={`/admin/audit${qs({ ...f, cursor: nextCursor })}`} className="btn btn-quiet py-1">Older</Link> : null}
      </div>
    </>
  );
}
