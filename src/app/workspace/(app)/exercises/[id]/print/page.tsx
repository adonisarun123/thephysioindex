import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { LetterheadBlock } from "@/components/workspace/letterhead";
import { PrintButton } from "@/components/workspace/print";
import { doseLine, getPlan, istToday, planToken } from "@/lib/practice/exercise-plans";
import { getLetterhead } from "@/lib/practice/letterhead";
import { requestBaseUrl } from "@/lib/request-url";
import { requireWorkspace } from "@/lib/workspace/context";

export const metadata: Metadata = { title: "Print prescription" };

export default function Page({ params }: PageProps<"/workspace/exercises/[id]/print">) {
  return (
    <Suspense fallback={<p className="text-muted">Loading…</p>}>
      <PrintPlan params={params} />
    </Suspense>
  );
}

const fmt = (d: string) => new Date(`${d}T00:00:00+05:30`).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "long", year: "numeric" });

/** RCP-03: printable home-exercise prescription on the practitioner's letterhead. */
async function PrintPlan({ params }: { params: PageProps<"/workspace/exercises/[id]/print">["params"] }) {
  await connection();
  const { id } = await params;
  const { practitioner: p } = await requireWorkspace(`/workspace/exercises/${id}/print`);
  const plan = await getPlan(p.id, id);
  if (!plan) notFound();
  const [lh, base] = await Promise.all([getLetterhead(p.id), requestBaseUrl()]);
  const link = `${base}/plan/${planToken(plan.id, plan.linkVersion)}`;

  return (
    <div className="mx-auto max-w-3xl bg-white p-6 text-black print:max-w-none print:p-0">
      <div className="mb-6 flex flex-wrap gap-2 print:hidden">
        <PrintButton />
        <Link href={`/workspace/exercises/${plan.id}`} className="btn btn-quiet py-2 text-sm">Back to plan</Link>
      </div>
      <LetterheadBlock lh={lh} />
      <div className="mt-4 flex flex-wrap justify-between gap-2 text-sm">
        <p><span className="font-semibold">Patient:</span> {plan.patientLabel}</p>
        <p><span className="font-semibold">Date:</span> {fmt(istToday())}</p>
      </div>
      <h1 className="mt-4 text-lg font-bold">Home exercise programme — {plan.title}</h1>
      {plan.advice ? <p className="mt-2 whitespace-pre-line text-sm">{plan.advice}</p> : null}
      <ol className="mt-4 grid gap-3">
        {plan.items.map((i, n) => (
          <li key={i.exerciseId} className="break-inside-avoid border-b border-line pb-3 text-sm">
            <p className="font-semibold">{n + 1}. {i.name}{doseLine(i) ? <span className="font-normal"> — {doseLine(i)}</span> : null}</p>
            <p className="mt-1">{i.instructions}</p>
            {i.note ? <p className="mt-1 italic">Note: {i.note}</p> : null}
          </li>
        ))}
      </ol>
      {plan.endsOn ? <p className="mt-3 text-sm">Review by: {fmt(plan.endsOn)}</p> : null}
      <p className="mt-4 text-xs">Stop and contact your physiotherapist if pain increases sharply, or if you feel dizzy, numb or unwell. Online copy: {link}</p>
      <div className="mt-12 flex justify-end text-sm">
        <div className="w-56 border-t border-black pt-1 text-center">{lh.name}<br />Signature</div>
      </div>
    </div>
  );
}
