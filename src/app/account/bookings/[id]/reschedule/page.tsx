import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { Notice } from "@/components/workspace/forms/ui";
import { db } from "@/db/client";
import { requireViewer } from "@/lib/auth/session";
import { getPatientBooking } from "@/lib/booking/queries";
import { computeSlots, loadOfferingContext } from "@/lib/booking/slots";
import { addDays, formatLocal, isLocalDate, localDateOf, todayLocal } from "@/lib/booking/time";
import { formatPaise } from "@/lib/money";
import { readMessage, withQuery } from "@/lib/workspace/forms";
import { rescheduleAction } from "../../actions";

export const metadata: Metadata = { title: "Reschedule", robots: { index: false } };

type Props = PageProps<"/account/bookings/[id]/reschedule">;

export default function Page({ params, searchParams }: Props) {
  return (
    <Suspense fallback={<div className="mx-auto max-w-2xl px-4 py-12 text-muted">Loading…</div>}>
      <Reschedule params={params} searchParams={searchParams} />
    </Suspense>
  );
}

/** Choose a new time for the same service; the old time stays booked until the new one is committed (BKG-03). */
async function Reschedule({ params, searchParams }: { params: Props["params"]; searchParams: Props["searchParams"] }) {
  await connection();
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const viewer = await requireViewer(`/account/bookings/${id}/reschedule`);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const b = await getPatientBooking(viewer.userId, id);
  if (!b || b.status !== "confirmed") notFound();
  const ctx = await loadOfferingContext(db(), b.offeringId);
  if (!ctx) notFound();
  const msg = readMessage(sp);
  const today = todayLocal();
  const date = typeof sp.d === "string" && isLocalDate(sp.d) && sp.d >= today ? sp.d : localDateOf(Date.parse(b.startsAt));
  const startsAt = typeof sp.t === "string" ? sp.t : undefined;
  const newPrice = typeof sp.price === "string" && /^\d+$/.test(sp.price) ? Number(sp.price) : null;
  const slots = (await computeSlots(db(), ctx, date, date)).filter((s) => s.startsAt !== b.startsAt);
  const base = `/account/bookings/${id}/reschedule`;
  const days = Array.from({ length: 14 }, (_, i) => addDays(today, i));

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <p className="text-sm text-muted"><Link href={`/account/bookings/${id}`} className="underline">Back to {b.reference}</Link></p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">Reschedule {b.offeringName}</h1>
      <p className="mt-1 text-sm text-muted">Currently {formatLocal(b.startsAt)} IST with {b.practitionerName}. Your current time stays booked until the new time is confirmed.</p>
      <Notice error={msg.error} />
      <nav aria-label="Choose a date" className="mt-6 flex gap-2 overflow-x-auto pb-2">
        {days.map((d) => (
          <Link key={d} href={withQuery(base, { d })} aria-current={d === date ? "date" : undefined} className={`shrink-0 rounded-[var(--r-ctl)] border px-3 py-2 text-center text-sm ${d === date ? "border-brand bg-brand-soft font-medium" : "border-line"}`}>
            <span className="block">{formatLocal(Date.parse(`${d}T12:00:00+05:30`), { weekday: "short" })}</span>
            <span className="block">{formatLocal(Date.parse(`${d}T12:00:00+05:30`), { day: "numeric", month: "short" })}</span>
          </Link>
        ))}
      </nav>
      {slots.length === 0 ? <p className="mt-3 text-sm text-muted">No times on this date.</p> : (
        <ul className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
          {slots.map((s) => (
            <li key={s.startsAt}>
              <Link href={withQuery(base, { d: date, t: s.startsAt })} aria-current={s.startsAt === startsAt ? "true" : undefined} className={`block rounded-[var(--r-ctl)] border px-2 py-2 text-center text-sm ${s.startsAt === startsAt ? "border-brand bg-brand-soft font-medium" : "border-line hover:bg-surface-2"}`}>{s.localTime}</Link>
            </li>
          ))}
        </ul>
      )}
      {startsAt ? (
        <form action={rescheduleAction} className="card mt-6 grid gap-3 p-5">
          <input type="hidden" name="bookingId" value={b.id} />
          <input type="hidden" name="version" value={b.version} />
          <input type="hidden" name="newStartsAt" value={startsAt} />
          <input type="hidden" name="date" value={date} />
          <input type="hidden" name="idempotencyKey" value={randomUUID()} />
          <p className="text-sm">New time: <span className="font-medium">{formatLocal(startsAt)} IST</span></p>
          {newPrice !== null ? (
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" name="acceptedTotalPaise" value={newPrice} required className="mt-0.5" />
              The fee for the new time is {formatPaise(newPrice, { showPaise: true })} (was {formatPaise(b.totalPaise, { showPaise: true })}). I accept the new fee.
            </label>
          ) : null}
          <div><button type="submit" className="btn btn-primary">Confirm new time</button></div>
        </form>
      ) : null}
    </div>
  );
}
