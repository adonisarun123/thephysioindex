import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { Empty, Notice, PageHeader, Section, StatePill } from "@/components/workspace/forms/ui";
import { statusLabel } from "@/components/workspace/workspace-shell";
import { latestCase } from "@/lib/workspace/cases";
import { requireWorkspace } from "@/lib/workspace/context";
import { readMessage } from "@/lib/workspace/forms";
import { formatIst } from "@/lib/workspace/calendar";
import { onboardingStatus, pendingActions } from "@/lib/workspace/onboarding";
import { listBookings } from "@/lib/workspace/queries";

export const metadata: Metadata = { title: "Workspace overview" };

export default function Page({ searchParams }: PageProps<"/workspace">) {
  return (
    <Suspense fallback={<p className="text-muted">Loading…</p>}>
      <Overview searchParams={searchParams} />
    </Suspense>
  );
}

async function Overview({ searchParams }: { searchParams: PageProps<"/workspace">["searchParams"] }) {
  await connection();
  const sp = await searchParams;
  const { practitioner: p } = await requireWorkspace("/workspace");
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const [actions, status, review, todays] = await Promise.all([
    pendingActions(p.id, p.listingStatus),
    onboardingStatus(p.id),
    latestCase(p.id, ["listing_review", "profile_change"]),
    listBookings(p.id, { from: today, to: today, status: "confirmed" }),
  ]);
  const checklist = [
    ["Identity", status.completed.identity],
    ["About section", (status.draft.about?.length ?? 0) >= 100],
    ["Qualifications", (status.draft.qualifications?.length ?? 0) > 0],
    ["Credentials", status.credentialCount > 0],
    ["Areas of practice", (status.draft.specialties?.length ?? 0) > 0],
    ["Languages", (status.draft.languages?.length ?? 0) > 0],
    ["Clinic", status.branchCount > 0],
    ["Services and fees", status.offeringCount > 0],
    ["Consent", status.consents],
  ] as const;
  const completion = Math.round((checklist.filter(([, ok]) => ok).length / checklist.length) * 100);
  const msg = readMessage(sp);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Overview"
        lede={`Profile status: ${statusLabel(p.listingStatus)}${p.bookingEligible ? " · booking enabled" : " · booking not yet enabled"}${p.bookingPaused ? " · new bookings paused" : ""}`}
        action={p.listingStatus === "published" ? <Link href={`/physiotherapist/${p.slug}-${p.publicId}`} className="btn btn-quiet py-2 text-sm">View public profile</Link> : null}
      />
      <Notice ok={msg.ok} error={msg.error} />

      {review && review.state !== "closed" ? (
        <div className="card mt-6 p-4 text-sm">
          <p>
            <StatePill state={review.state === "decided" ? review.decision ?? "decided" : review.state} /> Review {review.caseType === "listing_review" ? "of your listing" : "of your profile changes"} submitted {formatIst(review.submittedAt, { day: "numeric", month: "short" })}.
          </p>
          {review.decisionReason ? <p className="mt-1 text-muted">Reviewer note: {review.decisionReason}</p> : null}
        </div>
      ) : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div>
          <Section title="Today’s appointments" lede={`${formatIst(new Date(), { weekday: "long", day: "numeric", month: "long" })} · Asia/Kolkata`}>
            {todays.length === 0 ? (
              <Empty>No appointments today. {p.bookingEligible ? "Patients can book once your availability is published." : "Online booking opens after your profile and eligibility are approved."}</Empty>
            ) : (
              <ul className="divide-y divide-line border-y border-line text-sm">
                {todays.map((b) => (
                  <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span>{formatIst(b.startsAt, { hour: "2-digit", minute: "2-digit" })} · {b.patientName}</span>
                    <span className="text-muted">{b.offeringName} · {b.branchName}</span>
                    <Link href={`/workspace/appointments/${b.id}`} className="underline">Open</Link>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Pending actions" lede="What still stands between you and a bookable, published profile.">
            {actions.length === 0 ? (
              <Empty>Nothing pending. Keep your calendar current and watch for review feedback here.</Empty>
            ) : (
              <ul className="grid gap-2 text-sm">
                {actions.map((a) => (
                  <li key={a.href + a.label} className="flex items-center justify-between gap-3 rounded-[var(--r-sm)] border border-line p-3">
                    <span>{a.label}</span>
                    <Link href={a.href} className="btn btn-quiet py-1 text-xs">Do it</Link>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>

        <aside>
          <Section title="Profile completion" lede={`${completion}% complete`}>
            <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={completion} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full bg-brand" style={{ width: `${completion}%` }} />
            </div>
            <ul className="mt-3 grid gap-1.5 text-sm">
              {checklist.map(([label, ok]) => (
                <li key={label} className="flex items-center justify-between">
                  <span>{label}</span>
                  <span className={ok ? "text-brand-ink" : "text-muted"}>{ok ? "Done" : "To do"}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-muted">
              <Link href="/workspace/profile" className="underline">Edit profile</Link> · <Link href="/workspace/onboarding?step=review" className="underline">Submission checklist</Link>
            </p>
          </Section>
          <Section title="Recent metrics" lede="Profile views arrive with analytics.">
            <p className="text-sm text-muted">Views, confirmed bookings and completed visits will appear here once the analytics pipeline is live. Booking counts are already on <Link href="/workspace/reports" className="underline">Reports</Link>.</p>
          </Section>
        </aside>
      </div>
    </div>
  );
}
