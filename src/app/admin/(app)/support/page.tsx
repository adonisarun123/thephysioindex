import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { PageHeader } from "@/components/admin/admin-shell";
import { Empty, Hidden, Notice, Pager, Pill, Select, Table, Tabs, Td } from "@/components/admin/ui";
import { clampInt, first, fmtAge, fmtDateTime, qs, type SP } from "@/lib/admin/format";
import { listSupport, SUPPORT_CATEGORIES } from "@/lib/admin/ops";
import { requireStaff } from "@/lib/auth/session";

export default function Page({ searchParams }: PageProps<"/admin/support">) {
  return (
    <>
      <PageHeader title="Support cases" description="Cases link to a listing, booking, review or clinic, carry a category and owner, and preserve an appeal path (ADM-07)." actions={<Link href="/admin/support/new" className="btn btn-primary py-1.5">New case</Link>} />
      <Suspense fallback={<p className="text-muted">Loading…</p>}>
        <List searchParams={searchParams} />
      </Suspense>
    </>
  );
}

const TABS = [["active", "Active"], ["open", "Open"], ["in_progress", "In progress"], ["waiting_on_requester", "Waiting on requester"], ["resolved", "Resolved"], ["closed", "Closed"], ["all", "All"]] as const;

async function List({ searchParams }: { searchParams: PageProps<"/admin/support">["searchParams"] }) {
  const sp = (await searchParams) as SP;
  await connection();
  const v = await requireStaff("support_agent");
  const state = first(sp.state) ?? "active";
  const category = first(sp.category) || undefined;
  const assignee = first(sp.assignee) || undefined;
  const page = clampInt(sp.page, 1, 100_000, 1);
  const { rows, total, counts } = await listSupport({ state, category, assignee, viewerUserId: v.userId, page, pageSize: 50 });
  return (
    <>
      <Notice sp={sp} />
      <Tabs current={TABS.find((t) => t[0] === state)?.[1] ?? "Active"} items={TABS.map(([k, label]) => ({ href: `/admin/support${qs({ state: k, category, assignee })}`, label, count: k === "active" ? (counts.open ?? 0) + (counts.in_progress ?? 0) + (counts.waiting_on_requester ?? 0) : k === "all" ? undefined : counts[k] ?? 0 }))} />
      <form method="get" className="mb-3 flex flex-wrap items-end gap-2 text-sm">
        <Hidden name="state" value={state} />
        <Select name="category" aria-label="Category" defaultValue={category ?? ""} className="w-48 py-1.5" options={[{ value: "", label: "Any category" }, ...SUPPORT_CATEGORIES.map((c) => ({ value: c, label: c.replace(/_/g, " ") }))]} />
        <Select name="assignee" aria-label="Assignee" defaultValue={assignee ?? ""} className="w-40 py-1.5" options={[{ value: "", label: "Anyone" }, { value: "me", label: "Me" }, { value: "unassigned", label: "Unassigned" }]} />
        <button className="btn btn-quiet py-1.5" type="submit">Filter</button>
      </form>
      <Table head={["Reference", "Category", "Priority", "State", "Linked to", "Requester", "Assignee", "Opened", "Age"]}>
        {rows.length === 0 ? <Empty>No support cases.</Empty> : null}
        {rows.map((s) => (
          <tr key={s.id}>
            <Td><Link href={`/admin/support/${s.id}`} className="font-semibold underline">{s.reference}</Link></Td>
            <Td>{s.category.replace(/_/g, " ")}</Td><Td><Pill status={s.priority} /></Td><Td><Pill status={s.state} /></Td>
            <Td className="text-xs">{s.linkedType ? `${s.linkedType}: ${s.linkedLabel ?? s.linkedId?.slice(0, 8)}` : "—"}</Td>
            <Td className="text-xs">{s.requesterName ?? s.requesterContact ?? "—"}</Td>
            <Td>{s.assigneeName ?? <span className="text-muted">Unassigned</span>}</Td>
            <Td className="text-xs">{fmtDateTime(s.createdAt)}</Td><Td>{fmtAge(s.createdAt, s.resolvedAt ?? new Date())}</Td>
          </tr>
        ))}
      </Table>
      <Pager base="/admin/support" sp={sp} page={page} pageSize={50} total={total} />
    </>
  );
}
