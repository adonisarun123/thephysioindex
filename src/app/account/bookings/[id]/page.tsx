import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { Notice } from "@/components/workspace/forms/ui";
import { requireViewer } from "@/lib/auth/session";
import { getPatientBooking } from "@/lib/booking/queries";
import { formatLocal, nowMs } from "@/lib/booking/time";
import { formatPaise } from "@/lib/money";
import { readMessage } from "@/lib/workspace/forms";
import { cancelAction } from "../actions";

export const metadata: Metadata = { title: "Appointment", robots: { index: false } };

type Props = PageProps<"/account/bookings/[id]">;

export default function Page({ params, searchParams }: Props) {
  return (
    <Suspense fallback={<div className="mx-auto max-w-2xl px-4 py-12 text-muted">Loading…</div>}>
      <Detail params={params} searchParams={searchParams} />
    </Suspense>
  );
}

const STATUS: Record<string, string> = {
  confirmed: "Confirmed",
  completed: "Completed",
  patient_cancelled: "Cancelled by you",
  provider_cancelled: "Cancelled by the clinic",
  no_show: "Marked as missed",
};

const OK: Record<string, string> = {
  confirmed: "Your appointment is confirmed.",
  cancelled: "Your appointment is cancelled.",
  cancellation_requested: "It is too close to the appointment to cancel online, so we sent a cancellation request to the clinic. The appointment stays booked until they respond.",
  rescheduled: "Your appointment has a new time.",
};

/** Patient appointment detail (BKG-13): status, local time, practitioner, address, agreed fee, policy and reference. */
async function Detail({ params, searchParams }: { params: Props["params"]; searchParams: Props["searchParams"] }) {
  await connection();
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const viewer = await requireViewer(`/account/bookings/${id}`);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const b = await getPatientBooking(viewer.userId, id);
  if (!b) notFound();
  const msg = readMessage(sp);
  const upcoming = b.status === "confirmed" && Date.parse(b.startsAt) > nowMs();
  const beforeCutoff = upcoming && Date.parse(b.startsAt) - nowMs() >= b.cutoffHours * 3600_000;

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <p className="text-sm text-muted"><Link href="/account" className="underline">My account</Link></p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">Appointment {b.reference}</h1>
      <p className="mt-1 text-sm"><span className="rounded-full bg-surface-2 px-2 py-0.5 font-medium">{STATUS[b.status] ?? b.status}</span>{b.cancellationRequested ? <span className="ml-2 text-muted">Cancellation requested</span> : null}</p>
      {msg.ok && OK[msg.ok] ? <div className="card mt-4 border-brand bg-brand-soft p-4 text-sm">{OK[msg.ok]}</div> : null}
      <Notice error={msg.error} />

      <section className="card mt-6 p-5">
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div className="sm:col-span-2"><dt className="text-muted">When</dt><dd className="font-medium">{formatLocal(b.startsAt)} – {formatLocal(b.endsAt, { hour: "2-digit", minute: "2-digit" })} IST</dd></div>
          <div><dt className="text-muted">With</dt><dd><Link href={b.practitionerPath} className="underline">{b.practitionerName}</Link></dd></div>
          <div><dt className="text-muted">Patient</dt><dd>{b.patientName}</dd></div>
          <div><dt className="text-muted">Service</dt><dd>{b.offeringName}</dd></div>
          <div><dt className="text-muted">Where</dt><dd>{b.clinicName} · {b.branchName}</dd><dd className="text-muted">{b.address}</dd></div>
        </dl>
        <table className="mt-5 w-full text-sm">
          <caption className="sr-only">Agreed fee</caption>
          <tbody>
            {b.lineItems.map((l, i) => (
              <tr key={i} className="border-t border-line"><td className="py-2">{l.kind === "discount" ? `Offer: ${l.label}` : l.label}</td><td className="py-2 text-right">{l.kind === "discount" ? "−" : ""}{formatPaise(l.amountPaise, { showPaise: true })}</td></tr>
            ))}
            <tr className="border-t border-line font-semibold"><td className="py-2">Agreed fee, pay at clinic</td><td className="py-2 text-right">{formatPaise(b.totalPaise, { showPaise: true })}</td></tr>
          </tbody>
        </table>
        <p className="mt-2 text-xs text-muted">Policy {b.policyVersion}: {b.policyText ?? `Cancel or reschedule online up to ${b.cutoffHours} hours before.`}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {b.latitude != null && b.longitude != null ? (
            <a href={`https://www.google.com/maps/dir/?api=1&destination=${b.latitude},${b.longitude}`} target="_blank" rel="noopener noreferrer" className="btn btn-secondary py-1.5 text-sm">Directions</a>
          ) : null}
          {b.status === "confirmed" ? <a href={`/api/v1/bookings/${b.id}/calendar.ics`} className="btn btn-secondary py-1.5 text-sm">Add to calendar</a> : null}
          {b.publicPhone ? <a href={`tel:${b.publicPhone}`} className="btn btn-quiet py-1.5 text-sm">Call clinic</a> : null}
          {!upcoming ? <Link href={`${b.practitionerPath}/book?o=${b.offeringId}`} className="btn btn-quiet py-1.5 text-sm">Book again</Link> : null}
        </div>
      </section>

      {upcoming && !b.cancellationRequested ? (
        <section className="card mt-4 p-5">
          <h2 className="text-base font-semibold">Change this appointment</h2>
          {beforeCutoff ? (
            <p className="mt-1 text-sm text-muted">You can cancel or reschedule online until {b.cutoffHours} hours before the start.</p>
          ) : (
            <p className="mt-1 text-sm text-muted">It is less than {b.cutoffHours} hours to the appointment. Rescheduling online is closed; a cancellation becomes a request to the clinic.</p>
          )}
          <div className="mt-4 flex flex-wrap gap-3">
            {beforeCutoff ? <Link href={`/account/bookings/${b.id}/reschedule`} className="btn btn-secondary py-2 text-sm">Reschedule</Link> : null}
          </div>
          <form action={cancelAction} className="mt-4 grid gap-3">
            <input type="hidden" name="bookingId" value={b.id} />
            <input type="hidden" name="version" value={b.version} />
            <input type="hidden" name="idempotencyKey" value={randomUUID()} />
            <div>
              <label className="label" htmlFor="reason">Reason (optional)</label>
              <input id="reason" name="reason" className="input" maxLength={500} />
            </div>
            <div><button type="submit" className="btn btn-quiet py-2 text-sm">{beforeCutoff ? "Cancel appointment" : "Request cancellation"}</button></div>
          </form>
        </section>
      ) : null}
      {b.cancellationReason && b.status.endsWith("cancelled") ? <p className="mt-4 text-sm text-muted">Reason given: {b.cancellationReason}</p> : null}
    </div>
  );
}
