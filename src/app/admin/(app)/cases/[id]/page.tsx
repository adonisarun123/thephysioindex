import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { PageHeader } from "@/components/admin/admin-shell";
import { CaseSubject } from "@/components/admin/case-subject";
import { DL, Field, Hidden, Input, Notice, Pill, Section, Select, Textarea } from "@/components/admin/ui";
import { getCase, listCaseEvents, loadSubject, queueRole } from "@/lib/admin/cases";
import { canDecide, type Decision } from "@/lib/admin/decisions";
import { CASE_TYPE_LABELS, fmtAge, fmtDateTime, type SP } from "@/lib/admin/format";
import { hasRole, requireStaff } from "@/lib/auth/session";
import { addNoteAction, assignToMeAction, decideCaseAction, setPriorityAction, unassignAction } from "../../actions/cases";

export default function Page({ params, searchParams }: PageProps<"/admin/cases/[id]">) {
  return (
    <Suspense fallback={<p className="text-muted">Loading case…</p>}>
      <CasePage params={params} searchParams={searchParams} />
    </Suspense>
  );
}

const DECISION_LABELS: Record<Decision, string> = {
  approved: "Approve",
  rejected: "Reject",
  changes_requested: "Request changes",
  suspended: "Suspend",
  dismissed: "Dismiss",
  merged: "Merge",
  reinstated: "Reinstate",
};

function decisionsFor(caseType: string): Decision[] {
  switch (caseType) {
    case "listing_review":
    case "profile_change":
      return ["approved", "changes_requested", "rejected", "suspended"];
    case "claim":
      return ["approved", "changes_requested", "rejected"];
    case "credential_check":
      return ["approved", "changes_requested", "rejected", "suspended"];
    case "duplicate_candidate":
      return ["merged", "dismissed"];
    case "offer_review":
      return ["approved", "changes_requested", "rejected", "suspended"];
    case "review_moderation":
      return ["approved", "rejected"];
    case "complaint":
    case "credential_fraud":
      return ["approved", "dismissed", "changes_requested", "suspended"];
    case "correction_request":
      return ["approved", "rejected", "changes_requested"];
    case "locality_proposal":
      return ["approved", "rejected"];
    default:
      return ["approved", "rejected"];
  }
}

async function CasePage({ params, searchParams }: { params: PageProps<"/admin/cases/[id]">["params"]; searchParams: PageProps<"/admin/cases/[id]">["searchParams"] }) {
  const { id } = await params;
  const sp = (await searchParams) as SP;
  await connection();
  const v = await requireStaff();
  const c = await getCase(id);
  if (!c) notFound();
  if (!hasRole(v, queueRole(c.caseType)) && !hasRole(v, "super_admin")) notFound();
  const [events, subject] = await Promise.all([listCaseEvents(id), loadSubject(c.subjectType, c.subjectId)]);
  const decided = c.state === "decided" || c.state === "closed";
  const options = decisionsFor(c.caseType).filter((d) => canDecide(v, c.caseType, d));
  const self = `/admin/cases/${id}`;
  const isSecondAdminCase = c.caseType === "ownership_transfer" || c.caseType === "role_escalation";

  return (
    <>
      <PageHeader
        title={`${CASE_TYPE_LABELS[c.caseType]}: ${c.summary ?? c.subjectType}`}
        description={`Case ${id.slice(0, 8)} · submitted ${fmtDateTime(c.submittedAt)} by ${c.submittedByName ?? "system"} · age ${fmtAge(c.submittedAt, c.decidedAt ?? new Date())}${c.overdue ? " · OVERDUE" : ""}`}
        actions={<Link className="btn btn-quiet py-1.5" href={`/admin/queues/${c.caseType}`}>Back to queue</Link>}
      />
      <Notice sp={sp} />
      <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
        <div>
          <CaseSubject subjectType={c.subjectType} subject={subject} />

          <Section title="Timeline">
            <ol className="text-sm">
              <li className="flex gap-3 border-b border-line py-2"><span className="w-40 shrink-0 text-muted">{fmtDateTime(c.submittedAt)}</span><span>Submitted by {c.submittedByName ?? "system"}</span></li>
              {events.map((e) => (
                <li key={e.id} className="flex gap-3 border-b border-line py-2">
                  <span className="w-40 shrink-0 text-muted">{fmtDateTime(e.occurredAt)}</span>
                  <span>
                    <strong>{e.eventType}</strong> by {e.actorName ?? "system"}
                    {e.payload?.decision ? <> — <Pill status={String(e.payload.decision)} /></> : null}
                    {typeof e.payload?.reason === "string" ? <div className="text-ink-2">{e.payload.reason}</div> : null}
                    {typeof e.payload?.note === "string" ? <div className="whitespace-pre-wrap text-ink-2">{e.payload.note}</div> : null}
                    {typeof e.payload?.message === "string" ? <div className="text-xs text-muted">{e.payload.message}</div> : null}
                  </span>
                </li>
              ))}
            </ol>
            {!decided ? (
              <form action={addNoteAction} className="mt-3 grid gap-2">
                <Hidden name="caseId" value={id} />
                <Field label="Add a note" name="note"><Textarea name="note" required maxLength={4000} rows={2} /></Field>
                <div><button className="btn btn-quiet py-1.5" type="submit">Add note</button></div>
              </form>
            ) : null}
          </Section>
        </div>

        <aside>
          <Section title="Status">
            <DL items={[["State", <Pill key="s" status={c.state} />], ["Priority", <Pill key="p" status={c.priority} />], ["Assignee", c.assigneeName ?? "Unassigned"], ["Practitioner", c.practitionerId ? <Link key="pr" href={`/admin/practitioners/${c.practitionerId}`} className="underline">{c.practitionerName}</Link> : "—"], ["First response", c.firstResponseAt ? fmtDateTime(c.firstResponseAt) : "Pending"], ["Decision", c.decision ? <><Pill status={c.decision} /> by {c.decidedByName} at {fmtDateTime(c.decidedAt)}</> : "—"], ["Decision reason", c.decisionReason ?? "—"], ["Method", c.method ?? "—"], ["Evidence ref", typeof c.evidence?.decisionEvidenceRef === "string" ? c.evidence.decisionEvidenceRef : "—"]]} />
            {!decided ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {c.assigneeUserId !== v.userId ? (
                  <form action={assignToMeAction}><Hidden name="caseId" value={id} /><button className="btn btn-secondary py-1.5" type="submit">Assign to me</button></form>
                ) : (
                  <form action={unassignAction}><Hidden name="caseId" value={id} /><button className="btn btn-quiet py-1.5" type="submit">Unassign</button></form>
                )}
                <form action={setPriorityAction} className="flex gap-1">
                  <Hidden name="caseId" value={id} />
                  <Select name="priority" aria-label="Priority" defaultValue={c.priority} className="py-1.5" options={["low", "normal", "high", "urgent"].map((p) => ({ value: p, label: p }))} />
                  <button className="btn btn-quiet py-1.5" type="submit">Set</button>
                </form>
              </div>
            ) : null}
          </Section>

          {Object.keys(c.evidence ?? {}).filter((k) => k !== "decisionEvidenceRef").length ? (
            <Section title="Case evidence">
              <pre className="max-h-64 overflow-auto rounded-[var(--r-sm)] bg-surface-2 p-2 text-xs">{JSON.stringify(c.evidence, null, 2)}</pre>
            </Section>
          ) : null}

          {!decided ? (
            <Section title="Decision">
              {isSecondAdminCase ? (
                <p className="mb-2 text-xs text-muted">Needs a second super administrator; the requester cannot approve (IAM-03).{c.submittedByUserId === v.userId ? " You raised this request." : ""}</p>
              ) : null}
              {options.length === 0 ? (
                <p className="text-sm text-muted">Your role cannot decide this case.</p>
              ) : (
                <form action={decideCaseAction} className="grid gap-3">
                  <Hidden name="caseId" value={id} />
                  <Hidden name="returnTo" value={self} />
                  <Field label="Decision" name="decision">
                    <Select name="decision" required options={options.map((d) => ({ value: d, label: DECISION_LABELS[d] }))} />
                  </Field>
                  {c.caseType === "credential_check" ? <CredentialFields /> : null}
                  {c.caseType === "duplicate_candidate" ? (
                    <Field label="Keep" name="keep" hint="The other record is archived and its slug redirects here (DIR-15).">
                      <Select name="keep" options={[{ value: "a", label: "Keep A, merge B into it" }, { value: "b", label: "Keep B, merge A into it" }]} />
                    </Field>
                  ) : null}
                  {c.caseType === "locality_proposal" ? (
                    <Field label="Map to existing locality id (optional)" name="resolvedLocalityId" hint="Leave blank to create the locality."><Input name="resolvedLocalityId" placeholder="uuid" /></Field>
                  ) : null}
                  <Field label="Reason (required, shown to the submitter where applicable)" name="reason"><Textarea name="reason" required minLength={3} maxLength={2000} /></Field>
                  <Field label="Evidence reference (optional)" name="evidenceRef" hint="Register lookup URL, document id or note."><Input name="evidenceRef" maxLength={500} /></Field>
                  <button className="btn btn-primary" type="submit">Record decision</button>
                </form>
              )}
            </Section>
          ) : null}
        </aside>
      </div>
    </>
  );
}

function CredentialFields() {
  return (
    <>
      <Field label="Resulting credential status" name="credentialStatus" hint="Approve → registration checked or document reviewed. Expired/suspended/revoked statutory registrations remove booking eligibility (VER-06).">
        <Select
          name="credentialStatus"
          options={[
            { value: "registration_checked", label: "Registration checked (official register)" },
            { value: "document_reviewed", label: "Document reviewed (manual)" },
            { value: "unverifiable", label: "Unverifiable" },
            { value: "expired", label: "Expired" },
            { value: "suspended", label: "Suspended by issuer" },
            { value: "revoked", label: "Revoked" },
          ]}
        />
      </Field>
      <Field label="Method (VER-02)" name="method"><Input name="method" required placeholder="e.g. Issuer register lookup; certificate compared to identity proof" /></Field>
      <Field label="Scope of check" name="scopeOfCheck"><Input name="scopeOfCheck" placeholder="e.g. Name and number matched on the issuer's public register" /></Field>
      <Field label="Next review date" name="nextReviewAt"><Input name="nextReviewAt" type="date" /></Field>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="publicNumberApproved" /> Approve showing the number publicly (registration checked only)</label>
    </>
  );
}
