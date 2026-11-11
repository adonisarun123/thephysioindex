import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { Empty, Notice, PageHeader, Section, StatePill } from "@/components/workspace/forms/ui";
import { CopyLink } from "@/components/workspace/copy-link";
import { INVITE_TTL_DAYS, listInvitations } from "@/lib/review-invitations";
import { listPractitionerReviews } from "@/lib/reviews";
import { formatIst } from "@/lib/workspace/calendar";
import { requireWorkspace } from "@/lib/workspace/context";
import { readMessage } from "@/lib/workspace/forms";
import { inviteAction, replyAction, revokeInviteAction } from "./actions";

const siteUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.thephysioindex.com";

export const metadata: Metadata = { title: "Reviews" };

export default function Page({ searchParams }: PageProps<"/workspace/reviews">) {
  return (
    <Suspense fallback={<p className="text-muted">Loading…</p>}>
      <Reviews searchParams={searchParams} />
    </Suspense>
  );
}

/** Published patient reviews and your replies (REV-03). Patient identity is never shown beyond the chosen display name. */
async function Reviews({ searchParams }: { searchParams: PageProps<"/workspace/reviews">["searchParams"] }) {
  await connection();
  const sp = await searchParams;
  const { practitioner: p } = await requireWorkspace("/workspace/reviews");
  const [reviews, invitations] = await Promise.all([listPractitionerReviews(p.id), listInvitations(p.id)]);
  const msg = readMessage(sp);
  // The headline average counts appointment reviews only; invited reviews are shown apart on the profile.
  const booked = reviews.filter((r) => r.source === "booking");
  const avg = booked.length ? booked.reduce((a, r) => a + r.rating, 0) / booked.length : null;
  const invitedCount = reviews.length - booked.length;
  const fresh = typeof sp.new === "string" ? invitations.find((i) => i.id === sp.new && i.status === "open") : undefined;
  const linkFor = (token: string) => `${siteUrl}/review/${token}`;
  const waFor = (token: string) => `https://wa.me/?text=${encodeURIComponent(`Thank you for choosing me for your physiotherapy. If you have two minutes, I would be grateful for a short review of your experience: ${linkFor(token)}`)}`;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Reviews"
        lede="Reviews come from completed appointments booked here, or from patients you invite. All are moderated before they appear. You can reply once per review; replies are moderated too and must not mention the patient's condition, treatment or anything they did not write themselves."
      />
      <Notice ok={msg.ok} error={msg.error} />
      <Section
        id="invite"
        title="Invite a patient to review you"
        lede={`For patients you treated outside The Physio Index. They open your link, confirm their email with a code, and can add photos of their own. Their review is shown as “Invited by the physiotherapist” and is not counted in your star average. A link works once and for ${INVITE_TTL_DAYS} days.`}
      >
        {p.listingStatus !== "published" ? (
          <Empty>You can invite patients once your profile is approved and published.</Empty>
        ) : (
          <>
            <form action={inviteAction} className="flex flex-wrap items-end gap-3">
              <div className="min-w-0 flex-1">
                <label className="label" htmlFor="patientLabel">Patient&apos;s name (only you see this)</label>
                <input id="patientLabel" name="patientLabel" className="input" maxLength={60} required placeholder="Ravi K" />
              </div>
              <button type="submit" className="btn btn-primary">Create review link</button>
            </form>
            <p className="mt-2 text-xs text-muted">Invite only people you have treated, and ask everyone, not just the happiest. Reviews written by you, your staff or your family are removed and can lead to your profile being suspended.</p>
            {fresh ? (
              <div className="well mt-4 grid gap-2 p-3 text-sm" role="status">
                <p className="font-medium">Link for {fresh.patientLabel}</p>
                <CopyLink url={linkFor(fresh.token)} />
                <div><a href={waFor(fresh.token)} target="_blank" rel="noopener noreferrer" className="btn btn-secondary py-1.5 text-sm">Send on WhatsApp</a></div>
              </div>
            ) : null}
            {invitations.length ? (
              <ul className="mt-4 divide-y divide-line border-y border-line text-sm">
                {invitations.map((i) => (
                  <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <p>
                      <span className="font-medium">{i.patientLabel}</span>
                      <span className="ml-2 text-muted">
                        {i.status === "open" ? `Sent ${formatIst(i.createdAt, { day: "numeric", month: "short" })}, waiting` : i.status === "reviewed" ? `Reviewed${i.reviewState === "pending" ? ", with our team" : i.reviewState === "published" ? ", published" : i.reviewState === "rejected" ? ", not published" : ""}` : i.status === "expired" ? "Link expired" : "Cancelled"}
                      </span>
                    </p>
                    {i.status === "open" ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <a href={waFor(i.token)} target="_blank" rel="noopener noreferrer" className="btn btn-quiet py-1.5 text-sm">WhatsApp</a>
                        <CopyLink url={linkFor(i.token)} compact />
                        <form action={revokeInviteAction}>
                          <input type="hidden" name="invitationId" value={i.id} />
                          <button type="submit" className="btn btn-quiet py-1.5 text-sm">Cancel</button>
                        </form>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        )}
      </Section>
      <Section title={reviews.length === 0 ? "No published reviews yet" : `${avg === null ? "No appointment reviews yet" : `${avg.toFixed(1)} average from ${booked.length} appointment review${booked.length === 1 ? "" : "s"}`}${invitedCount ? ` · ${invitedCount} invited review${invitedCount === 1 ? "" : "s"}` : ""}`}>
        {reviews.length === 0 ? (
          <Empty>Patients can review an appointment after you mark it completed, and patients you invite above can review you from their link.</Empty>
        ) : (
          <ul className="divide-y divide-line border-y border-line text-sm">
            {reviews.map((r) => (
              <li key={r.id} className="py-4">
                <p className="font-medium">
                  {"★".repeat(r.rating)}<span className="text-muted">{"★".repeat(5 - r.rating)}</span>
                  <span className="ml-2 font-normal text-muted">{r.displayName} · {formatIst(r.publishedAt, { day: "numeric", month: "short", year: "numeric" })}</span>
                  {r.source === "invitation" ? <span className="pill ml-2 bg-mark-soft font-normal text-ink-2">Invited by you</span> : null}
                </p>
                {r.text ? <p className="mt-1 whitespace-pre-wrap">{r.text}</p> : null}
                {r.reply ? (
                  <div className="mt-3 border-l-2 border-line pl-3">
                    <p className="flex items-center gap-2 text-xs text-muted">Your reply (version {r.reply.version}) <StatePill state={r.reply.state} /></p>
                    <p className="mt-1 whitespace-pre-wrap">{r.reply.text}</p>
                    {r.reply.state === "rejected" && r.reply.moderationReason ? <p className="mt-1 text-xs text-muted">Moderator&apos;s reason: {r.reply.moderationReason}</p> : null}
                  </div>
                ) : null}
                {!r.reply || r.reply.state !== "pending" ? (
                  <details className="mt-3">
                    <summary className="cursor-pointer text-sm underline">{r.reply ? "Edit reply" : "Reply"}</summary>
                    <form action={replyAction} className="mt-2 grid gap-2">
                      <input type="hidden" name="reviewId" value={r.id} />
                      <label className="sr-only" htmlFor={`reply-${r.id}`}>Reply</label>
                      <textarea id={`reply-${r.id}`} name="text" className="input min-h-24" maxLength={1000} required defaultValue={r.reply?.text ?? ""} />
                      <div><button type="submit" className="btn btn-secondary py-1.5 text-sm">Send for moderation</button></div>
                    </form>
                  </details>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
