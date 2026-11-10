import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { PlanBuilder } from "@/components/workspace/plan-builder";
import { Notice, PageHeader, Section } from "@/components/workspace/forms/ui";
import { PlanFields } from "@/components/workspace/plan-fields";
import { BODY_REGIONS, listExercises, MAX_PLAN_ITEMS } from "@/lib/practice/exercise-plans";
import { requireWorkspace } from "@/lib/workspace/context";
import { readMessage } from "@/lib/workspace/forms";
import { createPlanAction } from "../actions";

export const metadata: Metadata = { title: "New exercise plan" };

export default function Page({ searchParams }: PageProps<"/workspace/exercises/new">) {
  return (
    <Suspense fallback={<p className="text-muted">Loading…</p>}>
      <NewPlan searchParams={searchParams} />
    </Suspense>
  );
}

async function NewPlan({ searchParams }: { searchParams: PageProps<"/workspace/exercises/new">["searchParams"] }) {
  await connection();
  const sp = await searchParams;
  const { practitioner: p } = await requireWorkspace("/workspace/exercises/new");
  const exercises = await listExercises(p.id);
  const msg = readMessage(sp);
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="New exercise plan" lede="Pick exercises, adjust the dose, save, then send the link to your patient." action={<Link href="/workspace/exercises" className="btn btn-quiet py-2 text-sm">Back to plans</Link>} />
      <Notice ok={msg.ok} error={msg.error} />
      <form action={createPlanAction}>
        <PlanFields />
        <Section title="Exercises">
          <PlanBuilder exercises={exercises} regions={[...BODY_REGIONS]} initial={[]} max={MAX_PLAN_ITEMS} />
        </Section>
        <div className="mt-6"><button type="submit" className="btn btn-primary">Save plan and get link</button></div>
      </form>
    </div>
  );
}
