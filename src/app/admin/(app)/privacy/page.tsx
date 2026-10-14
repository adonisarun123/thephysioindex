import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { PageHeader } from "@/components/admin/admin-shell";
import { Empty, Notice, Pager, Pill, Table, Tabs, Td } from "@/components/admin/ui";
import { clampInt, first, fmtAge, fmtDateTime, type SP } from "@/lib/admin/format";
import { listPrivacy } from "@/lib/admin/ops";
import { requireStaff } from "@/lib/auth/session";

export default function Page({ searchParams }: PageProps<"/admin/privacy">) {
  return (
    <>
      <PageHeader title="Privacy requests" description="Access, correction, erasure and grievance requests with statutory due dates (Section 26). Verify the requester before acting." />
      <Suspense fallback={<p className="text-muted">Loading…</p>}>
        <List searchParams={searchParams} />
      </Suspense>
    </>
  );
}

const TABS = [["active", "Active"], ["received", "Received"], ["verified", "Verified"], ["in_progress", "In progress"], ["completed", "Completed"], ["rejected", "Rejected"], ["all", "All"]] as const;

async function List({ searchParams }: { searchParams: PageProps<"/admin/privacy">["searchParams"] }) {
  const sp = (await searchParams) as SP;
  await connection();
  await requireStaff("support_agent");
  const state = first(sp.state) ?? "active";
  const page = clampInt(sp.page, 1, 100_000, 1);
  const { rows, total, counts } = await listPrivacy({ state, page, pageSize: 50 });
  const now = new Date();
  return (
    <>
      <Notice sp={sp} />
      <Tabs current={TABS.find((t) => t[0] === state)?.[1] ?? "Active"} items={TABS.map(([k, label]) => ({ href: `/admin/privacy?state=${k}`, label, count: k === "active" ? (counts.received ?? 0) + (counts.verified ?? 0) + (counts.in_progress ?? 0) : k === "all" ? undefined : counts[k] ?? 0 }))} />
      <Table head={["Type", "Requester", "Subject", "State", "Verified", "Due", "Assignee", "Received"]}>
        {rows.length === 0 ? <Empty>No privacy requests.</Empty> : null}
        {rows.map((r) => {
          const overdue = !r.resolvedAt && new Date(r.dueAt) < now;
          return (
            <tr key={r.id} className={overdue ? "bg-alert-soft/40" : ""}>
              <Td><Link href={`/admin/privacy/${r.id}`} className="font-semibold underline">{r.requestType}</Link></Td>
              <Td className="text-xs">{r.requesterName ?? r.requesterContact ?? "—"}</Td>
              <Td className="text-xs">{r.subjectType ? `${r.subjectType} ${r.subjectId?.slice(0, 8) ?? ""}` : "—"}</Td>
              <Td><Pill status={r.state} /></Td>
              <Td>{r.verifiedAt ? "Yes" : <span className="text-alert">No</span>}</Td>
              <Td className="text-xs">{fmtDateTime(r.dueAt)}{overdue ? <div className="text-alert">overdue {fmtAge(r.dueAt)}</div> : null}</Td>
              <Td>{r.assigneeName ?? <span className="text-muted">Unassigned</span>}</Td>
              <Td className="text-xs">{fmtDateTime(r.createdAt)}</Td>
            </tr>
          );
        })}
      </Table>
      <Pager base="/admin/privacy" sp={sp} page={page} pageSize={50} total={total} />
    </>
  );
}
