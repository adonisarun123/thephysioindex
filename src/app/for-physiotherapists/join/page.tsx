import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { PhysioRegistration } from "@/components/auth/physio-registration";
import { GoogleAdsTag } from "@/components/google-ads-tag";
import { getViewer } from "@/lib/auth/session";
import { KEEP_READY } from "@/lib/content/physio-onboarding";
import { ATTRIBUTION_KEYS } from "@/lib/practitioner-signups";
import { listAuthorityOptions, listStateOptions } from "@/lib/workspace/catalog";

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
            <h2 className="text-xl font-semibold tracking-tight">Register free</h2>
            <p className="mt-1 text-sm text-muted">About two minutes. Nothing is public until we have verified your registration.</p>
            <details className="mt-3 rounded-[var(--r-card)] bg-brand-soft p-3 text-sm">
              <summary className="cursor-pointer font-medium">What to keep ready (4 things)</summary>
              <ul className="mt-2 grid gap-1.5">
                {KEEP_READY.map((i) => (
                  <li key={i.title} className="flex gap-2"><span aria-hidden>✓</span><span>{i.title}</span></li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-muted">Not sure about something? Leave your name and WhatsApp number and we will call you.</p>
            </details>
            <Suspense fallback={<p className="mt-5 text-sm text-muted">Loading the form…</p>}>
              <FormWithParams searchParams={searchParams} />
            </Suspense>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12">
        <h2 className="text-2xl font-semibold tracking-tight">How joining works</h2>
        <ol className="mt-6 grid gap-4 sm:grid-cols-3">
          {[
            ["1. Register here", "Name, email, mobile, qualification, registration number and where you see patients. We verify your email with a code."],
            ["2. Complete your profile", "Your profile is created straight away. Add your About section, services, fees and hours until it shows 100%."],
            ["3. Get verified and booked", "At 100% you submit it. Once we have checked your registration, your profile goes live and patients can book you."],
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
  await connection();
  const sp = await searchParams;
  const attribution: Record<string, string> = {};
  for (const k of ATTRIBUTION_KEYS) {
    const v = sp[k];
    if (typeof v === "string" && v) attribution[k] = v.slice(0, 200);
  }
  const [viewer, states, authorities] = await Promise.all([getViewer(), listStateOptions(), listAuthorityOptions()]);
  const signedInEmail = viewer && viewer.kind !== "staff" ? viewer.email : null;
  return <PhysioRegistration states={states} authorities={authorities} attribution={attribution} signedInEmail={signedInEmail} />;
}
