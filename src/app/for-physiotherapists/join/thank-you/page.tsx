import type { Metadata } from "next";
import { sql } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { EmailSignIn } from "@/components/auth/email-sign-in";
import { GoogleAdsTag } from "@/components/google-ads-tag";
import { db } from "@/db/client";
import { getViewer } from "@/lib/auth/session";
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
  const r = await db().execute<{ full_name: string; mobile: string; email: string | null; fresh: boolean; recent: boolean }>(sql`
    SELECT full_name, mobile, email, created_at > now() - interval '2 hours' AS fresh,
      greatest(created_at, updated_at) > now() - interval '2 hours' AS recent
    FROM practitioner_signups WHERE reference = ${ref}`);
  const lead = r.rows[0];
  if (!lead) redirect("/for-physiotherapists/join");
  const name = lead.full_name.replace(/^dr\.?\s+/i, "").split(/\s+/)[0] || "there";
  const last4 = lead.mobile.replace(/\D/g, "").slice(-4);

  const viewer = await getViewer();
  // The email is pre-filled only for a sign-up made in the last two hours, so an old or
  // guessed reference does not reveal it. Anyone can still type an email on /sign-in.
  const prefill = lead.recent && lead.email ? lead.email : "";
  const next = "/workspace/onboarding";

  return (
    <>
      <GoogleAdsTag conversionRef={lead.fresh ? ref : undefined} />
      <section className="bg-navy text-white">
        <div className="mx-auto grid max-w-5xl gap-8 px-4 py-10 md:grid-cols-[1fr_1fr] md:items-start md:py-14">
          <div>
            <span aria-hidden className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-teal text-2xl font-bold text-navy">✓</span>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight">Thank you, {name}. You are registered.</h1>
            <p className="mt-3 text-lg text-white/85">
              Build your profile now. It takes about 5 minutes, and nothing goes public until we have checked your registration.
            </p>
            <p className="mt-4 text-sm text-white/70">
              Prefer help? Our team will call you on the mobile number ending <strong>{last4}</strong>. Your reference is <code className="rounded bg-white/10 px-1.5 py-0.5">{ref.toUpperCase()}</code>.
            </p>
          </div>
          <div className="text-foreground">
            {viewer ? (
              <div className="card grid gap-3 p-6">
                <p className="font-semibold">You are signed in.</p>
                <Link href={next} className="btn btn-primary">Continue to your profile</Link>
              </div>
            ) : (
              <>
                <p className="mb-2 text-sm font-semibold uppercase tracking-wide text-teal">Step 2 · Build your profile</p>
                <EmailSignIn next={next} audience="practitioner" initialEmail={prefill} />
              </>
            )}
          </div>
        </div>
      </section>
      <section className="mx-auto max-w-5xl px-4 py-10">
        <h2 className="text-xl font-semibold tracking-tight">What you need</h2>
        <ul className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
          {[
            ["Your qualification", "BPT or MPT, the institution and year."],
            ["Registration number", "State council registration or IAP membership number."],
            ["Where you see patients", "Your clinic's address — or, for home visits, the area you cover."],
          ].map(([t, d]) => (
            <li key={t} className="card p-4">
              <p className="font-medium">{t}</p>
              <p className="mt-1 text-muted">{d}</p>
            </li>
          ))}
        </ul>
        <p className="mt-6 text-sm text-muted">
          Fees, timings, languages and an About section are optional — add them now or after approval. Meanwhile, <Link href="/physiotherapists" className="underline">see how profiles look</Link>.
        </p>
      </section>
    </>
  );
}
