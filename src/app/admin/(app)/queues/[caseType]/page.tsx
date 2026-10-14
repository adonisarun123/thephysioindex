import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { PageHeader } from "@/components/admin/admin-shell";
import { Empty, Hidden, Notice, Pager, Pill, Select, Table, Tabs, Td, Textarea } from "@/components/admin/ui";
import { CASE_STATES, listCases, queueRole, type CaseRow } from "@/lib/admin/cases";
import { CASE_TYPES, CASE_TYPE_LABELS, clampInt, first, fmtAge, fmtDateTime, qs, type SP } from "@/lib/admin/format";
import { requireStaff } from "@/lib/auth/session";
import { bulkApplyAction } from "../../actions/cases";

export default function Page({ params, searchParams }: PageProps<"/admin/queues/[caseType]">) {
  return (
    <Suspense fallback={<p className="text-muted">Loading queue…</p>}>
      <Queue params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Queue({ params, searchParams }: { params: PageProps<"/admin/queues/[caseType]">["params"]; searchParams: PageProps<"/admin/queues/[caseType]">["searchParams"] }) {
  const { caseType } = await params;
  if (!CASE_TYPES.includes(caseType)) notFound();
  const sp = (await searchParams) as SP;
  await connection();
  const v = await requireStaff(queueRole(caseType));
  const state = first(sp.state) ?? "open";
  const priority = first(sp.priority) || undefined;
  const assignee = (first(sp.assignee) as "me" | "unassigned" | "any" | undefined) ?? "any";
  const page = clampInt(sp.page, 1, 10_000, 1);
  const { rows, total, counts, target } = await listCases({ caseType, state, priority, assignee, viewerUserId: v.userId, page, pageSize: 50 });
  const base = `/admin/queues/${caseType}`;
  const selected = new Set((Array.isArray(sp.ids) ? sp.ids : sp.ids ? [sp.ids] : []) as string[]);
  const bulk = first(sp.bulk);
  const preview = bulk && selected.size ? rows.filter((r) => selected.has(r.id)) : [];
  const result = decodeResult(first(sp.result));
  const overdueCount = rows.filter((r) => r.overdue).length;

  return (
    <>
      <PageHeader title={CASE_TYPE_LABELS[caseType]} description={`First-response target ${target} business day${target === 1 ? "" : "s"} (ADM-02). ${overdueCount ? `${overdueCount} overdue on this page.` : "Nothing overdue on this page."}`} />
      <Notice sp={sp} />
      <Tabs
        current={state === "all" ? "All" : state.replace("_", " ")}
        items={[
          ...CASE_STATES.map((s) => ({ href: `${base}${qs({ state: s, priority, assignee })}`, label: s.replace("_", " "), count: counts[s] ?? 0 })),
          { href: `${base}${qs({ state: "all", priority, assignee })}`, label: "All" },
        ]}
      />
      <form method="get" action={base} className="mb-3 flex flex-wrap items-end gap-2 text-sm">
        <Hidden name="state" value={state} />
        <div>
          <label className="label" htmlFor="priority">Priority</label>
          <Select name="priority" defaultValue={priority ?? ""} className="py-1.5" options={[{ value: "", label: "Any" }, { value: "urgent", label: "Urgent" }, { value: "high", label: "High" }, { value: "normal", label: "Normal" }, { value: "low", label: "Low" }]} />
        </div>
        <div>
          <label className="label" htmlFor="assignee">Assignee</label>
          <Select name="assignee" defaultValue={assignee} className="py-1.5" options={[{ value: "any", label: "Anyone" }, { value: "me", label: "Me" }, { value: "unassigned", label: "Unassigned" }]} />
        </div>
        <button className="btn btn-quiet py-1.5" type="submit">Filter</button>
      </form>

      {result ? <ResultPanel result={result} /> : null}
      {preview.length ? <BulkPreview caseType={caseType} state={state} op={bulk!} rows={preview} /> : null}

      <form method="get" action={base}>
        <Hidden name="state" value={state} />
        {priority ? <Hidden name="priority" value={priority} /> : null}
        {assignee !== "any" ? <Hidden name="assignee" value={assignee} /> : null}
        {state !== "decided" && state !== "all" ? (
          <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted">With selected:</span>
            <button className="btn btn-quiet py-1" type="submit" name="bulk" value="assign_me">Preview assign to me</button>
            <button className="btn btn-quiet py-1" type="submit" name="bulk" value="reject">Preview reject with reason</button>
          </div>
        ) : null}
        <Table head={[<span key="s" className="sr-only">Select</span>, "Subject", "Practitioner", "Priority", "State", "Assignee", "Submitted", "Age", state === "decided" || state === "all" ? "Decision" : "Due"]} caption={`${CASE_TYPE_LABELS[caseType]} cases`}>
          {rows.length === 0 ? <Empty>No cases in this state.</Empty> : null}
          {rows.map((r) => (
            <tr key={r.id} className={r.overdue ? "bg-alert-soft/40" : ""}>
              <Td>
                <input type="checkbox" name="ids" value={r.id} aria-label={`Select case ${r.summary ?? r.id}`} defaultChecked={selected.has(r.id)} disabled={r.state === "decided" || r.state === "closed"} />
              </Td>
              <Td>
                <Link href={`/admin/cases/${r.id}`} className="font-semibold underline">{r.summary ?? r.subjectType}</Link>
                <div className="text-xs text-muted">{r.subjectType.replace("_", " ")}</div>
              </Td>
              <Td>{r.practitionerId ? <Link href={`/admin/practitioners/${r.practitionerId}`} className="underline">{r.practitionerName}</Link> : "—"}</Td>
              <Td><Pill status={r.priority} /></Td>
              <Td><Pill status={r.state} /></Td>
              <Td>{r.assigneeName ?? <span className="text-muted">Unassigned</span>}</Td>
              <Td>{fmtDateTime(r.submittedAt)}<div className="text-xs text-muted">by {r.submittedByName ?? "system"}</div></Td>
              <Td>{fmtAge(r.submittedAt, r.decidedAt ?? new Date())}</Td>
              <Td>{state === "decided" || state === "all" ? <Pill status={r.decision} /> : r.overdue ? <Pill status="urgent" label="Overdue" /> : <span className="text-muted">On time</span>}</Td>
            </tr>
          ))}
        </Table>
      </form>
      <Pager base={base} sp={sp} page={page} pageSize={50} total={total} />
    </>
  );
}

function BulkPreview({ caseType, state, op, rows }: { caseType: string; state: string; op: string; rows: CaseRow[] }) {
  return (
    <section className="card mb-4 border-mark p-4" aria-labelledby="bulk-heading">
      <h2 id="bulk-heading" className="font-semibold">Bulk {op === "reject" ? "reject" : "assign to me"} — {rows.length} case{rows.length === 1 ? "" : "s"} affected</h2>
      <ul className="mt-2 max-h-48 overflow-auto text-sm">
        {rows.map((r) => (
          <li key={r.id} className="border-b border-line py-1">{r.summary ?? r.id} <span className="text-muted">· {r.state}</span></li>
        ))}
      </ul>
      <form action={bulkApplyAction} className="mt-3 grid gap-2">
        <Hidden name="op" value={op} />
        <Hidden name="caseType" value={caseType} />
        <Hidden name="state" value={state} />
        {rows.map((r) => <Hidden key={r.id} name="ids" value={r.id} />)}
        {op === "reject" ? (
          <div>
            <label className="label" htmlFor="reason">Reason (recorded on every case)</label>
            <Textarea name="reason" required minLength={3} />
          </div>
        ) : null}
        <div className="flex gap-2">
          <button className="btn btn-primary py-1.5" type="submit">Apply to {rows.length}</button>
          <Link className="btn btn-quiet py-1.5" href={`/admin/queues/${caseType}?state=${state}`}>Cancel</Link>
        </div>
      </form>
    </section>
  );
}

type Outcome = { id: string; ok: boolean; message: string };
function decodeResult(s: string | undefined): Outcome[] | null {
  if (!s) return null;
  try {
    const parsed = JSON.parse(Buffer.from(s, "base64url").toString("utf8"));
    return Array.isArray(parsed) ? (parsed as Outcome[]) : null;
  } catch {
    return null;
  }
}

function ResultPanel({ result }: { result: Outcome[] }) {
  return (
    <section className="card mb-4 p-4">
      <h2 className="font-semibold">Bulk outcome — {result.filter((r) => r.ok).length} of {result.length} succeeded</h2>
      <ul className="mt-2 text-sm">
        {result.map((r) => (
          <li key={r.id} className="flex gap-2 border-b border-line py-1">
            <Pill status={r.ok ? "approved" : "rejected"} label={r.ok ? "OK" : "Failed"} />
            <Link href={`/admin/cases/${r.id}`} className="underline">{r.id.slice(0, 8)}</Link>
            <span className="text-muted">{r.message}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
