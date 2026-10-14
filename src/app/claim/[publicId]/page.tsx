import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { getViewer } from "@/lib/auth/session";
import { listAuthorityOptions } from "@/lib/workspace/catalog";
import { getClaimTarget, myClaim } from "@/lib/workspace/claims";
import { readMessage } from "@/lib/workspace/forms";
import { submitClaim } from "./actions";

export const metadata: Metadata = { title: "Claim this profile", robots: { index: false } };

export default function Page({ params, searchParams }: PageProps<"/claim/[publicId]">) {
  return (
    <Suspense fallback={<div className="mx-auto max-w-2xl px-4 py-12 text-muted">Loading…</div>}>
      <ClaimForm params={params} searchParams={searchParams} />
    </Suspense>
  );
}

const CLAIM_STATES: Record<string, string> = {
  requested: "Requested — waiting for a reviewer",
  evidence_requested: "More evidence requested",
  under_review: "Under review",
  approved: "Approved",
  rejected: "Not approved",
  withdrawn: "Withdrawn",
};

async function ClaimForm({ params, searchParams }: { params: PageProps<"/claim/[publicId]">["params"]; searchParams: PageProps<"/claim/[publicId]">["searchParams"] }) {
  await connection();
  const [{ publicId }, sp] = await Promise.all([params, searchParams]);
  const viewer = await getViewer();
  if (!viewer) redirect(`/sign-in?as=practitioner&next=${encodeURIComponent(`/claim/${publicId}`)}`);
  const target = await getClaimTarget(publicId);
  if (!target) notFound();
  const [claim, authorities] = await Promise.all([myClaim(target.id, viewer.userId), listAuthorityOptions()]);
  const msg = readMessage(sp);
  const dispute = target.claimed || sp.dispute === "1";
  const open = claim && ["requested", "evidence_requested", "under_review"].includes(claim.state);

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <p className="text-sm text-muted"><Link href="/claim" className="underline">Back to search</Link></p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">{dispute ? "Dispute the ownership of this profile" : "Claim this profile"}</h1>
      <div className="card mt-4 p-4">
        <p className="font-semibold">{target.displayName}</p>
        <p className="text-sm text-muted">{target.designation ?? "Physiotherapist"} · {target.listingStatus === "published" ? <Link href={`/physiotherapist/${target.slug}-${target.publicId}`} className="underline">public profile</Link> : "not yet published"}</p>
      </div>

      {msg.ok === "submitted" ? <p className="card mt-4 border-brand bg-brand-soft p-4 text-sm">Your claim has been recorded. A reviewer will check the evidence; you will see the outcome here and in your workspace.</p> : null}
      {msg.ok === "duplicate" ? (
        <p className="card mt-4 border-mark bg-mark-soft p-4 text-sm">
          Your claim has been recorded. The registration number you entered also appears on another listing, so a reviewer will check for duplicates before deciding (PRO-05). Nothing is merged automatically.
        </p>
      ) : null}
      {msg.error ? <p className="card mt-4 border-alert bg-alert-soft p-4 text-sm" role="alert">{msg.error}</p> : null}

      {claim ? (
        <section className="card mt-4 p-4 text-sm">
          <h2 className="font-semibold">Your claim</h2>
          <p className="mt-1">Status: <strong>{CLAIM_STATES[claim.state] ?? claim.state}</strong></p>
          {claim.competing > 0 ? <p className="mt-1 text-muted">Another claim is open for this profile. Ownership transfer is frozen until a reviewer resolves the dispute (PRO-06).</p> : null}
          {claim.decisionReason ? <p className="mt-1 text-muted">Reviewer note: {claim.decisionReason}</p> : null}
          {claim.state === "approved" ? <p className="mt-2"><Link href="/workspace" className="btn btn-primary py-2">Open your workspace</Link></p> : null}
        </section>
      ) : null}

      {!open && claim?.state !== "approved" ? (
        <form action={submitClaim} className="card mt-6 grid gap-4 p-5">
          <input type="hidden" name="publicId" value={target.publicId} />
          <input type="hidden" name="dispute" value={dispute ? "1" : "0"} />
          <p className="text-sm text-muted">
            {dispute
              ? "This listing is already claimed. Your dispute goes to a reviewer; the current owner keeps access until it is decided and nothing is reassigned automatically."
              : "Tell us how a reviewer can confirm this is you. A one-time code to a new number is not enough on its own to transfer a listing."}
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="authorityId">Registration authority</label>
              <select id="authorityId" name="authorityId" className="input" defaultValue="">
                <option value="">Select…</option>
                {authorities.map((a) => (
                  <option key={a.id} value={a.id}>{a.label}{a.jurisdiction ? ` — ${a.jurisdiction}` : ""}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="registrationNumber">Registration or enrolment number</label>
              <input id="registrationNumber" name="registrationNumber" className="input" maxLength={60} />
            </div>
            <div>
              <label className="label" htmlFor="clinicPhone">Clinic phone</label>
              <input id="clinicPhone" name="clinicPhone" className="input" inputMode="tel" maxLength={20} />
            </div>
            <div>
              <label className="label" htmlFor="clinicEmail">Clinic email</label>
              <input id="clinicEmail" name="clinicEmail" className="input" type="email" maxLength={160} />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="note">Anything else a reviewer should know</label>
            <textarea id="note" name="note" className="input" rows={4} maxLength={1000} placeholder="For example: which clinic you practise at, or a website that lists you." />
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="confirm" className="mt-1" required />
            <span>I confirm that I am {target.displayName} or act with their authority. Evidence is kept private and used only to decide this claim.</span>
          </label>
          <div className="flex flex-wrap gap-3">
            <button type="submit" className="btn btn-primary">{dispute ? "Submit dispute" : "Submit claim"}</button>
            <Link href="/claim" className="btn btn-quiet">Cancel</Link>
          </div>
        </form>
      ) : null}
    </div>
  );
}
