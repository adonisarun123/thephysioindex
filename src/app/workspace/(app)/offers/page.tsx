import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { Empty, Field, Notice, PageHeader, Section, StatePill } from "@/components/workspace/forms/ui";
import { formatPaise } from "@/lib/money";
import { formatIst } from "@/lib/workspace/calendar";
import { requireWorkspace } from "@/lib/workspace/context";
import { readMessage } from "@/lib/workspace/forms";
import { listAssociations, listOffers } from "@/lib/workspace/queries";
import { createOfferAction, pauseOfferAction, submitOfferAction } from "./actions";

export const metadata: Metadata = { title: "Offers" };

export default function Page({ searchParams }: PageProps<"/workspace/offers">) {
  return (
    <Suspense fallback={<p className="text-muted">Loading…</p>}>
      <Offers searchParams={searchParams} />
    </Suspense>
  );
}

function describeValue(type: string | null, value: number | null): string {
  if (type === null || value === null) return "—";
  if (type === "fixed") return `${formatPaise(value)} off`;
  const whole = Math.trunc(value / 100);
  const frac = value % 100;
  return `${whole}${frac ? `.${String(frac).padStart(2, "0").replace(/0$/, "")}` : ""}% off`;
}

/** Section 15 offers: draft, submit, pause and resume with redemption counts (OFR-03, OFR-06). */
async function Offers({ searchParams }: { searchParams: PageProps<"/workspace/offers">["searchParams"] }) {
  await connection();
  const sp = await searchParams;
  const { practitioner: p } = await requireWorkspace("/workspace/offers");
  const [offers, associations] = await Promise.all([listOffers(p.id), listAssociations(p.id)]);
  const offerings = associations.filter((a) => a.state !== "ended").flatMap((a) => a.offerings.map((o) => ({ id: o.id, label: `${o.displayName} · ${a.clinicName}` })));
  const msg = readMessage(sp);
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Offers" lede="One offer applies per booking at launch. Offers pass moderation before they are shown; the regular price must be genuine (OFR-04, OFR-06)." action={<a href="#new" className="btn btn-secondary py-2 text-sm">New offer</a>} />
      <Notice ok={msg.ok} error={msg.error} />

      <Section title="Your offers">
        {offers.length === 0 ? <Empty>No offers yet.</Empty> : (
          <ul className="divide-y divide-line border-y border-line text-sm">
            {offers.map((o) => (
              <li key={o.id} className="grid gap-2 py-3 sm:grid-cols-[1fr_auto] sm:items-start">
                <div>
                  <p className="font-medium">{o.title} <span className="text-muted">· {describeValue(o.type, o.value)}{o.code ? ` · code ${o.code}` : " · automatic"}</span></p>
                  <p className="text-muted">{o.startsAt && o.endsAt ? `${formatIst(o.startsAt, { day: "numeric", month: "short", year: "numeric" })} – ${formatIst(o.endsAt, { day: "numeric", month: "short", year: "numeric" })}` : ""} · {o.redemptions} redemption{o.redemptions === 1 ? "" : "s"} · v{o.version ?? "—"}</p>
                  {o.terms ? <p className="mt-1 text-muted">Terms: {o.terms}</p> : null}
                  {o.moderationReason ? <p className="mt-1 text-muted">Moderator note: {o.moderationReason}</p> : null}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <StatePill state={o.state} />
                  {["draft", "rejected"].includes(o.state) ? <form action={submitOfferAction}><input type="hidden" name="offerId" value={o.id} /><button type="submit" className="btn btn-quiet py-1 text-xs">Submit for moderation</button></form> : null}
                  {["approved", "active"].includes(o.state) ? <form action={pauseOfferAction}><input type="hidden" name="offerId" value={o.id} /><input type="hidden" name="paused" value="1" /><button type="submit" className="btn btn-quiet py-1 text-xs">Pause</button></form> : null}
                  {o.state === "paused" ? <form action={pauseOfferAction}><input type="hidden" name="offerId" value={o.id} /><input type="hidden" name="paused" value="0" /><button type="submit" className="btn btn-quiet py-1 text-xs">Resume</button></form> : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <form action={createOfferAction}>
        <Section id="new" title="New offer" lede="Fixed amount or percentage, validity dates, eligible services and caps (OFR-03). Percentages round to the nearest paise, halves up; the final price is never negative.">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2"><Field label="Title" htmlFor="title"><input id="title" name="title" className="input" required minLength={3} maxLength={120} placeholder="e.g. First assessment ₹200 off" /></Field></div>
            <Field label="Type" htmlFor="type">
              <select id="type" name="type" className="input" defaultValue="fixed"><option value="fixed">Fixed amount</option><option value="percentage">Percentage</option></select>
            </Field>
            <Field label="Code (optional; blank = applied automatically)" htmlFor="code"><input id="code" name="code" className="input" maxLength={20} pattern="[A-Za-z0-9]{3,20}" /></Field>
            <Field label="Fixed amount (₹)" htmlFor="valueRupees"><input id="valueRupees" name="valueRupees" className="input" inputMode="decimal" placeholder="e.g. 200" /></Field>
            <Field label="Percentage (%)" htmlFor="valuePercent"><input id="valuePercent" name="valuePercent" className="input" inputMode="decimal" placeholder="e.g. 10" /></Field>
            <Field label="Starts on (IST)" htmlFor="startsOn"><input id="startsOn" name="startsOn" type="date" className="input" required defaultValue={today} /></Field>
            <Field label="Ends on (IST)" htmlFor="endsOn"><input id="endsOn" name="endsOn" type="date" className="input" required /></Field>
            <Field label="Minimum spend (₹, optional)" htmlFor="minSpendRupees"><input id="minSpendRupees" name="minSpendRupees" className="input" inputMode="decimal" /></Field>
            <Field label="Maximum discount (₹, optional)" htmlFor="maxDiscountRupees"><input id="maxDiscountRupees" name="maxDiscountRupees" className="input" inputMode="decimal" /></Field>
            <Field label="Total redemption cap (optional)" htmlFor="totalCap"><input id="totalCap" name="totalCap" type="number" min={1} className="input" /></Field>
            <Field label="Per patient cap" htmlFor="perPatientCap" hint="First-visit offers are always capped at one per patient (OFR-04)."><input id="perPatientCap" name="perPatientCap" type="number" min={1} className="input" defaultValue={1} /></Field>
            <div className="sm:col-span-2">
              <p className="label">Eligible services (none selected = all your services)</p>
              {offerings.length === 0 ? <p className="text-sm text-muted">Add services first to restrict an offer.</p> : (
                <ul className="grid gap-1 text-sm sm:grid-cols-2">
                  {offerings.map((o) => <li key={o.id}><label className="flex items-center gap-2"><input type="checkbox" name="eligibleOfferingIds" value={o.id} /> {o.label}</label></li>)}
                </ul>
              )}
            </div>
            <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" name="firstVisitOnly" /> First completed visit only</label>
            <div className="sm:col-span-2"><Field label="Terms shown to patients" htmlFor="terms" hint="State conditions plainly. No strike-through pricing tricks, hidden charges or recovery guarantees."><textarea id="terms" name="terms" className="input" rows={3} required minLength={20} maxLength={1500} /></Field></div>
            <label className="flex items-start gap-2 text-sm sm:col-span-2"><input type="checkbox" name="regularPriceConfirmed" className="mt-1" required /> <span>I confirm the regular fee on my services is the genuine price I charge, and this offer reduces it as described (OFR-06).</span></label>
          </div>
          <div className="mt-5"><button type="submit" className="btn btn-primary">Save draft offer</button></div>
        </Section>
      </form>
    </div>
  );
}
