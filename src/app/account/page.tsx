import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { requireViewer } from "@/lib/auth/session";
import { listPatientBookings } from "@/lib/booking/queries";
import { formatLocal, nowMs } from "@/lib/booking/time";

export const metadata: Metadata = { title: "My account", robots: { index: false } };

export default function Page() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-3xl px-4 py-12 text-muted">Loading…</div>}>
      <Account />
    </Suspense>
  );
}

async function Account() {
  await connection();
  const v = await requireViewer("/account");
  const bookings = await listPatientBookings(v.userId);
  const now = nowMs();
  const upcoming = bookings.filter((b) => b.status === "confirmed" && Date.parse(b.endsAt) > now).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const past = bookings.filter((b) => !upcoming.includes(b)).slice(0, 10);
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">My account</h1>
          <p className="mt-1 text-muted">{v.mobile ?? v.email} {v.mobileVerified ? "· mobile verified" : ""}</p>
        </div>
        <form action="/sign-out" method="post">
          <button className="btn btn-quiet py-2" type="submit">Sign out</button>
        </form>
      </div>
      <section className="card mt-8 p-6">
        <h2 className="text-lg font-semibold">Upcoming appointments</h2>
        {upcoming.length === 0 ? (
          <p className="mt-2 text-sm text-muted">No upcoming appointments. <Link href="/physiotherapists" className="underline">Find a physiotherapist</Link>.</p>
        ) : (
          <ul className="mt-3 divide-y divide-line border-y border-line">
            {upcoming.map((b) => (
              <li key={b.id} className="py-3 text-sm">
                <Link href={`/account/bookings/${b.id}`} className="font-medium underline">{formatLocal(b.startsAt)} IST</Link>
                <p className="text-muted">{b.offeringName} with {b.practitionerName} · {b.clinicName}, {b.branchName}{b.patientName ? ` · for ${b.patientName}` : ""}</p>
                <p className="text-xs text-muted">Ref {b.reference}{b.cancellationRequested ? " · cancellation requested" : ""}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
      {past.length ? (
        <section className="card mt-4 p-6">
          <h2 className="text-lg font-semibold">Past and cancelled</h2>
          <ul className="mt-3 divide-y divide-line border-y border-line">
            {past.map((b) => (
              <li key={b.id} className="flex flex-wrap items-baseline justify-between gap-2 py-3 text-sm">
                <span><Link href={`/account/bookings/${b.id}`} className="underline">{formatLocal(b.startsAt, { day: "numeric", month: "short", year: "numeric" })}</Link> · {b.offeringName} with {b.practitionerName}</span>
                <span className="text-xs text-muted">{b.status.replace(/_/g, " ")}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <section className="card mt-4 p-6">
        <h2 className="text-lg font-semibold">Family members</h2>
        <p className="mt-2 text-sm text-muted">Book for a dependant with their own record. Booking for children requires guardian verification, which is not yet enabled (BKG-16).</p>
      </section>
      {v.kind !== "staff" ? (
        <section className="card mt-4 p-6">
          <h2 className="text-lg font-semibold">Are you a physiotherapist?</h2>
          <p className="mt-2 text-sm text-muted">
            <Link href="/for-physiotherapists" className="underline">Create or claim your professional profile</Link> using this account.
          </p>
        </section>
      ) : null}
      <section className="card mt-4 p-6">
        <h2 className="text-lg font-semibold">Privacy</h2>
        <p className="mt-2 text-sm text-muted">Request a copy of your data, a correction, or deletion from <Link href="/account/privacy" className="underline">privacy requests</Link>.</p>
      </section>
    </div>
  );
}
