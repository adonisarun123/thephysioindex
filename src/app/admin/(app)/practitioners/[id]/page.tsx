import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { PageHeader } from "@/components/admin/admin-shell";
import { ActionsPanel, AssociationsPanel, CredentialsPanel, OfferingsPanel } from "@/components/admin/practitioner-panels";
import { DL, Empty, Field, Hidden, JsonView, Notice, Pill, Section, Select, Table, Td, Textarea } from "@/components/admin/ui";
import { listCases } from "@/lib/admin/cases";
import { CASE_TYPE_LABELS, fmtDate, fmtDateTime, type SP } from "@/lib/admin/format";
import { bookingEligibilityChecklist } from "@/lib/admin/practitioner-ops";
import { auditFor, getPractitionerDetail, listAssociations, listCredentials, listDuplicateCandidates, listOfferings, listSlugHistory } from "@/lib/admin/practitioners";
import { diffContent } from "@/lib/admin/profile-content";
import { hasRole, requireStaff } from "@/lib/auth/session";
import { db } from "@/db/client";
import { VERIFICATION_LABELS } from "@/lib/verification";
import { createCaseAction } from "../../actions/cases";
import { submitForReviewAction } from "../../actions/practitioners";

export default function Page({ params, searchParams }: PageProps<"/admin/practitioners/[id]">) {
  return (
    <Suspense fallback={<p className="text-muted">Loading practitioner…</p>}>
      <Detail params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Detail({ params, searchParams }: { params: PageProps<"/admin/practitioners/[id]">["params"]; searchParams: PageProps<"/admin/practitioners/[id]">["searchParams"] }) {
  const { id } = await params;
  const sp = (await searchParams) as SP;
  await connection();
  const v = await requireStaff();
  const p = await getPractitionerDetail(id);
  if (!p) notFound();
  const [credentials, associations, offerings, cases, slugs, audit, dups, checks] = await Promise.all([
    listCredentials(id),
    listAssociations(id),
    listOfferings(id),
    listCases({ practitionerId: id, state: "all", viewerUserId: v.userId, pageSize: 30 }),
    listSlugHistory(id),
    auditFor("practitioner", id),
    listDuplicateCandidates(id),
    bookingEligibilityChecklist(db(), id),
  ]);
  const canReview = hasRole(v, "verification_reviewer");
  const diff = p.latestDraft ? diffContent(p.publishedContent, p.latestDraft.structuredContent) : [];
  const self = `/admin/practitioners/${id}`;

  return (
    <>
      <PageHeader
        title={p.displayName}
        description={`${p.designation ?? "Physiotherapist"} · ${p.publicId} · ${p.source.replace("_", " ")}${p.isTestAccount ? " · TEST ACCOUNT" : ""}`}
        actions={
          <>
            {p.listingStatus === "published" ? <Link className="btn btn-quiet py-1.5" href={`/physiotherapist/${p.slug}-${p.publicId}`} target="_blank">Public page</Link> : null}
            {canReview && p.latestDraft ? (
              <form action={submitForReviewAction}><Hidden name="practitionerId" value={id} /><button className="btn btn-secondary py-1.5" type="submit">{p.latestDraft.state === "submitted" ? "Open review case" : "Submit draft for review"}</button></form>
            ) : null}
          </>
        }
      />
      <Notice sp={sp} />
      <div className="flex flex-wrap gap-2 text-sm">
        <Pill status={p.listingStatus} /><Pill status={p.claimState} />
        <Pill status={p.verification === "not_verified" ? "self_declared" : p.verification === "restricted" ? "revoked" : p.verification} label={VERIFICATION_LABELS[p.verification].short} />
        <Pill status={p.bookingEligible ? "approved" : "draft"} label={p.bookingEligible ? (p.bookingPaused ? "Bookable (paused)" : "Bookable") : "Not bookable"} />
        {p.suspendedAt ? <span className="text-alert">Suspended {fmtDateTime(p.suspendedAt)}: {p.suspensionReason}</span> : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
        <div>
          <Section title="Published fields">
            <DL
              items={[
                ["Name", p.displayName],
                ["Designation", p.designation],
                ["Headline", p.headline],
                ["Gender", p.gender],
                ["Practice start", p.practiceStartDate ? fmtDate(p.practiceStartDate) : "—"],
                ["Published version", p.publishedVersion ? `v${p.publishedVersion} since ${fmtDateTime(p.publishedAt)}` : "none"],
                ["Reviews", `${p.reviewCount} published${p.ratingAvgX100 != null ? ` · avg ${(p.ratingAvgX100 / 100).toFixed(2)}` : ""}`],
                ["Bookings", `${p.bookingsCount} total · ${p.futureBookings} upcoming`],
                ["Owner", p.ownerName ? `${p.ownerName}${p.ownerVerified ? " (contact verified)" : " (unverified contact)"}` : "unclaimed"],
                ["Created", fmtDateTime(p.createdAt)],
                ["Import batch", p.importBatchId ? <Link key="b" href={`/admin/imports/${p.importBatchId}`} className="underline">{p.importBatchId.slice(0, 8)}…</Link> : "—"],
              ]}
            />
            {p.publishedContent?.about ? <><h3 className="mt-3 text-sm font-semibold">About</h3><p className="whitespace-pre-wrap text-sm">{p.publishedContent.about}</p></> : null}
          </Section>

          <Section title={p.latestDraft ? `Latest draft v${p.latestDraft.version} (${p.latestDraft.state}) vs published` : "Draft"}>
            {!p.latestDraft ? <p className="text-sm text-muted">No pending draft. The published version is current (PRO-10).</p> : diff.length === 0 ? <p className="text-sm text-muted">Draft is identical to the published version.</p> : (
              <Table head={["Field", "Published", "Draft"]}>
                {diff.map((d) => (
                  <tr key={d.field}>
                    <Td className="font-semibold">{d.field}</Td>
                    <Td><Val v={d.before} /></Td>
                    <Td><Val v={d.after} /></Td>
                  </tr>
                ))}
              </Table>
            )}
          </Section>

          <CredentialsPanel p={p} credentials={credentials} canReview={canReview} />
          <AssociationsPanel p={p} associations={associations} canReview={canReview} />
          <OfferingsPanel offerings={offerings} />

          <Section title="Cases">
            <Table head={["Type", "Subject", "State", "Decision", "Submitted", "Decided"]}>
              {cases.rows.length === 0 ? <Empty>No cases.</Empty> : null}
              {cases.rows.map((c) => (
                <tr key={c.id}>
                  <Td><Link href={`/admin/cases/${c.id}`} className="underline">{CASE_TYPE_LABELS[c.caseType]}</Link></Td>
                  <Td className="text-xs">{c.summary}</Td><Td><Pill status={c.state} /></Td><Td><Pill status={c.decision} /></Td>
                  <Td className="text-xs">{fmtDateTime(c.submittedAt)}</Td><Td className="text-xs">{fmtDateTime(c.decidedAt)}</Td>
                </tr>
              ))}
            </Table>
            {dups.length ? (
              <div className="mt-3 text-sm">
                <h3 className="font-semibold">Duplicate candidates</h3>
                <ul>{dups.map((d) => <li key={d.id}><Link href={`/admin/practitioners/${d.otherId}`} className="underline">{d.otherName}</Link> · score {d.score} · {d.resolved ? "resolved" : d.caseId ? <Link href={`/admin/cases/${d.caseId}`} className="underline">open case</Link> : "unreviewed"}</li>)}</ul>
              </div>
            ) : null}
          </Section>

          <Section title="Audit timeline">
            <ul className="divide-y divide-line text-sm">
              {audit.length === 0 ? <li className="py-2 text-muted">No audit events.</li> : null}
              {audit.map((a) => (
                <li key={a.id} className="py-2">
                  <div className="flex flex-wrap gap-x-2"><span className="text-xs text-muted">{fmtDateTime(a.occurredAt)}</span><code className="text-xs">{a.action}</code><span className="text-muted">by {a.actorName ?? "system"}{a.actorRole ? ` (${a.actorRole})` : ""}</span></div>
                  {a.reason ? <div className="text-ink-2">{a.reason}</div> : null}
                  {a.changedFields ? <details><summary className="cursor-pointer text-xs text-muted">changed fields</summary><JsonView value={a.changedFields} /></details> : null}
                </li>
              ))}
            </ul>
          </Section>

          {slugs.length ? <Section title="Slug history (DIR-06)"><ul className="text-sm">{slugs.map((s) => <li key={s.slug}><code>{s.slug}</code> <span className="text-muted">since {fmtDate(s.createdAt)}</span></li>)}</ul></Section> : null}
        </div>

        <aside>
          <ActionsPanel p={p} viewer={v} checks={checks} />
          <Section title="Open a case">
            <form action={createCaseAction} className="grid gap-2">
              <Hidden name="subjectType" value="practitioner" />
              <Hidden name="subjectId" value={id} />
              <Hidden name="practitionerId" value={id} />
              <Hidden name="returnTo" value={self} />
              <Field label="Case type" name="caseType"><Select name="caseType" options={["complaint", "correction_request", "credential_fraud", "listing_review", "profile_change", "duplicate_candidate"].map((t) => ({ value: t, label: CASE_TYPE_LABELS[t] }))} /></Field>
              <Field label="Priority" name="priority"><Select name="priority" defaultValue="normal" options={["low", "normal", "high", "urgent"].map((x) => ({ value: x, label: x }))} /></Field>
              <Field label="Summary" name="summary"><Textarea name="summary" rows={2} /></Field>
              <button className="btn btn-quiet py-1.5" type="submit">Create case</button>
            </form>
          </Section>
        </aside>
      </div>
    </>
  );
}

function Val({ v }: { v: unknown }) {
  if (v == null || v === "") return <span className="text-muted">—</span>;
  if (typeof v === "object") return <JsonView value={v} />;
  return <span className="whitespace-pre-wrap">{String(v)}</span>;
}
