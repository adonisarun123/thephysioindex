import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { PageHeader } from "@/components/admin/admin-shell";
import { DL, Field, Hidden, Notice, Pill, Section, Select, Textarea } from "@/components/admin/ui";
import { fmtDateTime, type SP } from "@/lib/admin/format";
import { getPrivacy, staffOptions } from "@/lib/admin/ops";
import { auditFor } from "@/lib/admin/practitioners";
import { requireStaff } from "@/lib/auth/session";
import { privacyAction } from "../../actions/ops";

export default function Page({ params, searchParams }: PageProps<"/admin/privacy/[id]">) {
  return (
    <Suspense fallback={<p className="text-muted">Loading request…</p>}>
      <Detail params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Detail({ params, searchParams }: { params: PageProps<"/admin/privacy/[id]">["params"]; searchParams: PageProps<"/admin/privacy/[id]">["searchParams"] }) {
  const { id } = await params;
  const sp = (await searchParams) as SP;
  await connection();
  const v = await requireStaff("support_agent");
  const r = await getPrivacy(id);
  if (!r) notFound();
  const [staff, audit] = await Promise.all([staffOptions(), auditFor("privacy_request", id, 30)]);
  const done = r.state === "completed" || r.state === "rejected";
  return (
    <>
      <PageHeader title={`Privacy request · ${r.requestType}`} description={`Received ${fmtDateTime(r.createdAt)} · due ${fmtDateTime(r.dueAt)}`} actions={<Link href="/admin/privacy" className="btn btn-quiet py-1.5">All requests</Link>} />
      <Notice sp={sp} />
      <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
        <div>
          <Section title="Request">
            <DL items={[["Requester", r.requesterName ?? r.requesterContact ?? "—"], ["Subject", r.subjectType ? `${r.subjectType} ${r.subjectId ?? ""}` : "—"], ["Details", <span key="d" className="whitespace-pre-wrap">{r.details ?? "—"}</span>], ["Resolution", r.resolution ?? "—"], ["Resolved", fmtDateTime(r.resolvedAt)]]} />
          </Section>
          <Section title="Audit">
            <ul className="divide-y divide-line text-sm">{audit.length === 0 ? <li className="py-2 text-muted">No events yet.</li> : null}{audit.map((a) => <li key={a.id} className="py-1.5"><span className="text-xs text-muted">{fmtDateTime(a.occurredAt)}</span> <code className="text-xs">{a.action}</code> <span className="text-muted">by {a.actorName}</span>{a.reason ? <div>{a.reason}</div> : null}</li>)}</ul>
          </Section>
        </div>
        <aside>
          <Section title="Status">
            <DL items={[["State", <Pill key="s" status={r.state} />], ["Identity verified", r.verifiedAt ? fmtDateTime(r.verifiedAt) : <span className="text-alert">Not yet</span>], ["Assignee", r.assigneeName ?? "Unassigned"]]} />
            {!done ? (
              <div className="mt-3 grid gap-2">
                {!r.verifiedAt ? <form action={privacyAction}><Hidden name="requestId" value={id} /><Hidden name="op" value="verify" /><button className="btn btn-secondary py-1.5" type="submit">Mark requester verified</button></form> : null}
                <form action={privacyAction} className="flex gap-1"><Hidden name="requestId" value={id} /><Hidden name="op" value="assign" /><Select name="assigneeUserId" aria-label="Assignee" defaultValue={r.assigneeUserId ?? ""} className="py-1.5" options={[{ value: "", label: "Unassigned" }, ...staff.map((u) => ({ value: u.id, label: u.name }))]} /><button className="btn btn-quiet py-1.5" type="submit">Assign</button></form>
                {r.assigneeUserId !== v.userId ? <form action={privacyAction}><Hidden name="requestId" value={id} /><Hidden name="op" value="assign_me" /><button className="btn btn-quiet py-1.5" type="submit">Assign to me</button></form> : null}
                {r.state !== "in_progress" ? <form action={privacyAction}><Hidden name="requestId" value={id} /><Hidden name="op" value="start" /><button className="btn btn-quiet py-1.5" type="submit">Start work</button></form> : null}
              </div>
            ) : null}
          </Section>
          {!done ? (
            <>
              <Section title="Complete">
                <form action={privacyAction} className="grid gap-2">
                  <Hidden name="requestId" value={id} /><Hidden name="op" value="resolve" />
                  <Field label="Resolution (what was provided, corrected or erased)" name="resolution"><Textarea name="resolution" required minLength={3} rows={3} /></Field>
                  <button className="btn btn-primary py-1.5" type="submit" disabled={!r.verifiedAt}>Complete request</button>
                  {!r.verifiedAt ? <p className="text-xs text-muted">Verify the requester first.</p> : null}
                </form>
              </Section>
              <Section title="Reject">
                <form action={privacyAction} className="grid gap-2">
                  <Hidden name="requestId" value={id} /><Hidden name="op" value="reject" />
                  <Field label="Reason" name="reason"><Textarea name="reason" required minLength={3} rows={2} /></Field>
                  <button className="btn btn-quiet py-1.5" type="submit">Reject</button>
                </form>
              </Section>
            </>
          ) : null}
        </aside>
      </div>
    </>
  );
}
