import type { Metadata } from "next";
import { sql } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { GoogleAdsTag } from "@/components/google-ads-tag";
import { CompletionMeter } from "@/components/workspace/completion-meter";
import { db } from "@/db/client";
import { getViewer } from "@/lib/auth/session";
import { PUBLIC_ID_PATTERN } from "@/lib/public-id";
import { profileChecklist } from "@/lib/workspace/completion";
import { resolveWorkspacePractitioner } from "@/lib/workspace/context";
import { onboardingStatus } from "@/lib/workspace/onboarding";

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
  const practitioner = viewer ? await resolveWorkspacePractitioner(viewer) : null;
  const status = practitioner ? await onboardingStatus(practitioner.id) : null;
  const items = status ? profileChecklist(status.draft, status) : null;

  return (
    <>
      <GoogleAdsTag conversionRef={lead.fresh ? ref : undefined} />
      <section className="bg-navy text-white">
        <div className="mx-auto grid max-w-5xl gap-8 px-4 py-10 md:grid-cols-[1fr_1fr] md:items-start md:py-14">
          <div>
            <span aria-hidden className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-teal text-2xl font-bold text-navy">✓</span>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight">Thank you, {name}. Your profile is created.</h1>
            <p className="mt-3 text-lg text-white/85">
              Take it to 100% now: a few lines about you, your services and fees{items?.some((i) => i.key === "hours") ? ", and your weekly hours" : ""}. Then submit it and we verify your registration.
            </p>
            <p className="mt-4 text-sm text-white/70">
              Prefer help? Our team will call you on the mobile number ending <strong>{last4}</strong>. Your reference is <code className="rounded bg-white/10 px-1.5 py-0.5">{ref.toUpperCase()}</code>.
            </p>
          </div>
          <div className="card p-6 text-foreground">
            {items ? (
              <>
                <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-brand-ink">Your profile</p>
                <CompletionMeter items={items} compact />
                <Link href="/workspace" className="btn btn-primary mt-5 w-full">Complete my profile</Link>
              </>
            ) : (
              <>
                <p className="font-semibold">Sign in to continue setting up your profile.</p>
                <Link href={`/sign-in?as=practitioner&next=${encodeURIComponent("/workspace")}`} className="btn btn-primary mt-4 w-full">Sign in</Link>
              </>
            )}
          </div>
        </div>
      </section>
      <section className="mx-auto max-w-5xl px-4 py-10">
        <h2 className="text-xl font-semibold tracking-tight">What happens next</h2>
        <ol className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
          {[
            ["1. Reach 100%", "Fill in the remaining items in your workspace. Everything saves as you go."],
            ["2. Submit for verification", "We check your registration with the council or IAP. Nothing is public before that."],
            ["3. Go live", "Your profile appears in city and locality searches and patients can book you."],
          ].map(([t, d]) => (
            <li key={t} className="card p-4">
              <p className="font-medium">{t}</p>
              <p className="mt-1 text-muted">{d}</p>
            </li>
          ))}
        </ol>
        <p className="mt-6 text-sm text-muted">
          Meanwhile, <Link href="/physiotherapists" className="underline">see how profiles look</Link>.
        </p>
      </section>
    </>
  );
}
