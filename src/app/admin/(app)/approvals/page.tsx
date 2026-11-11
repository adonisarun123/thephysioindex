import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { PageHeader } from "@/components/admin/admin-shell";
import { Empty, Hidden, Notice, Pill, Select } from "@/components/admin/ui";
import { CHANGE_REASONS, REJECT_REASONS, listApprovals, type ApprovalCard } from "@/lib/admin/approvals";
import { fmtAge, type SP } from "@/lib/admin/format";
import { requireStaff } from "@/lib/auth/session";
import { formatPaise } from "@/lib/money";
import { approveAction, declineAction } from "../actions/approvals";

export default function Page({ searchParams }: PageProps<"/admin/approvals">) {
  return (
    <Suspense fallback={<p className="text-muted">Loading approvals…</p>}>
      <Approvals searchParams={searchParams} />
    </Suspense>
  );
}

async function Approvals({ searchParams }: { searchParams: PageProps<"/admin/approvals">["searchParams"] }) {
  const sp = (await searchParams) as SP;
  await connection();
  await requireStaff("verification_reviewer");
  const cards = await listApprovals();

  return (
    <>
      <PageHeader
        title="Approvals"
        description="New physiotherapists and profile changes, one card each. Check the details, tick the registration if you looked it up, then press Approve."
      />
      <Notice sp={sp} />
      {cards.length === 0 ? (
        <Empty>Nothing waiting. New sign-ups appear here when a physiotherapist finishes their profile.</Empty>
      ) : (
        <div className="grid gap-4">
          {cards.map((c) => (
            <ApprovalCardView key={c.caseId} c={c} />
          ))}
        </div>
      )}
      <p className="mt-6 text-xs text-muted">
        Approve publishes the profile and its clinics or home-visit areas, records your registration check, and switches on online booking when every booking check passes. Each step is audited
        as before. Detailed queues are still under <Link className="underline" href="/admin/queues/listing_review">Review queues</Link>.
      </p>
    </>
  );
}

function ApprovalCardView({ c }: { c: ApprovalCard }) {
  const isNew = c.caseType === "listing_review";
  const pendingCreds = c.credentials.filter((x) => x.status !== "registration_checked");
  return (
    <article className="card overflow-hidden">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line bg-surface-2 px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">
            <Link href={`/admin/practitioners/${c.practitionerId}`} className="hover:underline">{c.displayName}</Link>{" "}
            <span className="pill bg-surface text-ink-2">{isNew ? "New physiotherapist" : "Profile change"}</span>
          </h2>
          <p className="text-sm text-muted">
            Submitted {fmtAge(c.submittedAt)} ago
            {c.email ? <> · <a className="underline" href={`mailto:${c.email}`}>{c.email}</a></> : null}
            {c.mobile ? <> · <a className="underline" href={`tel:${c.mobile}`}>{c.mobile}</a></> : null}
          </p>
        </div>
        <Link href={`/admin/cases/${c.caseId}`} className="text-sm text-muted underline">Full case</Link>
      </header>

      <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="grid min-w-0 gap-3 text-sm">
          {!isNew && c.changedFields.length ? <p><span className="font-medium">Changed:</span> {c.changedFields.join(", ")}</p> : null}
          {c.qualifications.length ? (
            <p><span className="font-medium">Qualification:</span> {c.qualifications.map((q) => `${q.degree}, ${q.institution}${q.completionYear ? ` (${q.completionYear})` : ""}`).join("; ")}</p>
          ) : null}
          {c.specialties.length || c.languages.length ? (
            <p>
              {c.specialties.length ? <><span className="font-medium">Practice:</span> {c.specialties.join(", ")}</> : null}
              {c.specialties.length && c.languages.length ? " · " : null}
              {c.languages.length ? <><span className="font-medium">Languages:</span> {c.languages.join(", ")}</> : null}
            </p>
          ) : null}
          {c.places.length ? (
            <div>
              <p className="font-medium">Where and what</p>
              <ul className="mt-1 grid gap-1">
                {c.places.map((pl, i) => (
                  <li key={i} className="rounded-[var(--r-sm)] bg-surface-2 px-3 py-2">
                    {pl.label}
                    <span className="text-muted">
                      {" — "}
                      {pl.services.length
                        ? pl.services.map((s) => `${s.name} ${s.minutes} min ${formatPaise(s.pricePaise)}${s.mode !== "clinic" ? ` (${s.mode.replace("_", " ")})` : ""}`).join("; ")
                        : "no services yet"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-alert">No clinic or home-visit area.</p>
          )}
          {c.about ? (
            <details>
              <summary className="cursor-pointer font-medium">About ({c.about.length} characters)</summary>
              <p className="mt-1 whitespace-pre-line text-ink-2">{c.about}</p>
            </details>
          ) : null}
        </div>

        <div className="grid content-start gap-3">
          <form action={approveAction} className="grid gap-3 rounded-[var(--r-sm)] border border-line p-3">
            <Hidden name="caseId" value={c.caseId} />
            <Hidden name="practitionerId" value={c.practitionerId} />
            <Hidden name="name" value={c.displayName} />
            {c.credentials.length ? (
              <div className="grid gap-2 text-sm">
                {c.credentials.map((cr) => (
                  <div key={cr.id} className="grid gap-1">
                    <p>
                      <span className="font-medium">{cr.authority}</span> {cr.number ? <code>{cr.number}</code> : <span className="text-muted">no number</span>} <Pill status={cr.status} />
                    </p>
                    {cr.sameNumberElsewhere > 0 ? <p className="text-xs text-alert">Same number is on {cr.sameNumberElsewhere} other profile(s). Check for a duplicate.</p> : null}
                    {cr.status !== "registration_checked" && cr.number ? (
                      <label className="flex items-start gap-2">
                        <input type="checkbox" name="checked" value={cr.id} className="mt-1" />
                        <span>
                          I checked this name and number on the council register
                          {cr.lookupUrl ? <> (<a className="underline" href={cr.lookupUrl} target="_blank" rel="noopener noreferrer">open register</a>)</> : null}
                        </span>
                      </label>
                    ) : null}
                  </div>
                ))}
                {pendingCreds.length ? <p className="text-xs text-muted">Leave unticked if you did not check. The profile still goes live, labelled as not independently verified.</p> : null}
              </div>
            ) : (
              <p className="text-sm text-alert">No registration submitted.</p>
            )}
            <button className="btn btn-primary w-full" type="submit">{isNew ? "Approve and publish" : "Approve change"}</button>
          </form>

          <details className="rounded-[var(--r-sm)] border border-line p-3 text-sm">
            <summary className="cursor-pointer font-medium">Ask for changes</summary>
            <form action={declineAction} className="mt-2 grid gap-2">
              <Hidden name="caseId" value={c.caseId} />
              <Hidden name="practitionerId" value={c.practitionerId} />
              <Hidden name="name" value={c.displayName} />
              <Hidden name="decision" value="changes_requested" />
              <Select name="preset" aria-label="What needs fixing" options={[{ value: "", label: "What needs fixing?" }, ...Object.entries(CHANGE_REASONS).map(([k, t]) => ({ value: k, label: t.split(".")[0] }))]} />
              <textarea name="note" className="input min-h-0 py-2" rows={2} maxLength={1000} placeholder="Optional note to the physiotherapist" />
              <button className="btn btn-secondary btn-sm" type="submit">Send back</button>
            </form>
          </details>

          <details className="rounded-[var(--r-sm)] border border-line p-3 text-sm">
            <summary className="cursor-pointer font-medium text-alert">Reject</summary>
            <form action={declineAction} className="mt-2 grid gap-2">
              <Hidden name="caseId" value={c.caseId} />
              <Hidden name="practitionerId" value={c.practitionerId} />
              <Hidden name="name" value={c.displayName} />
              <Hidden name="decision" value="rejected" />
              <Select name="preset" aria-label="Reason" options={[{ value: "", label: "Reason" }, ...Object.entries(REJECT_REASONS).map(([k, t]) => ({ value: k, label: t }))]} />
              <textarea name="note" className="input min-h-0 py-2" rows={2} maxLength={1000} placeholder="Optional note" />
              <button className="btn btn-quiet btn-sm text-alert" type="submit">Reject</button>
            </form>
          </details>
        </div>
      </div>
    </article>
  );
}
