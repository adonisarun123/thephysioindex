import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { CopyField } from "@/components/workspace/copy-field";
import { Notice, PageHeader, Section, StatePill } from "@/components/workspace/forms/ui";
import { PlanBuilder } from "@/components/workspace/plan-builder";
import { PlanFields } from "@/components/workspace/plan-fields";
import { BODY_REGIONS, doseLine, getPlan, istToday, listExercises, MAX_PLAN_ITEMS, planToken, whatsappShareUrl } from "@/lib/practice/exercise-plans";
import { requestBaseUrl } from "@/lib/request-url";
import { formatIst } from "@/lib/workspace/calendar";
import { requireWorkspace } from "@/lib/workspace/context";
import { readMessage } from "@/lib/workspace/forms";
import { archivePlanAction, rotateLinkAction, updatePlanAction } from "../actions";

export const metadata: Metadata = { title: "Exercise plan" };

export default function Page({ params, searchParams }: PageProps<"/workspace/exercises/[id]">) {
  return (
    <Suspense fallback={<p className="text-muted">Loading…</p>}>
      <Plan params={params} searchParams={searchParams} />
    </Suspense>
  );
}

function last14(): string[] {
  const out: string[] = [];
  const now = Date.now();
  for (let i = 13; i >= 0; i--) out.push(istToday(new Date(now - i * 86_400_000)));
  return out;
}

/** HEP-02..04: share, adherence, edit, link rotation, archive. */
async function Plan({ params, searchParams }: { params: PageProps<"/workspace/exercises/[id]">["params"]; searchParams: PageProps<"/workspace/exercises/[id]">["searchParams"] }) {
  await connection();
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const { practitioner: p } = await requireWorkspace(`/workspace/exercises/${id}`);
  const plan = await getPlan(p.id, id);
  if (!plan) notFound();
  const [exercises, base] = await Promise.all([listExercises(p.id), requestBaseUrl()]);
  // Retired own exercises still in this plan must stay selectable while editing.
  const known = new Set(exercises.map((e) => e.id));
  const retired = plan.items.filter((i) => !known.has(i.exerciseId)).map((i) => ({
    id: i.exerciseId, name: i.name, bodyRegion: i.bodyRegion, instructions: i.instructions, defaultSets: null, defaultReps: null, defaultHoldSeconds: null, defaultFrequency: null, custom: true,
  }));
  const link = `${base}/plan/${planToken(plan.id, plan.linkVersion)}`;
  const message = `Hi ${plan.patientLabel}, here is your home exercise plan from ${p.displayName}: ${link}\nPlease tap "Done today" after each day's exercises.`;
  const done = new Map(plan.checkins.map((c) => [c.day, c.painScore]));
  const msg = readMessage(sp);
  const fmt = (d: string) => new Date(`${d}T00:00:00+05:30`).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" });

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title={`${plan.patientLabel} · ${plan.title}`}
        lede={`Created ${formatIst(plan.createdAt, { day: "numeric", month: "short", year: "numeric" })}${plan.endsOn ? ` · ends ${fmt(plan.endsOn)}` : ""} · ${plan.lastOpenedAt ? `last opened ${formatIst(plan.lastOpenedAt)}` : "not opened yet"}`}
        action={<div className="flex items-center gap-2"><StatePill state={plan.state} /><Link href="/workspace/exercises" className="btn btn-quiet py-2 text-sm">All plans</Link></div>}
      />
      <Notice ok={msg.ok} error={msg.error} />

      {plan.state === "active" ? (
        <Section title="Send to your patient" lede="Anyone with this link can open the plan, so send it only to the patient. Make a new link if it was sent to the wrong person.">
          <CopyField value={link} label="Patient link" />
          <div className="mt-3 flex flex-wrap gap-2">
            <a href={whatsappShareUrl(message)} target="_blank" rel="noopener noreferrer" className="btn btn-primary py-2 text-sm">Send on WhatsApp</a>
            <a href={link} target="_blank" rel="noopener noreferrer" className="btn btn-secondary py-2 text-sm">Preview as patient</a>
            <form action={rotateLinkAction}><input type="hidden" name="planId" value={plan.id} /><button type="submit" className="btn btn-quiet py-2 text-sm">Make a new link</button></form>
          </div>
        </Section>
      ) : null}

      <Section title="Last 14 days" lede="Days your patient marked as done, with the pain score they gave (0 = no pain, 10 = worst).">
        <ol className="grid grid-cols-7 gap-1 text-center text-xs sm:grid-cols-14">
          {last14().map((d) => {
            const has = done.has(d);
            const pain = done.get(d);
            return (
              <li key={d} className={`rounded-[var(--r-sm)] border p-1.5 ${has ? "border-brand bg-brand-soft text-brand-ink" : "border-line text-muted"}`}>
                <span className="block">{fmt(d)}</span>
                <span className="block font-semibold">{has ? (pain != null ? `${pain}/10` : "Done") : "—"}</span>
              </li>
            );
          })}
        </ol>
      </Section>

      <Section title="Exercises">
        <ol className="grid gap-2 text-sm">
          {plan.items.map((i, n) => (
            <li key={i.exerciseId}><span className="font-medium">{n + 1}. {i.name}</span> <span className="text-muted">{doseLine(i)}</span>{i.note ? <span className="block text-muted">Note: {i.note}</span> : null}</li>
          ))}
        </ol>
      </Section>

      <form action={updatePlanAction} id="edit">
        <input type="hidden" name="planId" value={plan.id} />
        <PlanFields values={plan} />
        <Section title="Edit exercises" lede="Saving changes updates what the patient sees at the same link.">
          <PlanBuilder
            exercises={[...exercises, ...retired]}
            regions={[...BODY_REGIONS]}
            max={MAX_PLAN_ITEMS}
            initial={plan.items.map((i) => ({ exerciseId: i.exerciseId, sets: i.sets?.toString() ?? "", reps: i.reps?.toString() ?? "", holdSeconds: i.holdSeconds?.toString() ?? "", frequency: i.frequency ?? "", note: i.note ?? "" }))}
          />
        </Section>
        <div className="mt-6"><button type="submit" className="btn btn-primary">Save changes</button></div>
      </form>

      <form action={archivePlanAction} className="mt-8 border-t border-line pt-4 text-sm">
        <input type="hidden" name="planId" value={plan.id} />
        <input type="hidden" name="archived" value={plan.state === "active" ? "1" : "0"} />
        <button type="submit" className="btn btn-quiet py-1 text-sm">{plan.state === "active" ? "Archive plan (link stops working)" : "Restore plan"}</button>
      </form>
    </div>
  );
}
