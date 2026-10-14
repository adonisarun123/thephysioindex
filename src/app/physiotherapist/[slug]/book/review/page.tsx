import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { Notice } from "@/components/workspace/forms/ui";
import { requireViewer } from "@/lib/auth/session";
import { getHoldForViewer } from "@/lib/booking/queries";
import { formatLocal } from "@/lib/booking/time";
import { resolvePractitionerSlug } from "@/lib/directory";
import { formatPaise } from "@/lib/money";
import { readMessage } from "@/lib/workspace/forms";
import { confirmAction, releaseAction } from "../actions";

export const metadata: Metadata = { title: "Review and confirm", robots: { index: false } };

type Props = PageProps<"/physiotherapist/[slug]/book/review">;

export default function Page({ params, searchParams }: Props) {
  return (
    <Suspense fallback={<div className="mx-auto max-w-xl px-4 py-12 text-muted">Loading…</div>}>
      <Review params={params} searchParams={searchParams} />
    </Suspense>
  );
}

/** Review step: the price, policy and time the patient accepts are exactly what the confirmation checks (BKG-07 step 4, OFR-04). */
async function Review({ params, searchParams }: { params: Props["params"]; searchParams: Props["searchParams"] }) {
  await connection();
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const resolved = await resolvePractitionerSlug(slug);
  if (!resolved) notFound();
  const canonical = `${resolved.slug}-${resolved.publicId}`;
  const viewer = await requireViewer(`/physiotherapist/${canonical}/book/review`);
  const token = (await cookies()).get("tpi_hold")?.value;
  const hold = token ? await getHoldForViewer(token, viewer.userId) : null;
  const msg = readMessage(sp);

  if (!hold || hold.expired) {
    return (
      <div className="mx-auto max-w-xl px-4 py-10">
        <h1 className="text-2xl font-semibold tracking-tight">Your hold has ended</h1>
        <Notice error={msg.error} />
        <p className="mt-2 text-sm text-muted">Held times are released after five minutes so others can book. Nothing was booked.</p>
        <Link href={`/physiotherapist/${canonical}/book`} className="btn btn-primary mt-6">Choose a time again</Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-10">
      <p className="text-sm text-muted"><Link href={hold.practitionerPath} className="underline">Back to {hold.practitionerName}</Link></p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">Review and confirm</h1>
      <p className="mt-1 text-sm text-muted">This time is held for you until {formatLocal(hold.expiresAt, { hour: "2-digit", minute: "2-digit" })} IST.</p>
      <Notice error={msg.error} />

      <section className="card mt-6 p-5">
        <dl className="grid gap-3 text-sm">
          <div><dt className="text-muted">When</dt><dd className="font-medium">{formatLocal(hold.startsAt)} – {formatLocal(hold.endsAt, { hour: "2-digit", minute: "2-digit" })} IST</dd></div>
          <div><dt className="text-muted">With</dt><dd className="font-medium">{hold.practitionerName}</dd></div>
          <div><dt className="text-muted">Service</dt><dd>{hold.offeringName}</dd></div>
          <div><dt className="text-muted">Where</dt><dd>{hold.clinicName} · {hold.branchName}</dd><dd className="text-muted">{hold.address}</dd></div>
          <div><dt className="text-muted">Patient</dt><dd>{hold.patientName}</dd></div>
        </dl>
        <table className="mt-5 w-full text-sm">
          <caption className="sr-only">Price breakdown</caption>
          <tbody>
            {hold.lineItems.map((l, i) => (
              <tr key={i} className="border-t border-line">
                <td className="py-2">{l.kind === "discount" ? `Offer: ${l.label}` : l.label}</td>
                <td className="py-2 text-right">{l.kind === "discount" ? "−" : ""}{formatPaise(l.amountPaise, { showPaise: true })}</td>
              </tr>
            ))}
            <tr className="border-t border-line font-semibold"><td className="py-2">Pay at clinic</td><td className="py-2 text-right">{formatPaise(hold.totalPaise, { showPaise: true })}</td></tr>
          </tbody>
        </table>
        {hold.offerExplanation ? <p className="mt-2 text-xs text-muted">{hold.offerExplanation}.</p> : null}
        <p className="mt-2 text-xs text-muted">The platform does not collect payment. Pay the clinic directly.</p>
      </section>

      <section className="card mt-4 p-5">
        <h2 className="text-base font-semibold">Cancellation policy</h2>
        <p className="mt-1 text-sm">{hold.policyText ?? "Cancel or reschedule online up to 12 hours before the appointment."}</p>
        <p className="mt-1 text-xs text-muted">Policy version {hold.policyVersion}</p>
      </section>

      <form action={confirmAction} className="card mt-4 grid gap-4 p-5">
        <input type="hidden" name="slug" value={canonical} />
        <input type="hidden" name="expectedTotalPaise" value={hold.totalPaise} />
        <input type="hidden" name="expectedPolicyVersion" value={hold.policyVersion} />
        <input type="hidden" name="idempotencyKey" value={randomUUID()} />
        <div>
          <label className="label" htmlFor="reason">Reason for the visit (optional, private)</label>
          <textarea id="reason" name="reason" className="input min-h-20" maxLength={500} placeholder="e.g. knee pain after running" />
          <p className="mt-1 text-xs text-muted">Seen only by the clinic. Please do not include medical records.</p>
        </div>
        <button type="submit" className="btn btn-primary">Confirm appointment</button>
      </form>
      <form action={releaseAction} className="mt-3">
        <input type="hidden" name="slug" value={canonical} />
        <button type="submit" className="btn btn-quiet w-full py-2 text-sm">Release this time</button>
      </form>
    </div>
  );
}
