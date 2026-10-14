import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { GoogleAdsTag } from "@/components/google-ads-tag";
import { ATTRIBUTION_KEYS, PRACTICE_TYPES } from "@/lib/practitioner-signups";
import { readMessage } from "@/lib/workspace/forms";
import { submitPhysioSignup } from "./actions";

/*
 * Paid-acquisition landing page for physiotherapists. Kept out of the index
 * (it duplicates /for-physiotherapists); every claim here must stay true to
 * the product as built: no listing fee or commission at launch, verified
 * labels, conflict-free calendar, enquiries for unbookable services.
 * No aggregate counts or testimonials until real ones exist (DIR-14).
 */
export const metadata: Metadata = {
  title: "List your physiotherapy practice free",
  description: "Join The Physio Index: a verified profile, your clinics and fees, and appointment bookings from patients near you. No listing fee or commission at launch.",
  alternates: { canonical: "/for-physiotherapists" },
  robots: { index: false, follow: true },
};

export default function Page({ searchParams }: PageProps<"/for-physiotherapists/join">) {
  return (
    <>
      <GoogleAdsTag />
      <section className="bg-navy text-white">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-10 md:grid-cols-[1.1fr_1fr] md:items-start md:py-16">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-teal">For physiotherapists across India</p>
            <h1 className="mt-3 text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">Let patients near you find and book you</h1>
            <p className="mt-4 max-w-xl text-lg text-white/85">
              A verified profile on The Physio Index puts your qualifications, clinics, fees and open slots in front of people searching for a physiotherapist in their locality.
            </p>
            <ul className="mt-8 grid gap-4">
              {[
                ["Free to list", "No listing fee and no commission at launch. Patients pay you at your clinic."],
                ["Verified, not vague", "Your profile shows exactly what we checked: council registration, degree or membership."],
                ["Bookings without double-booking", "Set weekly hours per clinic; patients book open slots and your calendar stays conflict-free."],
                ["Home visits and online too", "List every way you practise. Patients can enquire for services that are not booked online."],
              ].map(([t, d]) => (
                <li key={t} className="flex gap-3">
                  <span aria-hidden className="mt-1 inline-flex h-6 w-6 flex-none items-center justify-center rounded-full bg-teal text-sm font-bold text-navy">✓</span>
                  <span>
                    <strong className="block">{t}</strong>
                    <span className="text-white/80">{d}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div id="register" className="card p-5 text-foreground sm:p-6">
            <h2 className="text-xl font-semibold tracking-tight">Register your interest</h2>
            <p className="mt-1 text-sm text-muted">Takes under a minute. Our onboarding team calls you to set up your profile.</p>
            <Suspense fallback={<SignupForm attribution={{}} />}>
              <FormWithParams searchParams={searchParams} />
            </Suspense>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12">
        <h2 className="text-2xl font-semibold tracking-tight">How joining works</h2>
        <ol className="mt-6 grid gap-4 sm:grid-cols-3">
          {[
            ["1. Register here", "Leave your name, mobile and city. No documents needed at this step."],
            ["2. We call you", "Our team helps you create or claim your profile and checks your registration."],
            ["3. Go live", "Once approved, your profile appears in city and locality searches and patients can book."],
          ].map(([t, d]) => (
            <li key={t} className="card p-5">
              <p className="font-semibold">{t}</p>
              <p className="mt-1 text-sm text-muted">{d}</p>
            </li>
          ))}
        </ol>

        <h2 className="mt-14 text-2xl font-semibold tracking-tight">Questions physiotherapists ask</h2>
        <dl className="mt-6 grid gap-4 md:grid-cols-2">
          {[
            ["Is it really free?", "Yes. There is no listing fee and no commission on appointments at launch. Patients pay you directly."],
            ["What do I need to be listed?", "A physiotherapy qualification and your state council registration or professional membership. We verify these before your profile goes live."],
            ["My profile may already exist. Can I take it over?", "Yes. Many practitioners are already listed from public sources. We verify that it is you before handing over control, so nobody can claim your profile with just a phone number."],
            ["Do I have to accept online bookings?", "No. You choose which clinics and services are bookable. Home visits and online sessions take enquiries instead."],
          ].map(([q, a]) => (
            <div key={q} className="card p-5">
              <dt className="font-semibold">{q}</dt>
              <dd className="mt-1 text-sm text-muted">{a}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-12 flex flex-col items-start gap-3 rounded-[var(--r-card)] bg-brand-soft p-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-medium">Ready to be found by patients near you?</p>
          <a href="#register" className="btn btn-primary">Register free</a>
        </div>
        <p className="mt-6 text-xs text-muted">
          See how profiles look: <Link href="/physiotherapists" className="underline">browse physiotherapists</Link>. Read our <Link href="/policies/privacy" className="underline">privacy notice</Link>.
        </p>
      </section>
    </>
  );
}

async function FormWithParams({ searchParams }: { searchParams: PageProps<"/for-physiotherapists/join">["searchParams"] }) {
  const sp = await searchParams;
  const attribution: Record<string, string> = {};
  for (const k of ATTRIBUTION_KEYS) {
    const v = sp[k];
    if (typeof v === "string" && v) attribution[k] = v.slice(0, 200);
  }
  return <SignupForm attribution={attribution} error={readMessage(sp).error} />;
}

function SignupForm({ attribution, error }: { attribution: Record<string, string>; error?: string }) {
  return (
    <form action={submitPhysioSignup} className="mt-5 grid gap-4">
      {error ? (
        <p role="alert" className="rounded-[var(--r-ctl)] bg-alert-soft p-3 text-sm text-alert">
          {error}
        </p>
      ) : null}
      {Object.entries(attribution).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <div className="hidden" aria-hidden>
        <label htmlFor="website">Leave this empty</label>
        <input id="website" name="website" tabIndex={-1} autoComplete="off" />
      </div>
      <div>
        <label className="label" htmlFor="fullName">Full name</label>
        <input id="fullName" name="fullName" className="input" required minLength={2} maxLength={80} autoComplete="name" placeholder="Dr. Priya Sharma (PT)" />
      </div>
      <div>
        <label className="label" htmlFor="mobile">Mobile number</label>
        <input id="mobile" name="mobile" className="input" required inputMode="tel" autoComplete="tel" maxLength={20} placeholder="10-digit mobile" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="city">City</label>
          <input id="city" name="city" className="input" required minLength={2} maxLength={80} autoComplete="address-level2" />
        </div>
        <div>
          <label className="label" htmlFor="email">Email <span className="font-normal text-muted">(optional)</span></label>
          <input id="email" name="email" type="email" className="input" maxLength={120} autoComplete="email" />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="practiceType">How do you practise?</label>
        <select id="practiceType" name="practiceType" className="input" required defaultValue="">
          <option value="" disabled>Choose one</option>
          {PRACTICE_TYPES.map((p) => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="registrationNumber">Council registration or IAP number <span className="font-normal text-muted">(optional)</span></label>
        <input id="registrationNumber" name="registrationNumber" className="input" maxLength={60} />
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="consent" className="mt-1" required />
        <span>The Physio Index may call, SMS or WhatsApp me about listing my practice. <Link href="/policies/privacy" className="underline">Privacy notice</Link>.</span>
      </label>
      <button type="submit" className="btn btn-primary w-full">Register free</button>
    </form>
  );
}
