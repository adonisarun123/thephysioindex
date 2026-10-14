import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { Notice } from "@/components/workspace/forms/ui";
import { getPublicProfile, resolvePractitionerSlug } from "@/lib/directory";
import { readMessage } from "@/lib/workspace/forms";
import { submitEnquiry } from "./actions";

export const metadata: Metadata = { title: "Send an enquiry", robots: { index: false, follow: true } };

export default function Page({ params, searchParams }: PageProps<"/physiotherapist/[slug]/enquire">) {
  return (
    <Suspense fallback={<div className="mx-auto max-w-xl px-4 py-12 text-muted">Loading…</div>}>
      <Enquire params={params} searchParams={searchParams} />
    </Suspense>
  );
}

/** Enquiry form for profiles without online booking. Honest copy: an enquiry is not an appointment (Section 2, PRO-18). */
async function Enquire({ params, searchParams }: { params: PageProps<"/physiotherapist/[slug]/enquire">["params"]; searchParams: PageProps<"/physiotherapist/[slug]/enquire">["searchParams"] }) {
  await connection();
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const resolved = await resolvePractitionerSlug(slug);
  if (!resolved) notFound();
  const canonical = `${resolved.slug}-${resolved.publicId}`;
  if (slug !== canonical) permanentRedirect(`/physiotherapist/${canonical}/enquire`);
  const p = await getPublicProfile(resolved.publicId);
  if (!p || p.listingStatus !== "published") notFound();
  const msg = readMessage(sp);
  const branch = p.branches[0];

  return (
    <div className="mx-auto max-w-xl px-4 py-10">
      <p className="text-sm text-muted"><Link href={p.path} className="underline">Back to {p.displayName}</Link></p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">Enquire about an appointment with {p.displayName}</h1>
      <p className="mt-2 text-sm text-muted">
        Online booking is not available for this profile{p.bookingPaused ? " at the moment" : ""}. We pass your enquiry to the clinic; <strong>this is not a booking</strong> and no time is reserved until the clinic confirms with you directly.
        {branch?.publicPhone ? <> You can also call <a href={`tel:${branch.publicPhone}`} className="underline">{branch.publicPhone}</a>.</> : null}
      </p>
      {msg.ok === "sent" ? (
        <div className="card mt-6 border-brand bg-brand-soft p-5 text-sm">
          <p className="font-medium">Enquiry sent.</p>
          <p className="mt-1">The clinic will contact you on the number you gave. Nothing is booked yet. <Link href={p.path} className="underline">Back to the profile</Link>.</p>
        </div>
      ) : (
        <>
          <Notice error={msg.error} />
          <form action={submitEnquiry} className="card mt-6 grid gap-4 p-5">
            <input type="hidden" name="slug" value={canonical} />
            <div>
              <label className="label" htmlFor="name">Your name</label>
              <input id="name" name="name" className="input" required minLength={2} maxLength={80} autoComplete="name" />
            </div>
            <div>
              <label className="label" htmlFor="mobile">Mobile number</label>
              <input id="mobile" name="mobile" className="input" required inputMode="tel" autoComplete="tel" placeholder="10-digit Indian mobile" />
              <p className="mt-1 text-xs text-muted">Shared only with this clinic so they can call you back. Up to three enquiries per day.</p>
            </div>
            <div>
              <label className="label" htmlFor="message">What would you like to ask? (optional)</label>
              <textarea id="message" name="message" className="input" rows={4} maxLength={1000} placeholder="Preferred days or times, the problem in a few words, whether you need a home visit…" />
              <p className="mt-1 text-xs text-muted">Please do not include medical reports or other sensitive details here.</p>
            </div>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" name="consent" className="mt-1" required />
              <span>I agree that The Physio Index may share my name, number and message with this clinic for the purpose of this enquiry. <Link href="/policies/privacy" className="underline">Privacy notice</Link>.</span>
            </label>
            <div><button type="submit" className="btn btn-primary">Send enquiry</button></div>
          </form>
        </>
      )}
    </div>
  );
}
