import Link from "next/link";
import { ConfirmButton } from "@/components/admin/confirm-button";
import { Empty, Field, Hidden, Input, Pill, Section, Select, Sensitive, Table, Td, Textarea } from "@/components/admin/ui";
import { fmtDate, fmtDateTime } from "@/lib/admin/format";
import type { EligibilityCheck } from "@/lib/admin/practitioner-ops";
import type { AssociationRow, CredentialRow, OfferingRow, PractitionerDetail } from "@/lib/admin/practitioners";
import type { Viewer } from "@/lib/auth/session";
import { hasRole } from "@/lib/auth/session";
import { formatPaise } from "@/lib/money";
import { archiveAction, associationAction, bookingEligibleAction, credentialStatusAction, pauseBookingsAction, reinstateAction, requestOwnershipTransferAction, suspendAction } from "@/app/admin/(app)/actions/practitioners";

/** Sections of the practitioner detail page. Forms post to server actions that re-check authorisation (IAM-01). */

export function CredentialsPanel({ p, credentials, canReview }: { p: PractitionerDetail; credentials: CredentialRow[]; canReview: boolean }) {
  return (
    <Section id="credentials" title="Credentials">
      <Table head={["Type", "Authority", "Number", "Status", "Checked", "Next review", "Public number", canReview ? "Record check" : ""]}>
        {credentials.length === 0 ? <Empty>No credentials declared.</Empty> : null}
        {credentials.map((c) => (
          <tr key={c.id}>
            <Td>{c.type.replace("_", " ")}</Td>
            <Td>{c.authority}<div className="text-xs text-muted">{c.authorityKind.replace("_", " ")}</div></Td>
            <Td>{c.numberOriginal ?? "—"}{c.expiresOn ? <div className="text-xs text-muted">expires {fmtDate(c.expiresOn)}</div> : null}</Td>
            <Td><Pill status={c.status} />{c.openCaseId ? <div className="text-xs"><Link href={`/admin/cases/${c.openCaseId}`} className="underline">open case</Link></div> : null}</Td>
            <Td className="text-xs">{c.lastCheckedAt ? <>{fmtDateTime(c.lastCheckedAt)}<div className="text-muted">{c.scopeOfCheck}</div></> : "never"}</Td>
            <Td className="text-xs">{fmtDate(c.nextReviewAt)}</Td>
            <Td>{c.publicNumberApproved ? "Approved" : "Hidden"}</Td>
            <Td>
              {canReview ? (
                <details>
                  <summary className="cursor-pointer text-sm underline">Set status</summary>
                  <form action={credentialStatusAction} className="mt-2 grid w-72 gap-2 text-sm">
                    <Hidden name="practitionerId" value={p.id} />
                    <Hidden name="credentialId" value={c.id} />
                    <Select name="status" aria-label="New status" defaultValue={c.status === "self_declared" || c.status === "pending" ? "document_reviewed" : c.status} options={["registration_checked", "document_reviewed", "unverifiable", "expired", "suspended", "revoked"].map((s) => ({ value: s, label: s.replace("_", " ") }))} />
                    <Input name="method" required placeholder="Method (VER-02)" />
                    <Input name="scopeOfCheck" placeholder="Scope of check" />
                    <Input name="nextReviewAt" type="date" aria-label="Next review" />
                    <label className="flex items-center gap-2"><input type="checkbox" name="publicNumberApproved" /> Show number publicly</label>
                    <Textarea name="reason" required placeholder="Reason" rows={2} />
                    <button className="btn btn-secondary py-1" type="submit">Record</button>
                  </form>
                </details>
              ) : null}
            </Td>
          </tr>
        ))}
      </Table>
    </Section>
  );
}

export function AssociationsPanel({ p, associations, canReview }: { p: PractitionerDetail; associations: AssociationRow[]; canReview: boolean }) {
  return (
    <Section id="associations" title="Clinic associations (LOC-02)">
      <Table head={["Clinic · branch", "Where", "State", "Active", "Bookable", "Offerings", ""]}>
        {associations.length === 0 ? <Empty>No branch associations.</Empty> : null}
        {associations.map((a) => (
          <tr key={a.id}>
            <Td><Link href={`/admin/clinics/${a.clinicId}`} className="underline">{a.clinicName}</Link> · {a.branchName} <Pill status={a.branchStatus} /></Td>
            <Td className="text-xs">{a.locality}, {a.city}</Td>
            <Td><Pill status={a.state} /></Td>
            <Td className="text-xs">{fmtDate(a.activeFrom)} → {a.activeTo ? fmtDate(a.activeTo) : "open"}</Td>
            <Td>{a.bookable ? "Yes" : "No"}</Td>
            <Td>{a.offerings}</Td>
            <Td>
              {canReview && (a.state === "pending" || a.state === "approved") ? (
                <details>
                  <summary className="cursor-pointer text-sm underline">{a.state === "pending" ? "Review" : "End"}</summary>
                  <form action={associationAction} className="mt-2 grid w-64 gap-2 text-sm">
                    <Hidden name="practitionerId" value={p.id} />
                    <Hidden name="associationId" value={a.id} />
                    <Textarea name="reason" required placeholder="Reason" rows={2} />
                    <div className="flex gap-2">
                      {a.state === "pending" ? <><button className="btn btn-primary py-1" name="op" value="approve" type="submit">Approve</button><button className="btn btn-quiet py-1" name="op" value="reject" type="submit">Reject</button></> : <ConfirmButton message="End this association? Future bookings at this branch get resolution tasks." name="op" value="end" className="btn btn-quiet py-1">End association</ConfirmButton>}
                    </div>
                  </form>
                </details>
              ) : null}
            </Td>
          </tr>
        ))}
      </Table>
    </Section>
  );
}

export function OfferingsPanel({ offerings }: { offerings: OfferingRow[] }) {
  return (
    <Section title="Offerings (CAL-02)">
      <Table head={["Offering", "Service", "Branch", "Mode", "Fee", "Duration", "Booking mode", "Active"]}>
        {offerings.length === 0 ? <Empty>No offerings configured.</Empty> : null}
        {offerings.map((o) => (
          <tr key={o.id}>
            <Td>{o.displayName}</Td><Td>{o.service}</Td><Td className="text-xs">{o.clinicName} · {o.branchName}</Td><Td>{o.mode}</Td>
            <Td>{o.basePricePaise == null ? "—" : formatPaise(o.basePricePaise)}</Td><Td>{o.durationMin ? `${o.durationMin} min` : "—"}</Td><Td>{o.bookingMode ?? "—"}</Td><Td>{o.active ? "Yes" : "No"}</Td>
          </tr>
        ))}
      </Table>
    </Section>
  );
}

export function ActionsPanel({ p, viewer, checks }: { p: PractitionerDetail; viewer: Viewer; checks: EligibilityCheck[] }) {
  const self = `/admin/practitioners/${p.id}`;
  const isSuper = hasRole(viewer, "super_admin");
  const isReviewer = hasRole(viewer, "verification_reviewer");
  const isSupport = hasRole(viewer, "support_agent");
  const allOk = checks.every((c) => c.ok);
  return (
    <>
      <Section title="Booking eligibility (VER-04)">
        <ul className="grid gap-1 text-sm">
          {checks.map((c) => (
            <li key={c.key} className="flex items-start gap-2">
              <span aria-hidden className={c.ok ? "text-brand" : "text-alert"}>{c.ok ? "✓" : "✗"}</span>
              <span>{c.label}{c.detail ? <span className="text-muted"> — {c.detail}</span> : null}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-sm">Currently: <strong>{p.bookingEligible ? "bookable" : "not bookable"}</strong>{p.bookingPaused ? " (paused by provider or staff)" : ""}</p>
        {isReviewer ? (
          <form action={bookingEligibleAction} className="mt-2 grid gap-2">
            <Hidden name="practitionerId" value={p.id} />
            <Hidden name="enabled" value={p.bookingEligible ? "false" : "true"} />
            <Textarea name="reason" required placeholder="Reason" rows={2} />
            <button className={`btn py-1.5 ${p.bookingEligible ? "btn-quiet" : "btn-primary"}`} type="submit" disabled={!p.bookingEligible && !allOk}>{p.bookingEligible ? "Remove booking eligibility" : "Enable booking"}</button>
            {!p.bookingEligible && !allOk ? <p className="text-xs text-muted">All checks must pass; the server re-verifies them.</p> : null}
          </form>
        ) : null}
        {isSupport ? (
          <form action={pauseBookingsAction} className="mt-3 grid gap-2 border-t border-line pt-3">
            <Hidden name="practitionerId" value={p.id} />
            <Hidden name="paused" value={p.bookingPaused ? "false" : "true"} />
            <Textarea name="reason" required placeholder="Reason" rows={2} />
            <button className="btn btn-quiet py-1.5" type="submit">{p.bookingPaused ? "Resume bookings" : "Pause new bookings (PRO-18)"}</button>
          </form>
        ) : null}
      </Section>

      {isSuper ? (
        <Section title="Listing actions (ADM-03)">
          <Sensitive viewer={viewer} next={self}>
            {p.listingStatus !== "suspended" && p.listingStatus !== "archived" ? (
              <form action={suspendAction} className="grid gap-2">
                <Hidden name="practitionerId" value={p.id} />
                <Field label="Suspend with reason" name="reason"><Textarea name="reason" required rows={2} /></Field>
                <ConfirmButton message={`Suspend ${p.displayName}? New reservations stop immediately and ${p.futureBookings} future booking(s) get resolution tasks.`} className="btn btn-quiet py-1.5 text-alert">Suspend listing</ConfirmButton>
              </form>
            ) : null}
            {p.listingStatus === "suspended" ? (
              <form action={reinstateAction} className="grid gap-2">
                <Hidden name="practitionerId" value={p.id} />
                <Field label="Reinstate with reason" name="reason"><Textarea name="reason" required rows={2} /></Field>
                <button className="btn btn-secondary py-1.5" type="submit">Reinstate</button>
              </form>
            ) : null}
            {p.listingStatus !== "archived" ? (
              <form action={archiveAction} className="mt-3 grid gap-2 border-t border-line pt-3">
                <Hidden name="practitionerId" value={p.id} />
                <Field label="Archive with reason" name="reason"><Textarea name="reason" required rows={2} /></Field>
                <ConfirmButton message="Archive this listing? It leaves the directory; history is retained." className="btn btn-quiet py-1.5">Archive</ConfirmButton>
              </form>
            ) : null}
          </Sensitive>
        </Section>
      ) : null}

      {isSuper ? (
        <Section title="Ownership (IAM-03, PRO-06)">
          <p className="text-sm">Current owner: {p.ownerName ?? <span className="text-muted">unclaimed</span>}{p.ownerContact ? <span className="text-muted"> · {p.ownerContact}</span> : null}</p>
          <Sensitive viewer={viewer} next={self}>
            <form action={requestOwnershipTransferAction} className="mt-2 grid gap-2">
              <Hidden name="practitionerId" value={p.id} />
              <Field label="New owner (email, mobile or user id)" name="newOwner"><Input name="newOwner" required /></Field>
              <Field label="Reason" name="reason"><Textarea name="reason" required rows={2} /></Field>
              <button className="btn btn-quiet py-1.5" type="submit">Request transfer (second admin approves)</button>
            </form>
          </Sensitive>
        </Section>
      ) : null}
    </>
  );
}
