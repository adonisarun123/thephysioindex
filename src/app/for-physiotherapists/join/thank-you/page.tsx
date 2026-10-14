import type { Metadata } from "next";
import { sql } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { GoogleAdsTag } from "@/components/google-ads-tag";
import { db } from "@/db/client";
import { PUBLIC_ID_PATTERN } from "@/lib/public-id";

export const metadata: Metadata = { title: "Thank you for registering", robots: { index: false, follow: false } };

export default function Page({ searchParams }: PageProps<"/for-physiotherapists/join/thank-you">) {
  return (
    <Suspense fallback={<div className="mx-auto max-w-2xl px-4 py-16 text-muted">Loading…</div>}>
      <ThankYou searchParams={searchParams} />
    </Suspense>
  );
}

/**
 * Shown only after a successful sign-up. The conversion fires only for a
 * real reference created in the last two hours, so a bookmarked or guessed
 * URL does not inflate ad conversions.
 */
async function ThankYou({ searchParams }: { searchParams: PageProps<"/for-physiotherapists/join/thank-you">["searchParams"] }) {
  await connection();
  const sp = await searchParams;
  const ref = typeof sp.ref === "string" && PUBLIC_ID_PATTERN.test(sp.ref) ? sp.ref : null;
  if (!ref) redirect("/for-physiotherapists/join");
  const r = await db().execute<{ full_name: string; mobile: string; fresh: boolean }>(sql`
    SELECT full_name, mobile, created_at > now() - interval '2 hours' AS fresh
    FROM practitioner_signups WHERE reference = ${ref}`);
  const lead = r.rows[0];
  if (!lead) redirect("/for-physiotherapists/join");
  const name = lead.full_name.replace(/^dr\.?\s+/i, "").split(/\s+/)[0] || "there";
  const last4 = lead.mobile.replace(/\D/g, "").slice(-4);

  return (
    <>
      <GoogleAdsTag conversionRef={lead.fresh ? ref : undefined} />
      <section className="bg-navy text-white">
        <div className="mx-auto max-w-3xl px-4 py-12 md:py-16">
          <span aria-hidden className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-teal text-2xl font-bold text-navy">✓</span>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight">Thank you, {name}. You are registered.</h1>
          <p className="mt-3 text-lg text-white/85">
            Our onboarding team will call you on the mobile number ending <strong>{last4}</strong> to set up your profile. Your reference is <code className="rounded bg-white/10 px-1.5 py-0.5">{ref.toUpperCase()}</code>.
          </p>
        </div>
      </section>
      <section className="mx-auto max-w-3xl px-4 py-10">
        <h2 className="text-xl font-semibold tracking-tight">Keep these ready for the call</h2>
        <ul className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          {[
            ["Registration proof", "State council registration certificate or IAP membership."],
            ["Qualification", "BPT or MPT degree, and any specialisation."],
            ["Where you practise", "Clinic names and addresses, or the areas you cover for home visits."],
            ["Hours and fees", "Weekly timings for each clinic and your consultation fee."],
          ].map(([t, d]) => (
            <li key={t} className="card p-4">
              <p className="font-medium">{t}</p>
              <p className="mt-1 text-muted">{d}</p>
            </li>
          ))}
        </ul>
        <p className="mt-6 text-sm text-muted">
          Nothing is published until we have verified your details with you. Meanwhile, <Link href="/physiotherapists" className="underline">see how profiles look</Link> or <Link href="/" className="underline">explore The Physio Index</Link>.
        </p>
      </section>
    </>
  );
}
