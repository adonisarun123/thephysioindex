import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { Notice } from "@/components/workspace/forms/ui";
import { isBot } from "@/lib/analytics";
import { doseLine, getPlanByToken, istToday, markPlanOpened } from "@/lib/practice/exercise-plans";
import { readMessage } from "@/lib/workspace/forms";
import { checkinAction } from "./actions";

/** Private patient page (HEP-03, HEP-04): never indexed, no referrer leaves the page, no ads tag. */
export const metadata: Metadata = {
  title: "Your exercise plan",
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};

export default function Page({ params, searchParams }: PageProps<"/plan/[token]">) {
  return (
    <Suspense fallback={<div className="mx-auto max-w-2xl px-4 py-10 text-muted">Loading your plan…</div>}>
      <PatientPlan params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function PatientPlan({ params, searchParams }: { params: PageProps<"/plan/[token]">["params"]; searchParams: PageProps<"/plan/[token]">["searchParams"] }) {
  await connection();
  const [{ token }, sp, h] = await Promise.all([params, searchParams, headers()]);
  const plan = await getPlanByToken(token);
  const msg = readMessage(sp);

  if (!plan) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12">
        <h1 className="text-2xl font-semibold tracking-tight">This plan link is not active</h1>
        <p className="mt-3 text-muted">The link may have been replaced or the plan archived. Ask your physiotherapist to send you the current link.</p>
      </div>
    );
  }
  if (!isBot(h.get("user-agent"))) await markPlanOpened(plan.id);
  const todayPain = plan.checkins.find((c) => c.day === istToday())?.painScore ?? null;

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <p className="text-sm text-muted">Home exercise plan for {plan.patientLabel}</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">{plan.title}</h1>
      <p className="mt-1 text-sm text-muted">
        From{" "}
        {plan.practitionerPublished && plan.practitionerSlug ? <Link href={`/physiotherapist/${plan.practitionerSlug}`} className="underline">{plan.practitionerName}</Link> : plan.practitionerName}
      </p>
      <Notice ok={msg.ok} error={msg.error} />

      <div className="card mt-5 border-mark bg-mark-soft p-4 text-sm">
        <p>Do these exercises only as your physiotherapist advised. Stop and contact them if pain increases sharply, or if you feel dizzy, numb or unwell.</p>
        {plan.advice ? <p className="mt-2 whitespace-pre-line font-medium">{plan.advice}</p> : null}
      </div>

      {plan.ended ? (
        <p className="card mt-5 p-4 text-sm">This plan ended on {plan.endsOn}. Ask your physiotherapist for an updated plan.</p>
      ) : null}

      <ol className="mt-6 grid gap-4">
        {plan.items.map((i, n) => (
          <li key={i.exerciseId} className="card p-4">
            <h2 className="text-lg font-semibold">{n + 1}. {i.name}</h2>
            {doseLine(i) ? <p className="mt-1 font-medium text-brand-ink">{doseLine(i)}</p> : null}
            <p className="mt-2 text-sm leading-relaxed">{i.instructions}</p>
            {i.note ? <p className="mt-2 text-sm"><span className="font-medium">Note from your physiotherapist:</span> {i.note}</p> : null}
          </li>
        ))}
      </ol>

      {!plan.ended ? (
        <form action={checkinAction} className="card mt-6 grid gap-3 p-4">
          <input type="hidden" name="token" value={token} />
          <h2 className="text-lg font-semibold">{plan.doneToday ? "Today is marked as done" : "Finished today's exercises?"}</h2>
          <label className="text-sm">
            Pain during exercise today (optional)
            <select name="pain" className="input mt-1" defaultValue={todayPain != null ? String(todayPain) : ""}>
              <option value="">Prefer not to say</option>
              {Array.from({ length: 11 }, (_, n) => <option key={n} value={n}>{n}{n === 0 ? " — no pain" : n === 10 ? " — worst pain" : ""}</option>)}
            </select>
          </label>
          <button type="submit" className="btn btn-primary">{plan.doneToday ? "Update today" : "Done today"}</button>
          <p className="text-xs text-muted">Your physiotherapist sees the days you mark and any pain score. Nothing else is shared.</p>
        </form>
      ) : null}
    </div>
  );
}
