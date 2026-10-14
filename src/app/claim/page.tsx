import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { getViewer } from "@/lib/auth/session";
import { searchClaimable } from "@/lib/workspace/claims";
import { resolveWorkspacePractitioner } from "@/lib/workspace/context";

export const metadata: Metadata = { title: "Find or claim your profile", robots: { index: false } };

/** PRO-02: search existing profiles before creating one. Requires a practitioner sign-in. */
export default function Page({ searchParams }: PageProps<"/claim">) {
  return (
    <Suspense fallback={<div className="mx-auto max-w-3xl px-4 py-12 text-muted">Loading…</div>}>
      <Claim searchParams={searchParams} />
    </Suspense>
  );
}

async function Claim({ searchParams }: { searchParams: PageProps<"/claim">["searchParams"] }) {
  await connection();
  const sp = await searchParams;
  const viewer = await getViewer();
  if (!viewer) redirect(`/sign-in?as=practitioner&next=${encodeURIComponent("/claim")}`);
  const mine = await resolveWorkspacePractitioner(viewer);
  const name = typeof sp.name === "string" ? sp.name.trim() : "";
  const regNo = typeof sp.reg === "string" ? sp.reg.trim() : "";
  const city = typeof sp.city === "string" ? sp.city.trim() : "";
  const searched = name.length >= 2;
  const hits = searched ? await searchClaimable({ name, regNo: regNo || undefined, city: city || undefined }) : [];

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-3xl font-semibold tracking-tight">Find your existing profile</h1>
      <p className="mt-2 text-muted">Many physiotherapists already have an imported or published listing. Search first so we do not create a duplicate.</p>
      {mine ? (
        <p className="mt-4 card bg-brand-soft p-4 text-sm">
          You already manage <strong>{mine.displayName}</strong>. <Link href="/workspace" className="underline">Open your workspace</Link>. You can still claim another listing below if it is yours.
        </p>
      ) : null}

      <form method="get" action="/claim" className="card mt-6 grid gap-4 p-5 sm:grid-cols-3">
        <div className="sm:col-span-3">
          <label className="label" htmlFor="name">Your name as it appears professionally</label>
          <input id="name" name="name" className="input" defaultValue={name} required minLength={2} placeholder="e.g. Priya Nair" />
        </div>
        <div>
          <label className="label" htmlFor="reg">Registration number (optional)</label>
          <input id="reg" name="reg" className="input" defaultValue={regNo} placeholder="As on your certificate" />
        </div>
        <div>
          <label className="label" htmlFor="city">City (optional)</label>
          <input id="city" name="city" className="input" defaultValue={city} placeholder="e.g. Bengaluru" />
        </div>
        <div className="flex items-end">
          <button type="submit" className="btn btn-primary w-full">Search</button>
        </div>
      </form>

      {searched ? (
        <section className="mt-8" aria-live="polite">
          <h2 className="text-lg font-semibold">{hits.length === 0 ? "No matching profiles" : `${hits.length} matching profile${hits.length === 1 ? "" : "s"}`}</h2>
          <ul className="mt-3 grid gap-3">
            {hits.map((h) => (
              <li key={h.id} className="card flex flex-wrap items-start justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="font-semibold">{h.displayName}</p>
                  <p className="text-sm text-muted">
                    {[h.designation, h.location, h.registrationHint ? `Reg. with ${h.registrationHint}` : null].filter(Boolean).join(" · ") || "No public details yet"}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    {h.claimed ? <span className="pill bg-surface-2 text-ink-2">Already claimed</span> : <span className="pill bg-mark-soft text-ink-2">Unclaimed</span>}{" "}
                    {h.listingStatus === "published" ? <Link href={`/physiotherapist/${h.slug}-${h.publicId}`} className="underline">View public profile</Link> : <span>{h.source === "imported" ? "Imported listing, not yet published" : "Not published"}</span>}
                  </p>
                </div>
                <div className="shrink-0">
                  {h.claimed ? (
                    <Link href={`/claim/${h.publicId}?dispute=1`} className="btn btn-quiet py-2 text-sm">This is me — dispute</Link>
                  ) : (
                    <Link href={`/claim/${h.publicId}`} className="btn btn-secondary py-2 text-sm">This is me — claim</Link>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <div className="card mt-6 flex flex-wrap items-center justify-between gap-3 bg-surface-2 p-4">
            <p className="text-sm">None of these are you?</p>
            <Link href="/workspace/onboarding" className="btn btn-primary py-2 text-sm">Create a new profile</Link>
          </div>
        </section>
      ) : (
        <p className="mt-6 text-sm text-muted">
          Already sure there is no listing for you? <Link href="/workspace/onboarding" className="underline">Create a new profile</Link>.
        </p>
      )}
    </div>
  );
}
