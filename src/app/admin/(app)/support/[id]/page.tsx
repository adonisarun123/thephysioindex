import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { PageHeader } from "@/components/admin/admin-shell";
import { DL, Field, Hidden, Notice, Pill, Section, Select, Textarea } from "@/components/admin/ui";
import { fmtDateTime, type SP } from "@/lib/admin/format";
import { getSupport, listSupportEvents, staffOptions, SUPPORT_CATEGORIES } from "@/lib/admin/ops";
import { requireStaff } from "@/lib/auth/session";
import { updateSupportAction } from "../../actions/ops";

export default function Page({ params, searchParams }: PageProps<"/admin/support/[id]">) {
  return (
    <Suspense fallback={<p className="text-muted">Loading case…</p>}>
      <Detail params={params} searchParams={searchParams} />
    </Suspense>
  );
}

const LINK_PATH: Record<string, string> = { practitioner: "/admin/practitioners/", booking: "/admin/bookings?bookingId=", clinic: "/admin/clinics/" };

async function Detail({ params, searchParams }: { params: PageProps<"/admin/support/[id]">["params"]; searchParams: PageProps<"/admin/support/[id]">["searchParams"] }) {
  const { id } = await params;
  const sp = (await searchParams) as SP;
  await connection();
  const v = await requireStaff("support_agent");
  const s = await getSupport(id);
  if (!s) notFound();
  const [events, staff] = await Promise.all([listSupportEvents(id), staffOptions()]);
  const closed = s.state === "resolved" || s.state === "closed";
  return (
    <>
      <PageHeader title={`${s.reference} · ${s.category.replace(/_/g, " ")}`} description={`Opened ${fmtDateTime(s.createdAt)} · ${s.requesterName ?? s.requesterContact ?? "no requester recorded"}`} actions={<Link href="/admin/support" className="btn btn-quiet py-1.5">All cases</Link>} />
      <Notice sp={sp} />
      <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
        <div>
          <Section title="Description"><p className="whitespace-pre-wrap text-sm">{s.description}</p>{s.resolution ? <><h3 className="mt-3 text-sm font-semibold">Resolution</h3><p className="whitespace-pre-wrap text-sm">{s.resolution}</p></> : null}</Section>
          <Section title="Events">
            <ol className="text-sm">
              {events.map((e) => (
                <li key={e.id} className="flex gap-3 border-b border-line py-2"><span className="w-40 shrink-0 text-muted">{fmtDateTime(e.occurredAt)}</span><span><strong>{e.eventType}</strong> by {e.actorName ?? "system"}{typeof e.payload?.note === "string" ? <div className="whitespace-pre-wrap text-ink-2">{e.payload.note}</div> : null}{typeof e.payload?.resolution === "string" ? <div className="text-ink-2">{e.payload.resolution}</div> : null}{typeof e.payload?.to === "string" ? <span className="text-muted"> → {e.payload.to}</span> : null}</span></li>
              ))}
            </ol>
            {!closed ? (
              <form action={updateSupportAction} className="mt-3 grid gap-2">
                <Hidden name="caseId" value={id} /><Hidden name="op" value="note" />
                <Field label="Add a note" name="note"><Textarea name="note" required rows={2} /></Field>
                <div><button className="btn btn-quiet py-1.5" type="submit">Add note</button></div>
              </form>
            ) : null}
          </Section>
        </div>
        <aside>
          <Section title="Status">
            <DL items={[["State", <Pill key="s" status={s.state} />], ["Priority", <Pill key="p" status={s.priority} />], ["Assignee", s.assigneeName ?? "Unassigned"], ["Linked", s.linkedType ? (LINK_PATH[s.linkedType] ? <Link key="l" href={`${LINK_PATH[s.linkedType]}${s.linkedId}`} className="underline">{s.linkedType}: {s.linkedLabel ?? s.linkedId}</Link> : `${s.linkedType}: ${s.linkedId}`) : "—"], ["Resolved", fmtDateTime(s.resolvedAt)]]} />
            <div className="mt-3 grid gap-2">
              <form action={updateSupportAction} className="flex gap-1"><Hidden name="caseId" value={id} /><Hidden name="op" value="assign" /><Select name="assigneeUserId" aria-label="Assignee" defaultValue={s.assigneeUserId ?? ""} className="py-1.5" options={[{ value: "", label: "Unassigned" }, ...staff.map((u) => ({ value: u.id, label: u.name }))]} /><button className="btn btn-quiet py-1.5" type="submit">Assign</button></form>
              {s.assigneeUserId !== v.userId ? <form action={updateSupportAction}><Hidden name="caseId" value={id} /><Hidden name="op" value="assign_me" /><button className="btn btn-secondary py-1.5" type="submit">Assign to me</button></form> : null}
              <form action={updateSupportAction} className="flex gap-1"><Hidden name="caseId" value={id} /><Hidden name="op" value="category" /><Select name="category" aria-label="Category" defaultValue={s.category} className="py-1.5" options={SUPPORT_CATEGORIES.map((c) => ({ value: c, label: c.replace(/_/g, " ") }))} /><button className="btn btn-quiet py-1.5" type="submit">Set</button></form>
              <form action={updateSupportAction} className="flex gap-1"><Hidden name="caseId" value={id} /><Hidden name="op" value="priority" /><Select name="priority" aria-label="Priority" defaultValue={s.priority} className="py-1.5" options={["low", "normal", "high", "urgent"].map((p) => ({ value: p, label: p }))} /><button className="btn btn-quiet py-1.5" type="submit">Set</button></form>
              <form action={updateSupportAction} className="flex gap-1"><Hidden name="caseId" value={id} /><Hidden name="op" value="state" /><Select name="state" aria-label="State" defaultValue={s.state} className="py-1.5" options={["open", "in_progress", "waiting_on_requester", "resolved", "closed"].map((x) => ({ value: x, label: x.replace(/_/g, " ") }))} /><button className="btn btn-quiet py-1.5" type="submit">Set</button></form>
            </div>
          </Section>
          {!closed ? (
            <Section title="Resolve">
              <form action={updateSupportAction} className="grid gap-2">
                <Hidden name="caseId" value={id} /><Hidden name="op" value="resolve" />
                <Field label="Resolution (visible to the requester)" name="resolution"><Textarea name="resolution" required minLength={3} rows={3} /></Field>
                <button className="btn btn-primary py-1.5" type="submit">Mark resolved</button>
              </form>
            </Section>
          ) : null}
        </aside>
      </div>
    </>
  );
}
