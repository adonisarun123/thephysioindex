import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { Notice } from "@/components/workspace/forms/ui";
import { requireViewer } from "@/lib/auth/session";
import { getReviewForBooking, suggestedDisplayName } from "@/lib/reviews";
import { readMessage } from "@/lib/workspace/forms";
import { appealReviewAction, submitReviewAction, withdrawReviewAction } from "../../actions";

export const metadata: Metadata = { title: "Review your appointment", robots: { index: false } };

type Props = PageProps<"/account/bookings/[id]/review">;

export default function Page({ params, searchParams }: Props) {
  return (
    <Suspense fallback={<div className="mx-auto max-w-2xl px-4 py-12 text-muted">Loading…</div>}>
      <ReviewPage params={params} searchParams={searchParams} />
    </Suspense>
  );
}

const RATINGS = [
  [5, "Excellent"],
  [4, "Good"],
  [3, "Okay"],
  [2, "Poor"],
  [1, "Very poor"],
] as const;

const OK: Record<string, string> = {
  submitted: "Thank you. Your review is with our moderators and appears on the profile once approved.",
  withdrawn: "Your review has been withdrawn and no longer counts towards the rating.",
  appealed: "Your appeal has been sent. A different moderator will look at the review again.",
};

const STATE_TEXT: Record<string, string> = {
  pending: "Waiting for moderation. It is not public yet.",
  published: "Published on the profile.",
  rejected: "Not published.",
  appealed: "Appeal under review.",
  withdrawn: "Withdrawn by you.",
};

/** REV-01..REV-03: one review per completed appointment, moderated, with the reason shown and one appeal. */
async function ReviewPage({ params, searchParams }: { params: Props["params"]; searchParams: Props["searchParams"] }) {
  await connection();
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const viewer = await requireViewer(`/account/bookings/${id}/review`);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const data = await getReviewForBooking(viewer.userId, id);
  if (!data) notFound();
  const msg = readMessage(sp);
  const r = data.review;

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <p className="text-sm text-muted"><Link href={`/account/bookings/${data.bookingId}`} className="underline">Appointment {data.reference}</Link></p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">Review your appointment with {data.practitionerName}</h1>
      {msg.ok && OK[msg.ok] ? <div className="card mt-4 border-brand bg-brand-soft p-4 text-sm">{OK[msg.ok]}</div> : null}
      <Notice error={msg.error} />

      {r ? (
        <section className="card mt-6 p-5 text-sm">
          <p className="font-medium">{"★".repeat(r.rating)}<span className="text-muted">{"★".repeat(5 - r.rating)}</span> <span className="ml-1 text-muted">as {r.displayName}</span></p>
          {r.text ? <p className="mt-2 whitespace-pre-wrap">{r.text}</p> : <p className="mt-2 text-muted">No written review.</p>}
          <p className="mt-3"><span className="rounded-full bg-surface-2 px-2 py-0.5 font-medium">{STATE_TEXT[r.state] ?? r.state}</span></p>
          {r.moderationReason && (r.state === "rejected" || r.state === "appealed") ? <p className="mt-2 text-muted">Moderator&apos;s reason: {r.moderationReason}</p> : null}
          {r.reply ? <div className="mt-3 border-l-2 border-line pl-3"><p className="text-xs font-semibold text-muted">Reply from {data.practitionerName}</p><p className="mt-1 whitespace-pre-wrap">{r.reply}</p></div> : null}

          {r.state === "rejected" && !r.appealed ? (
            <form action={appealReviewAction} className="mt-5 grid gap-2">
              <input type="hidden" name="bookingId" value={data.bookingId} />
              <input type="hidden" name="reviewId" value={r.id} />
              <label className="label" htmlFor="explanation">Appeal this decision (once)</label>
              <textarea id="explanation" name="explanation" className="input min-h-24" minLength={10} maxLength={1000} required placeholder="Tell us why the review should be published." />
              <div><button type="submit" className="btn btn-secondary py-2 text-sm">Send appeal</button></div>
            </form>
          ) : null}
          {r.state !== "withdrawn" ? (
            <form action={withdrawReviewAction} className="mt-5">
              <input type="hidden" name="bookingId" value={data.bookingId} />
              <input type="hidden" name="reviewId" value={r.id} />
              <button type="submit" className="btn btn-quiet py-1.5 text-sm">Withdraw my review</button>
            </form>
          ) : null}
        </section>
      ) : data.eligible ? (
        <form action={submitReviewAction} className="card mt-6 grid gap-5 p-5">
          <input type="hidden" name="bookingId" value={data.bookingId} />
          <fieldset>
            <legend className="label">Your rating</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {RATINGS.map(([n, label]) => (
                <label key={n} className="flex cursor-pointer items-center gap-2 rounded-[var(--r-sm)] border border-line px-3 py-2 text-sm has-[:checked]:border-brand has-[:checked]:bg-brand-soft">
                  <input type="radio" name="rating" value={n} required />
                  <span aria-hidden="true">{"★".repeat(n)}</span>
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <div>
            <label className="label" htmlFor="text">Your review (optional)</label>
            <textarea id="text" name="text" className="input min-h-32" minLength={data.limits.min} maxLength={data.limits.max} placeholder="What went well, and what could be better? Think about punctuality, how clearly things were explained, and the clinic." />
            <p className="mt-1 text-xs text-muted">{data.limits.min}–{data.limits.max} characters if you write something. Please don&apos;t include diagnoses, test results, phone numbers or details about anyone else.</p>
          </div>
          <div>
            <label className="label" htmlFor="displayName">Name to show</label>
            <input id="displayName" name="displayName" className="input" defaultValue={suggestedDisplayName(data.patientName)} minLength={2} maxLength={40} required />
            <p className="mt-1 text-xs text-muted">Shown with your review. Your phone number and full name are never shown.</p>
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="confirmedNoPrivateData" required className="mt-1" />
            <span>My review contains no health records and no private details about another person.</span>
          </label>
          <p className="text-xs text-muted">Reviews are checked by our moderators for abuse, spam and personal information before they appear. Negative reviews are not removed for being negative. A review reflects this appointment; it does not verify clinical outcomes.</p>
          <div><button type="submit" className="btn btn-primary py-2">Submit review</button></div>
        </form>
      ) : (
        <section className="card mt-6 p-5 text-sm">
          <p>{data.ineligibleReason === "not_completed" ? "You can review this appointment after the clinic marks it completed." : "This appointment cannot be reviewed."}</p>
        </section>
      )}

      <p className="mt-6 text-xs text-muted">We never pay for reviews or offer anything in return for a positive rating.</p>
    </div>
  );
}
