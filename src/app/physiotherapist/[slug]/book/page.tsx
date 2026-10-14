import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { Notice } from "@/components/workspace/forms/ui";
import { db } from "@/db/client";
import { getViewer } from "@/lib/auth/session";
import { listBookablePatients } from "@/lib/booking/patients";
import { listOfferingsForBooking } from "@/lib/booking/queries";
import { computeSlots } from "@/lib/booking/slots";
import { addDays, formatLocal, isLocalDate, todayLocal } from "@/lib/booking/time";
import { resolvePractitionerSlug } from "@/lib/directory";
import { formatPaise } from "@/lib/money";
import { readMessage, withQuery } from "@/lib/workspace/forms";
import { holdAction } from "./actions";

export const metadata: Metadata = { title: "Book an appointment", robots: { index: false, follow: true } };

type Props = PageProps<"/physiotherapist/[slug]/book">;

export default function Page({ params, searchParams }: Props) {
  return (
    <Suspense fallback={<div className="mx-auto max-w-3xl px-4 py-12 text-muted">Loading…</div>}>
      <Book params={params} searchParams={searchParams} />
    </Suspense>
  );
}

const DAYS_SHOWN = 14;

/**
 * Booking flow: service → date → time → who it is for → hold → review and
 * confirm. Slots shown here are advisory (CAL-11); the hold transaction
 * rechecks everything under the calendar lock.
 */
async function Book({ params, searchParams }: { params: Props["params"]; searchParams: Props["searchParams"] }) {
  await connection();
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const resolved = await resolvePractitionerSlug(slug);
  if (!resolved) notFound();
  const canonical = `${resolved.slug}-${resolved.publicId}`;
  if (slug !== canonical) permanentRedirect(`/physiotherapist/${canonical}/book`);
  const { practitioner, offerings } = await listOfferingsForBooking(resolved.publicId);
  if (!practitioner) notFound();
  const base = `/physiotherapist/${canonical}/book`;
  const msg = readMessage(sp);

  const offeringId = typeof sp.o === "string" ? sp.o : undefined;
  const chosen = offerings.find((o) => o.ctx.offeringId === offeringId && o.bookable);
  const today = todayLocal();
  const date = typeof sp.d === "string" && isLocalDate(sp.d) && sp.d >= today ? sp.d : today;
  const startsAt = typeof sp.t === "string" ? sp.t : undefined;

  const branches = new Map<string, typeof offerings>();
  for (const o of offerings) branches.set(`${o.ctx.clinicName} · ${o.ctx.branchName}`, [...(branches.get(`${o.ctx.clinicName} · ${o.ctx.branchName}`) ?? []), o]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <p className="text-sm text-muted"><Link href={`/physiotherapist/${canonical}`} className="underline">Back to {practitioner.name}</Link></p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">Book with {practitioner.name}</h1>
      <p className="mt-1 text-sm text-muted">Times are in India Standard Time (IST). Pay at the clinic; no card details are collected.</p>
      <Notice error={msg.error} />

      <section className="card mt-6 p-5" aria-labelledby="step-service">
        <h2 id="step-service" className="text-lg font-semibold">1. Service and clinic</h2>
        {offerings.length === 0 ? (
          <p className="mt-2 text-sm text-muted">No services are open for online booking. <Link href={`/physiotherapist/${canonical}/enquire`} className="underline">Send an enquiry</Link>.</p>
        ) : (
          [...branches.entries()].map(([label, list]) => (
            <div key={label} className="mt-4">
              <h3 className="text-sm font-medium text-muted">{label}</h3>
              <ul className="mt-2 divide-y divide-line border-y border-line">
                {list.map((o) => {
                  const total = o.ctx.basePricePaise + o.ctx.taxPaise + o.ctx.extraChargesPaise;
                  const selected = o.ctx.offeringId === chosen?.ctx.offeringId;
                  return (
                    <li key={o.ctx.offeringId} className="flex flex-wrap items-center justify-between gap-3 py-3">
                      <div>
                        <p className="font-medium">{o.ctx.offeringName} <span className="text-sm font-normal text-muted">· {o.serviceLabel}</span></p>
                        <p className="text-sm text-muted">
                          {o.ctx.terms.durationMin} min · {formatPaise(o.ctx.basePricePaise)}
                          {total !== o.ctx.basePricePaise ? ` + ${formatPaise(total - o.ctx.basePricePaise)} taxes/charges` : ""}
                          {o.ctx.mode !== "clinic" ? ` · ${o.ctx.mode === "home_visit" ? "Home visit" : "Online session"}` : ""}
                        </p>
                        {o.ctx.priceNote ? <p className="text-xs text-muted">{o.ctx.priceNote}</p> : null}
                        {!o.bookable ? <p className="mt-1 text-xs text-muted">{o.reason}</p> : null}
                      </div>
                      {o.bookable ? (
                        selected ? <span className="text-sm font-medium text-brand">Selected</span> : <Link href={withQuery(base, { o: o.ctx.offeringId })} className="btn btn-secondary py-1.5 text-sm">Choose</Link>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))
        )}
      </section>

      {chosen ? <DateAndTime base={base} chosen={chosen.ctx} date={date} today={today} startsAt={startsAt} /> : null}
      {chosen && startsAt ? <WhoFor canonical={canonical} base={base} offeringId={chosen.ctx.offeringId} date={date} startsAt={startsAt} /> : null}
    </div>
  );
}

async function DateAndTime({ base, chosen, date, today, startsAt }: { base: string; chosen: Awaited<ReturnType<typeof listOfferingsForBooking>>["offerings"][number]["ctx"]; date: string; today: string; startsAt?: string }) {
  const end = addDays(today, DAYS_SHOWN - 1);
  const slots = await computeSlots(db(), chosen, date, date);
  const days = Array.from({ length: DAYS_SHOWN }, (_, i) => addDays(today, i));
  return (
    <section className="card mt-4 p-5" aria-labelledby="step-time">
      <h2 id="step-time" className="text-lg font-semibold">2. Date and time</h2>
      <nav aria-label="Choose a date" className="mt-3 flex gap-2 overflow-x-auto pb-2">
        {days.map((d) => (
          <Link
            key={d}
            href={withQuery(base, { o: chosen.offeringId, d })}
            aria-current={d === date ? "date" : undefined}
            className={`shrink-0 rounded-[var(--r-ctl)] border px-3 py-2 text-center text-sm ${d === date ? "border-brand bg-brand-soft font-medium" : "border-line"}`}
          >
            <span className="block">{formatLocal(Date.parse(`${d}T12:00:00+05:30`), { weekday: "short" })}</span>
            <span className="block">{formatLocal(Date.parse(`${d}T12:00:00+05:30`), { day: "numeric", month: "short" })}</span>
          </Link>
        ))}
      </nav>
      {slots.length === 0 ? (
        <p className="mt-3 text-sm text-muted">No times on this date. {date < end ? <Link href={withQuery(base, { o: chosen.offeringId, d: addDays(date, 1) })} className="underline">Try the next day</Link> : null}</p>
      ) : (
        <ul className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5" aria-label={`Available times on ${date}`}>
          {slots.map((s) => (
            <li key={s.startsAt}>
              <Link
                href={withQuery(base, { o: chosen.offeringId, d: date, t: s.startsAt })}
                aria-current={s.startsAt === startsAt ? "true" : undefined}
                className={`block rounded-[var(--r-ctl)] border px-2 py-2 text-center text-sm ${s.startsAt === startsAt ? "border-brand bg-brand-soft font-medium" : "border-line hover:bg-surface-2"}`}
              >
                {s.localTime}
              </Link>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-xs text-muted">Availability updates as others book. Your time is held for five minutes once you continue.</p>
    </section>
  );
}

async function WhoFor({ canonical, base, offeringId, date, startsAt }: { canonical: string; base: string; offeringId: string; date: string; startsAt: string }) {
  const viewer = await getViewer();
  const here = withQuery(base, { o: offeringId, d: date, t: startsAt });
  if (!viewer) {
    return (
      <section className="card mt-4 p-5">
        <h2 className="text-lg font-semibold">3. Sign in to continue</h2>
        <p className="mt-2 text-sm text-muted">We confirm appointments to a verified mobile number.</p>
        <Link href={`/sign-in?next=${encodeURIComponent(here)}`} className="btn btn-primary mt-4">Sign in with mobile OTP</Link>
      </section>
    );
  }
  const patients = await listBookablePatients(viewer.userId);
  const hasSelf = patients.some((p) => p.relationship === "self");
  const when = Number.isNaN(Date.parse(startsAt)) ? null : formatLocal(Date.parse(startsAt));
  return (
    <section className="card mt-4 p-5" aria-labelledby="step-who">
      <h2 id="step-who" className="text-lg font-semibold">3. Who is the appointment for?</h2>
      {when ? <p className="mt-1 text-sm text-muted">{when} IST</p> : null}
      <form action={holdAction} className="mt-4 grid gap-4">
        <input type="hidden" name="slug" value={canonical} />
        <input type="hidden" name="offeringId" value={offeringId} />
        <input type="hidden" name="startsAt" value={startsAt} />
        <input type="hidden" name="date" value={date} />
        <input type="hidden" name="idempotencyKey" value={randomUUID()} />
        <fieldset className="grid gap-2">
          <legend className="sr-only">Patient</legend>
          {!hasSelf ? (
            <label className="flex items-center gap-2 text-sm"><input type="radio" name="patient" value="self" defaultChecked /> Myself{viewer.name ? ` (${viewer.name})` : ""}</label>
          ) : null}
          {patients.map((p, i) => (
            <label key={p.id} className="flex items-center gap-2 text-sm">
              <input type="radio" name="patient" value={p.id} defaultChecked={hasSelf && i === 0} /> {p.displayName}{p.relationship === "self" ? " (me)" : ` (${p.relationship})`}
            </label>
          ))}
          <label className="flex items-center gap-2 text-sm"><input type="radio" name="patient" value="other" /> Another adult</label>
          <div className="ml-6 grid gap-2 sm:grid-cols-2">
            <div><label className="label" htmlFor="otherName">Their name</label><input id="otherName" name="otherName" className="input" maxLength={80} /></div>
            <div><label className="label" htmlFor="otherRelationship">Relationship</label><input id="otherRelationship" name="otherRelationship" className="input" maxLength={40} placeholder="e.g. parent, spouse" /></div>
            <label className="flex items-start gap-2 text-xs text-muted sm:col-span-2">
              <input type="checkbox" name="otherAuthority" className="mt-0.5" /> I confirm this adult has authorised me to book for them. Booking for children is not available yet.
            </label>
          </div>
        </fieldset>
        <div>
          <label className="label" htmlFor="offerCode">Offer code (optional)</label>
          <input id="offerCode" name="offerCode" className="input max-w-xs uppercase" maxLength={40} autoComplete="off" />
          <p className="mt-1 text-xs text-muted">Eligible automatic offers are applied for you; only one offer can apply.</p>
        </div>
        <div><button type="submit" className="btn btn-primary">Hold this time and review</button></div>
      </form>
    </section>
  );
}
