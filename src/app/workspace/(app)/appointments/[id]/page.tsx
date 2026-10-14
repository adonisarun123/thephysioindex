import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { BackLink, Notice, PageHeader, Section, StatePill } from "@/components/workspace/forms/ui";
import { nowMs } from "@/lib/booking/time";
import { readMessage } from "@/lib/workspace/forms";
import { outcomeAction, paymentAction, providerCancelAction } from "../actions";
import { formatIst } from "@/lib/workspace/calendar";
import { requireWorkspace } from "@/lib/workspace/context";
import { getBooking } from "@/lib/workspace/queries";

export const metadata: Metadata = { title: "Appointment" };

export default function Page({ params, searchParams }: PageProps<"/workspace/appointments/[id]">) {
  return (
    <Suspense fallback={<p className="text-muted">Loading…</p>}>
      <Detail params={params} searchParams={searchParams} />
    </Suspense>
  );
}

const UUID = /^[0-9a-f-]{36}$/i;

/** Detail view scoped to the practitioner (Section 15) with lifecycle actions (Section 11 table, BKG-04). */
async function Detail({ params, searchParams }: { params: PageProps<"/workspace/appointments/[id]">["params"]; searchParams: PageProps<"/workspace/appointments/[id]">["searchParams"] }) {
  await connection();
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const msg = readMessage(sp);
  const { practitioner: p } = await requireWorkspace(`/workspace/appointments/${id}`);
  if (!UUID.test(id)) notFound();
  const b = await getBooking(p.id, id);
  if (!b) notFound();
  return (
    <div className="mx-auto max-w-3xl">
      <BackLink href="/workspace/appointments">Back to appointments</BackLink>
      <div className="mt-2">
        <PageHeader title={`Appointment ${b.reference}`} lede={`${formatIst(b.startsAt)} – ${formatIst(b.endsAt, { hour: "2-digit", minute: "2-digit" })} · ${b.timezone}`} action={<StatePill state={b.status} />} />
      </div>
      <Notice ok={msg.ok} error={msg.error} />
      {b.cancellationRequested ? <p className="card mt-4 border-alert bg-alert-soft p-3 text-sm" role="status">The patient asked to cancel after the self-service cutoff. Cancel below if you agree, or contact them.</p> : null}
      <Section title="Details">
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div><dt className="text-muted">Patient</dt><dd className="font-medium">{b.patientName}</dd>{b.patientMobile ? <dd className="text-muted">{b.patientMobile}</dd> : null}</div>
          <div><dt className="text-muted">Service</dt><dd className="font-medium">{b.offeringName}</dd><dd className="text-muted">{b.branchName}</dd></div>
          <div><dt className="text-muted">Source</dt><dd>{b.source.replace(/_/g, " ")}</dd></div>
          <div><dt className="text-muted">Payment</dt><dd>Pay at clinic · {b.paymentReported === "reported_received" ? "reported received (self-reported)" : "not reported"}</dd></div>
          {b.appointmentReason ? <div className="sm:col-span-2"><dt className="text-muted">Patient’s reason (private)</dt><dd>{b.appointmentReason}</dd></div> : null}
        </dl>
      </Section>
      <Section title="Administrative notes" lede="Arrival help, callback requests and the like. Not a clinical record; do not document treatment here (PRO-16).">
        {b.notes.length === 0 ? <p className="text-sm text-muted">No notes.</p> : (
          <ul className="divide-y divide-line border-y border-line text-sm">
            {b.notes.map((n, i) => <li key={i} className="py-2"><p>{n.note}</p><p className="text-xs text-muted">{formatIst(n.createdAt)}</p></li>)}
          </ul>
        )}
      </Section>
      <Section title="Actions" lede="Completion is recorded after the appointment ends; a no-show after the grace period. Neither proves payment (BKG-05).">
        {b.status === "confirmed" ? (
          <div className="grid gap-4">
            <div className="flex flex-wrap gap-2">
              {Date.parse(b.endsAt) <= nowMs() ? (
                <form action={outcomeAction}>
                  <input type="hidden" name="bookingId" value={b.id} /><input type="hidden" name="version" value={b.version} />
                  <input type="hidden" name="outcome" value="completed" /><input type="hidden" name="idempotencyKey" value={randomUUID()} />
                  <button type="submit" className="btn btn-secondary py-1.5 text-sm">Mark completed</button>
                </form>
              ) : null}
              {Date.parse(b.startsAt) <= nowMs() ? (
                <form action={outcomeAction}>
                  <input type="hidden" name="bookingId" value={b.id} /><input type="hidden" name="version" value={b.version} />
                  <input type="hidden" name="outcome" value="no_show" /><input type="hidden" name="idempotencyKey" value={randomUUID()} />
                  <button type="submit" className="btn btn-quiet py-1.5 text-sm">Record no-show</button>
                </form>
              ) : null}
              {b.paymentReported === "not_reported" ? (
                <form action={paymentAction}>
                  <input type="hidden" name="bookingId" value={b.id} />
                  <button type="submit" className="btn btn-quiet py-1.5 text-sm">Report payment received</button>
                </form>
              ) : null}
            </div>
            <form action={providerCancelAction} className="grid gap-2 sm:max-w-md">
              <input type="hidden" name="bookingId" value={b.id} /><input type="hidden" name="version" value={b.version} />
              <input type="hidden" name="idempotencyKey" value={randomUUID()} />
              <label className="label" htmlFor="reason">Cancel with a reason (the patient is notified)</label>
              <input id="reason" name="reason" className="input" required minLength={3} maxLength={500} />
              <div><button type="submit" className="btn btn-quiet py-1.5 text-sm">Cancel appointment</button></div>
            </form>
          </div>
        ) : b.status === "completed" && b.paymentReported === "not_reported" ? (
          <form action={paymentAction}>
            <input type="hidden" name="bookingId" value={b.id} />
            <button type="submit" className="btn btn-quiet py-1.5 text-sm">Report payment received</button>
          </form>
        ) : (
          <p className="text-sm text-muted">No actions for a {b.status.replace(/_/g, " ")} appointment.{b.cancellationReason ? ` Reason: ${b.cancellationReason}` : ""}</p>
        )}
      </Section>
    </div>
  );
}
