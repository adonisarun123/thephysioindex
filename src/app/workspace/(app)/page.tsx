import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { CompletionMeter } from "@/components/workspace/completion-meter";
import { Empty, Notice, PageHeader, Section, StatePill } from "@/components/workspace/forms/ui";
import { statusLabel } from "@/components/workspace/workspace-shell";
import { latestCase } from "@/lib/workspace/cases";
import { requireWorkspace } from "@/lib/workspace/context";
import { readMessage } from "@/lib/workspace/forms";
import { formatIst } from "@/lib/workspace/calendar";
import { completionPercent, profileChecklist } from "@/lib/workspace/completion";
import { onboardingStatus } from "@/lib/workspace/onboarding";
import { listBookings } from "@/lib/workspace/queries";
import { submitForReview } from "./profile/actions";

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
  const [status, review, todays] = await Promise.all([
    onboardingStatus(p.id),
    latestCase(p.id, ["listing_review", "profile_change"]),
    listBookings(p.id, { from: today, to: today, status: "confirmed" }),
  ]);
  const items = profileChecklist(status.draft, status);
  const complete = completionPercent(items) === 100;
  const canSubmit = complete && status.versionState === "draft" && ["draft", "rejected", "changes_requested"].includes(p.listingStatus);
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

          <Section title="Profile completion" lede={p.listingStatus === "published" ? "Keep your profile complete; changes are reviewed before they go live." : "Reach 100%, submit, and once we verify your registration patients can book you."}>
            <CompletionMeter items={items} />
            {canSubmit ? (
              <form action={submitForReview} className="mt-4">
                <button type="submit" className="btn btn-primary">Submit for verification</button>
              </form>
            ) : null}
          </Section>
        </div>

        <aside>
          <Section title="Recent metrics" lede="Profile views arrive with analytics.">
            <p className="text-sm text-muted">Views, confirmed bookings and completed visits will appear here once the analytics pipeline is live. Booking counts are already on <Link href="/workspace/reports" className="underline">Reports</Link>.</p>
          </Section>
        </aside>
      </div>
    </div>
  );
}
