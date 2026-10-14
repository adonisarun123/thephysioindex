import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { BackLink, PageHeader, Section, StatePill } from "@/components/workspace/forms/ui";
import { formatIst } from "@/lib/workspace/calendar";
import { requireWorkspace } from "@/lib/workspace/context";
import { getBooking } from "@/lib/workspace/queries";

export const metadata: Metadata = { title: "Appointment" };

export default function Page({ params }: PageProps<"/workspace/appointments/[id]">) {
  return (
    <Suspense fallback={<p className="text-muted">Loading…</p>}>
      <Detail params={params} />
    </Suspense>
  );
}

const UUID = /^[0-9a-f-]{36}$/i;

/** Detail view scoped to the practitioner (Section 15). Transitions arrive with the booking engine. */
async function Detail({ params }: { params: PageProps<"/workspace/appointments/[id]">["params"] }) {
  await connection();
  const { id } = await params;
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
      <Section title="Actions" lede="Completing, cancelling and no-show recording follow the booking lifecycle rules and arrive with the booking engine (Section 11).">
        <div className="flex flex-wrap gap-2">
          {["Mark completed", "Cancel", "Record no-show", "Report payment received"].map((l) => <button key={l} type="button" className="btn btn-quiet py-1.5 text-sm" disabled aria-disabled="true">{l}</button>)}
        </div>
      </Section>
    </div>
  );
}
