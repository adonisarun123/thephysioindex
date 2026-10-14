import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { Empty, Notice, PageHeader, Section, StatePill } from "@/components/workspace/forms/ui";
import { listPractitionerReviews } from "@/lib/reviews";
import { formatIst } from "@/lib/workspace/calendar";
import { requireWorkspace } from "@/lib/workspace/context";
import { readMessage } from "@/lib/workspace/forms";
import { replyAction } from "./actions";

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
  const reviews = await listPractitionerReviews(p.id);
  const msg = readMessage(sp);
  const avg = reviews.length ? reviews.reduce((a, r) => a + r.rating, 0) / reviews.length : null;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Reviews"
        lede="Reviews come only from completed appointments and are moderated before they appear. You can reply once per review; replies are moderated too and must not mention the patient's condition, treatment or anything they did not write themselves."
      />
      <Notice ok={msg.ok} error={msg.error} />
      <Section title={avg === null ? "No published reviews yet" : `${avg.toFixed(1)} average from ${reviews.length} published review${reviews.length === 1 ? "" : "s"}`}>
        {reviews.length === 0 ? (
          <Empty>Patients can review an appointment after you mark it completed. They get an invitation a couple of hours later.</Empty>
        ) : (
          <ul className="divide-y divide-line border-y border-line text-sm">
            {reviews.map((r) => (
              <li key={r.id} className="py-4">
                <p className="font-medium">
                  {"★".repeat(r.rating)}<span className="text-muted">{"★".repeat(5 - r.rating)}</span>
                  <span className="ml-2 font-normal text-muted">{r.displayName} · {formatIst(r.publishedAt, { day: "numeric", month: "short", year: "numeric" })}</span>
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
