import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { requireViewer } from "@/lib/auth/session";

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
        <p className="mt-2 text-sm text-muted">No appointments yet. Online booking opens with the appointment release; until then, <Link href="/physiotherapists" className="underline">find a physiotherapist</Link> and contact the clinic.</p>
      </section>
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
