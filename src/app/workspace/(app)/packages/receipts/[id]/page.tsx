import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { LetterheadBlock } from "@/components/workspace/letterhead";
import { PrintButton } from "@/components/workspace/print";
import { formatPaise } from "@/lib/money";
import { getLetterhead } from "@/lib/practice/letterhead";
import { getReceipt, PAYMENT_MODES, rupeesInWords } from "@/lib/practice/packages";
import { requireWorkspace } from "@/lib/workspace/context";

export const metadata: Metadata = { title: "Payment receipt" };

export default function Page({ params }: PageProps<"/workspace/packages/receipts/[id]">) {
  return (
    <Suspense fallback={<p className="text-muted">Loading…</p>}>
      <ReceiptView params={params} />
    </Suspense>
  );
}

const MODE = Object.fromEntries(PAYMENT_MODES.map((m) => [m.key, m.label]));
const fmt = (d: string) => new Date(`${d}T00:00:00+05:30`).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "long", year: "numeric" });

/** RCP-02: printable payment receipt. Not a tax invoice; GST treatment is the practice's own. */
async function ReceiptView({ params }: { params: PageProps<"/workspace/packages/receipts/[id]">["params"] }) {
  await connection();
  const { id } = await params;
  const { practitioner: p } = await requireWorkspace(`/workspace/packages/receipts/${id}`);
  const r = await getReceipt(p.id, id);
  if (!r) notFound();
  const lh = await getLetterhead(p.id);

  return (
    <div className="mx-auto max-w-2xl bg-white p-6 text-black print:max-w-none print:p-0">
      <div className="mb-6 flex flex-wrap gap-2 print:hidden">
        <PrintButton />
        <Link href="/workspace/packages" className="btn btn-quiet py-2 text-sm">Back to packages</Link>
      </div>
      <LetterheadBlock lh={lh} />
      <h1 className="mt-4 text-center text-lg font-bold tracking-wide">PAYMENT RECEIPT</h1>
      <div className="mt-4 flex justify-between text-sm">
        <p><span className="font-semibold">Receipt no:</span> {r.receiptNo}</p>
        <p><span className="font-semibold">Date:</span> {fmt(r.receivedOn)}</p>
      </div>
      <table className="mt-4 w-full border-collapse text-sm">
        <tbody>
          <Row label="Received from">{r.patientLabel}</Row>
          <Row label="Towards">{r.packageName} ({r.sessionsTotal} sessions)</Row>
          <Row label="Amount">{formatPaise(r.amountPaise, { showPaise: true })}</Row>
          <Row label="In words">{rupeesInWords(r.amountPaise)}</Row>
          <Row label="Payment mode">{r.paymentMode ? MODE[r.paymentMode] ?? r.paymentMode : "—"}</Row>
          <Row label="Package price">{formatPaise(r.pricePaise)}</Row>
          <Row label="Paid to date">{formatPaise(r.paidToDatePaise)}</Row>
          <Row label="Balance due">{formatPaise(r.balanceAfterPaise)}</Row>
        </tbody>
      </table>
      <div className="mt-14 flex justify-end text-sm">
        <div className="w-56 border-t border-black pt-1 text-center">{lh.name}<br />Authorised signature</div>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <tr className="border-b border-line">
      <th scope="row" className="w-40 py-1.5 pr-3 text-left font-semibold">{label}</th>
      <td className="py-1.5">{children}</td>
    </tr>
  );
}
