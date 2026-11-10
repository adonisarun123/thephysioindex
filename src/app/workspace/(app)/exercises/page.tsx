import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { Empty, Field, Notice, PageHeader, Section, StatePill } from "@/components/workspace/forms/ui";
import { BODY_REGIONS, listExercises, listPlans } from "@/lib/practice/exercise-plans";
import { formatIst } from "@/lib/workspace/calendar";
import { requireWorkspace } from "@/lib/workspace/context";
import { readMessage } from "@/lib/workspace/forms";
import { createExerciseAction, retireExerciseAction } from "./actions";

export const metadata: Metadata = { title: "Exercise plans" };

export default function Page({ searchParams }: PageProps<"/workspace/exercises">) {
  return (
    <Suspense fallback={<p className="text-muted">Loading…</p>}>
      <Plans searchParams={searchParams} />
    </Suspense>
  );
}

const REGION = Object.fromEntries(BODY_REGIONS.map((r) => [r.key, r.label]));

/** HEP-01..03: plans list with adherence, and the practitioner's own exercises. */
async function Plans({ searchParams }: { searchParams: PageProps<"/workspace/exercises">["searchParams"] }) {
  await connection();
  const sp = await searchParams;
  const { practitioner: p } = await requireWorkspace("/workspace/exercises");
  const [plans, exercises] = await Promise.all([listPlans(p.id), listExercises(p.id)]);
  const mine = exercises.filter((e) => e.custom);
  const msg = readMessage(sp);

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Exercise plans"
        lede="Build a home exercise plan, send it on WhatsApp, and see whether your patient is doing it. Free for listed physiotherapists."
        action={<Link href="/workspace/exercises/new" className="btn btn-primary py-2 text-sm">New plan</Link>}
      />
      <Notice ok={msg.ok} error={msg.error} />

      <Section title="Your plans" lede="Patients mark each day's exercises as done and can add a pain score. Archived plans stop opening for the patient.">
        {plans.length === 0 ? (
          <Empty>No plans yet. <Link href="/workspace/exercises/new" className="underline">Create your first plan</Link> — it takes about a minute.</Empty>
        ) : (
          <ul className="divide-y divide-line border-y border-line text-sm">
            {plans.map((pl) => (
              <li key={pl.id} className="grid gap-1 py-3 sm:grid-cols-[1fr_auto] sm:items-center">
                <div>
                  <Link href={`/workspace/exercises/${pl.id}`} className="font-medium underline-offset-2 hover:underline">{pl.patientLabel} · {pl.title}</Link>
                  <p className="text-muted">
                    {pl.itemCount} exercise{pl.itemCount === 1 ? "" : "s"} · created {formatIst(pl.createdAt, { day: "numeric", month: "short" })}
                    {" · "}{pl.lastOpenedAt ? `opened ${formatIst(pl.lastOpenedAt, { day: "numeric", month: "short" })}` : "not opened yet"}
                    {" · "}done {pl.doneLast7}/7 days{pl.lastPain !== null ? ` · last pain ${pl.lastPain}/10` : ""}
                  </p>
                </div>
                <StatePill state={pl.state} />
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section id="my-exercises" title="My exercises" lede="Add exercises you prescribe often. Only you can see and use them. The starter library has 40 common exercises.">
        {mine.length === 0 ? <Empty>You have not added any exercises yet.</Empty> : (
          <ul className="divide-y divide-line border-y border-line text-sm">
            {mine.map((e) => (
              <li key={e.id} className="flex items-start justify-between gap-3 py-3">
                <div>
                  <p className="font-medium">{e.name} <span className="text-muted">· {REGION[e.bodyRegion] ?? e.bodyRegion}</span></p>
                  <p className="text-muted">{e.instructions}</p>
                </div>
                <form action={retireExerciseAction}>
                  <input type="hidden" name="exerciseId" value={e.id} />
                  <button type="submit" className="btn btn-quiet py-1 text-xs">Remove</button>
                </form>
              </li>
            ))}
          </ul>
        )}
        <form action={createExerciseAction} className="mt-5 grid gap-4 sm:grid-cols-2">
          <Field label="Exercise name" htmlFor="name"><input id="name" name="name" className="input" required minLength={3} maxLength={80} /></Field>
          <Field label="Body region" htmlFor="bodyRegion">
            <select id="bodyRegion" name="bodyRegion" className="input" defaultValue="knee">
              {BODY_REGIONS.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
            </select>
          </Field>
          <div className="sm:col-span-2">
            <Field label="Instructions for the patient" htmlFor="instructions" hint="Plain language: starting position, the movement, what to feel, when to stop.">
              <textarea id="instructions" name="instructions" className="input" rows={3} required minLength={20} maxLength={1500} />
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:col-span-2">
            <Field label="Sets" htmlFor="sets"><input id="sets" name="sets" type="number" min={1} max={20} className="input" /></Field>
            <Field label="Reps" htmlFor="reps"><input id="reps" name="reps" type="number" min={1} max={200} className="input" /></Field>
            <Field label="Hold (seconds)" htmlFor="holdSeconds"><input id="holdSeconds" name="holdSeconds" type="number" min={1} max={600} className="input" /></Field>
          </div>
          <Field label="How often (optional)" htmlFor="frequency"><input id="frequency" name="frequency" className="input" maxLength={80} placeholder="e.g. Twice a day" /></Field>
          <div className="flex items-end"><button type="submit" className="btn btn-secondary">Add exercise</button></div>
        </form>
      </Section>
    </div>
  );
}
