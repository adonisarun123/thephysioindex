import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { PageHeader, Section } from "@/components/workspace/forms/ui";
import { requireWorkspace } from "@/lib/workspace/context";
import { bookingCountsByStatus, listOffers } from "@/lib/workspace/queries";

export const metadata: Metadata = { title: "Reports" };

export default function Page() {
  return (
    <Suspense fallback={<p className="text-muted">Loading…</p>}>
      <Reports />
    </Suspense>
  );
}

const ROWS: [string, string][] = [
  ["confirmed", "Confirmed"],
  ["completed", "Completed visits"],
  ["patient_cancelled", "Cancelled by patient"],
  ["provider_cancelled", "Cancelled by you"],
  ["no_show", "No-shows"],
  ["requested", "Requested (request mode)"],
  ["declined", "Declined"],
  ["expired", "Expired"],
];

/** Section 15 Reports: counts match the scoped booking records. Views and sources arrive with analytics (ANA-01). */
async function Reports() {
  await connection();
  const { practitioner: p } = await requireWorkspace("/workspace/reports");
  const [counts, offers] = await Promise.all([bookingCountsByStatus(p.id), listOffers(p.id)]);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Reports" lede="All numbers come from your own booking records; nothing is sampled or estimated." />
      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <Section title="Profile views" lede="Coming with analytics">
          <p className="text-sm text-muted">Profile views, search impressions and traffic sources are not tracked yet. They arrive with the pseudonymous analytics pipeline (DAT-17); nothing about individual visitors will be shown.</p>
        </Section>
        <Section title="Bookings by status" lede={`${total} booking${total === 1 ? "" : "s"} in total`}>
          <table className="w-full text-sm">
            <caption className="sr-only">Bookings by status</caption>
            <tbody>
              {ROWS.map(([key, label]) => (
                <tr key={key} className="border-t border-line first:border-t-0">
                  <td className="py-1.5">{label}</td>
                  <td className="py-1.5 text-right font-medium">{counts[key] ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {total === 0 ? <p className="mt-2 text-xs text-muted">No bookings yet. Online booking opens after approval and eligibility checks.</p> : null}
        </Section>
        <Section title="Offer redemptions">
          {offers.length === 0 ? <p className="text-sm text-muted">No offers.</p> : (
            <ul className="text-sm">{offers.map((o) => <li key={o.id} className="flex justify-between border-t border-line py-1.5 first:border-t-0"><span>{o.title}</span><span className="font-medium">{o.redemptions}</span></li>)}</ul>
          )}
        </Section>
        <Section title="Exports" lede="Scoped, purpose-bound CSV exports with a short download window (PRO-17)">
          <p className="text-sm text-muted">Exports open with the appointments release. They will default to minimum operational fields and be audited.</p>
          <button type="button" className="btn btn-quiet mt-3 py-1.5 text-sm" disabled aria-disabled="true">Request export</button>
        </Section>
      </div>
    </div>
  );
}
