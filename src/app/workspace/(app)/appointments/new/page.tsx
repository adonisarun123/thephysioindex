import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { sql } from "drizzle-orm";
import { BackLink, Field, Notice, PageHeader, Section } from "@/components/workspace/forms/ui";
import { db } from "@/db/client";
import { todayLocal } from "@/lib/booking/time";
import { requireWorkspace } from "@/lib/workspace/context";
import { readMessage } from "@/lib/workspace/forms";
import { manualBookingAction } from "../actions";

export const metadata: Metadata = { title: "Add appointment" };

export default function Page({ searchParams }: PageProps<"/workspace/appointments/new">) {
  return (
    <Suspense fallback={<p className="text-muted">Loading…</p>}>
      <NewAppointment searchParams={searchParams} />
    </Suspense>
  );
}

/** Walk-in or phone booking (PRO-13). The calendar lock and exclusion constraint apply exactly as for online bookings (BKG-07). */
async function NewAppointment({ searchParams }: { searchParams: PageProps<"/workspace/appointments/new">["searchParams"] }) {
  await connection();
  const sp = await searchParams;
  const { practitioner: p } = await requireWorkspace("/workspace/appointments/new");
  const msg = readMessage(sp);
  const offerings = await db().execute<{ id: string; display_name: string; branch_name: string; duration_min: number }>(sql`
    SELECT o.id, o.display_name, b.name AS branch_name, ov.duration_min
    FROM offerings o JOIN offering_versions ov ON ov.id = o.current_version_id JOIN branches b ON b.id = o.branch_id
    JOIN practitioner_branches pb ON pb.id = o.practitioner_branch_id
    WHERE o.practitioner_id = ${p.id} AND o.active AND pb.state = 'approved' AND pb.active_to IS NULL
    ORDER BY b.name, o.display_name`);
  return (
    <div className="mx-auto max-w-2xl">
      <BackLink href="/workspace/appointments">Back to appointments</BackLink>
      <div className="mt-2"><PageHeader title="Add an appointment" lede="For patients who walk in or call. Overlaps with other appointments, holds and buffers are refused, at every clinic you work at." /></div>
      <Notice error={msg.error} />
      <Section title="Appointment">
        {offerings.rows.length === 0 ? <p className="text-sm text-muted">Add an active service first.</p> : (
          <form action={manualBookingAction} className="grid gap-4">
            <input type="hidden" name="idempotencyKey" value={randomUUID()} />
            <Field label="Service and clinic" htmlFor="offeringId">
              <select id="offeringId" name="offeringId" className="input" required>
                {offerings.rows.map((o) => <option key={o.id} value={o.id}>{o.display_name} · {o.branch_name} ({o.duration_min} min)</option>)}
              </select>
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Date" htmlFor="date"><input id="date" name="date" type="date" className="input" required defaultValue={todayLocal()} /></Field>
              <Field label="Start time (IST)" htmlFor="time"><input id="time" name="time" type="time" className="input" required step={300} /></Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Patient name" htmlFor="patientName"><input id="patientName" name="patientName" className="input" required minLength={2} maxLength={80} /></Field>
              <Field label="Mobile (optional)" htmlFor="patientMobile" hint="Used to avoid duplicate patient records and, for phone bookings, to send the confirmation."><input id="patientMobile" name="patientMobile" className="input" inputMode="tel" /></Field>
            </div>
            <fieldset className="flex gap-4 text-sm">
              <legend className="label">Source</legend>
              <label className="flex items-center gap-2"><input type="radio" name="source" value="walk_in" defaultChecked /> Walk-in</label>
              <label className="flex items-center gap-2"><input type="radio" name="source" value="phone" /> Phone</label>
            </fieldset>
            <div><button type="submit" className="btn btn-primary">Add appointment</button></div>
          </form>
        )}
      </Section>
    </div>
  );
}
