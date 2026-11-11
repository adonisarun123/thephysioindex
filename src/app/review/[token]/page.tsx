import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { ReviewPhotoPicker } from "@/components/review-photo-picker";
import { Notice } from "@/components/workspace/forms/ui";
import { getViewer } from "@/lib/auth/session";
import { imageKitEnabled } from "@/lib/media/imagekit";
import { getOwnInvitedReview, resolveInvitation } from "@/lib/review-invitations";
import { suggestedDisplayName } from "@/lib/reviews";
import { MAX_REVIEW_PHOTOS, PATIENT_CONSENT_STATEMENT } from "@/lib/treatment-photos";
import { readMessage } from "@/lib/workspace/forms";
import { removeReviewPhotoAction, submitInvitedReviewAction, withdrawInvitedReviewAction } from "./actions";

// The link is personal: keep it out of search engines and out of the Referer header of outbound clicks.
export const metadata: Metadata = { title: "Write a review", robots: { index: false, follow: false }, referrer: "no-referrer" };

type Props = PageProps<"/review/[token]">;

export default function Page({ params, searchParams }: Props) {
  return (
    <Suspense fallback={<div className="mx-auto max-w-2xl px-4 py-12 text-muted">Loading…</div>}>
      <InvitedReview params={params} searchParams={searchParams} />
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
  withdrawn: "Your review and its photos have been removed.",
  photo_removed: "Photo removed.",
};

const STATE_TEXT: Record<string, string> = {
  pending: "Waiting for moderation. It is not public yet.",
  published: "Published on the profile.",
  rejected: "Not published.",
};

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-2xl px-4 py-10">{children}</div>;
}

/** A patient's review from a physiotherapist's invitation: verified account, moderated, labelled as invited. */
async function InvitedReview({ params, searchParams }: { params: Props["params"]; searchParams: Props["searchParams"] }) {
  await connection();
  const [{ token }, sp] = await Promise.all([params, searchParams]);
  const inv = await resolveInvitation(token);
  if (!inv) {
    return (
      <Shell>
        <h1 className="text-2xl font-semibold tracking-tight">This review link is not valid</h1>
        <p className="mt-3 text-muted">Check that you opened the whole link, or ask your physiotherapist to send it again.</p>
      </Shell>
    );
  }
  const viewer = await getViewer();
  const msg = readMessage(sp);
  const name = inv.practitioner.displayName;
  const own = viewer ? await getOwnInvitedReview(viewer.userId, inv.practitioner.id) : null;

  return (
    <Shell>
      <p className="text-sm text-muted"><Link href={inv.practitioner.path} className="underline">{name}</Link> invited you to review your physiotherapy</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">Review your care with {name}</h1>
      {msg.ok && OK[msg.ok] ? <div className="card mt-4 border-brand bg-brand-soft p-4 text-sm" role="status">{OK[msg.ok]}</div> : null}
      <Notice error={msg.error} />

      {own ? (
        <section className="card mt-6 p-5 text-sm">
          <p className="font-medium">{"★".repeat(own.rating)}<span className="text-muted">{"★".repeat(5 - own.rating)}</span> <span className="ml-1 text-muted">as {own.displayName}</span></p>
          {own.text ? <p className="mt-2 whitespace-pre-wrap">{own.text}</p> : null}
          <p className="mt-3"><span className="rounded-full bg-surface-2 px-2 py-0.5 font-medium">{STATE_TEXT[own.state] ?? own.state}</span></p>
          {own.moderationReason && own.state === "rejected" ? <p className="mt-2 text-muted">Moderator&apos;s reason: {own.moderationReason}</p> : null}
          {own.photos.length ? (
            <ul className="mt-4 flex flex-wrap gap-3">
              {own.photos.map((ph) => (
                <li key={ph.id}>
                  {ph.url ? (
                    // eslint-disable-next-line @next/next/no-img-element -- ImageKit serves the sized variant
                    <img src={ph.url} alt="Photo on your review" className="h-24 w-24 rounded-[var(--r-sm)] border border-line object-cover" />
                  ) : null}
                  <form action={removeReviewPhotoAction}>
                    <input type="hidden" name="token" value={token} />
                    <input type="hidden" name="photoId" value={ph.id} />
                    <button type="submit" className="mt-1 text-xs underline">Remove photo</button>
                  </form>
                </li>
              ))}
            </ul>
          ) : null}
          <form action={withdrawInvitedReviewAction} className="mt-5">
            <input type="hidden" name="token" value={token} />
            <input type="hidden" name="reviewId" value={own.id} />
            <button type="submit" className="btn btn-quiet py-1.5 text-sm">Remove my review</button>
          </form>
          <p className="mt-2 text-xs text-muted">Shown on the profile as “Invited by the physiotherapist”. You can remove it, or any photo, at any time from this page.</p>
        </section>
      ) : inv.status !== "open" ? (
        <p className="card mt-6 p-5 text-sm text-muted">
          {inv.status === "reviewed" ? "This link has already been used for a review." : "This link is no longer active. Ask your physiotherapist for a new one."}
        </p>
      ) : !inv.practitioner.published ? (
        <p className="card mt-6 p-5 text-sm text-muted">This profile is not public at the moment, so reviews are closed.</p>
      ) : !viewer ? (
        <section className="card mt-6 p-5 text-sm">
          <p>To keep reviews genuine, we confirm your email with a one-time code before you write. It takes under a minute and we do not send marketing.</p>
          <p className="mt-4"><Link href={`/sign-in?next=${encodeURIComponent(`/review/${token}`)}`} className="btn btn-primary">Continue with email</Link></p>
          <p className="mt-3 text-xs text-muted">Your review is shown with the name you choose and the label “Invited by the physiotherapist”. Your email is never shown.</p>
        </section>
      ) : viewer.userId === inv.practitioner.ownerUserId ? (
        <p className="card mt-6 p-5 text-sm text-muted">You are signed in as the owner of this profile. This link is for your patient; send it to them.</p>
      ) : (
        <form action={submitInvitedReviewAction} className="card mt-6 grid gap-5 p-5">
          <input type="hidden" name="token" value={token} />
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
            <label className="label" htmlFor="text">Your review</label>
            <textarea id="text" name="text" className="input min-h-32" minLength={20} maxLength={2000} required placeholder="What went well, and what could be better? Think about how clearly things were explained, punctuality, and how you are doing now." />
            <p className="mt-1 text-xs text-muted">20–2000 characters. Say what you honestly think: a critical review is published the same as a positive one. Please leave out test results, phone numbers and details about anyone else.</p>
          </div>
          <div>
            <label className="label" htmlFor="displayName">Name to show</label>
            <input id="displayName" name="displayName" className="input" minLength={2} maxLength={40} required defaultValue={viewer.name ? suggestedDisplayName(viewer.name) : ""} placeholder="Ravi K." />
            <p className="mt-1 text-xs text-muted">A first name and initial is enough.</p>
          </div>
          <ReviewPhotoPicker token={token} max={MAX_REVIEW_PHOTOS} enabled={imageKitEnabled()} consentStatement={PATIENT_CONSENT_STATEMENT} />
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="confirmedGenuine" className="mt-0.5" required />
            <span>I was treated by {name} and this is my own experience. I am not their employee or relative, and I was not paid or given a discount for this review.</span>
          </label>
          <div><button type="submit" className="btn btn-primary">Send review</button></div>
          <p className="text-xs text-muted">Our team reads every review before it appears. It will be labelled “Invited by the physiotherapist”.</p>
        </form>
      )}
    </Shell>
  );
}
