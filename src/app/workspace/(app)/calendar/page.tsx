import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { Empty, Field, Notice, PageHeader, Section, StatePill } from "@/components/workspace/forms/ui";
import { countAffectedBookings, formatIst, istToUtc, WEEKDAYS, WORKSPACE_TZ } from "@/lib/workspace/calendar";
import { requireWorkspace } from "@/lib/workspace/context";
import { readMessage } from "@/lib/workspace/forms";
import { getCalendar, listAssociations, type ExceptionRow, type RuleRow } from "@/lib/workspace/queries";
import { addExceptionAction, addRuleAction, removeExceptionAction, removeRuleAction } from "./actions";

export const metadata: Metadata = { title: "Calendar" };

export default function Page({ searchParams }: PageProps<"/workspace/calendar">) {
  return (
    <Suspense fallback={<p className="text-muted">Loading…</p>}>
      <Calendar searchParams={searchParams} />
    </Suspense>
  );
}

const PAGE = "/workspace/calendar";
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function todayIst(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: WORKSPACE_TZ });
}
function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function weekdayOf(iso: string): number {
  return new Date(`${iso}T00:00:00Z`).getUTCDay();
}

async function Calendar({ searchParams }: { searchParams: PageProps<"/workspace/calendar">["searchParams"] }) {
  await connection();
  const sp = await searchParams;
  const { practitioner: p } = await requireWorkspace(PAGE);
  const [cal, associations] = await Promise.all([getCalendar(p.id), listAssociations(p.id)]);
  const branches = associations.filter((a) => a.state === "approved" || a.state === "pending").map((a) => ({ id: a.branchId, label: `${a.clinicName}${a.branchName !== a.clinicName ? ` — ${a.branchName}` : ""}` }));
  const msg = readMessage(sp);
  const today = todayIst();
  const weekStart = typeof sp.week === "string" && DATE.test(sp.week) ? sp.week : addDays(today, -weekdayOf(today));
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  // CAL-09 preview: confirmed bookings inside a prospective leave period, requested with ?previewFrom=&previewTo=.
  const pf = typeof sp.previewFrom === "string" && DATE.test(sp.previewFrom) ? sp.previewFrom : null;
  const pt = typeof sp.previewTo === "string" && DATE.test(sp.previewTo) ? sp.previewTo : pf;
  const preview = pf && pt ? await countAffectedBookings(p.id, istToUtc(pf, "00:00"), new Date(istToUtc(pt, "00:00").getTime() + 86_400_000)) : null;

  if (!cal) {
    return <div className="mx-auto max-w-4xl"><PageHeader title="Calendar" /><Section title="Calendar not initialised"><Empty>Your calendar resource is missing. Contact support.</Empty></Section></div>;
  }

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Calendar" lede={`All times are ${WORKSPACE_TZ} (IST). Schedule version ${cal.scheduleVersion}. Public calendars show bookable slots only, never blocks or reasons (CAL-10).`} />
      <Notice ok={msg.ok} error={msg.error} />

      <Section
        title={`Week of ${formatIst(new Date(`${weekStart}T00:00:00+05:30`), { day: "numeric", month: "short", year: "numeric" })}`}
        lede="Recurring windows and exceptions for each day. Precedence: suspension; leave and blocks; existing reservations; date overrides; recurring windows (CAL-06)."
        aside={
          <div className="flex gap-2 text-sm">
            <Link href={`${PAGE}?week=${addDays(weekStart, -7)}`} className="btn btn-quiet py-1 text-xs">Previous</Link>
            <Link href={PAGE} className="btn btn-quiet py-1 text-xs">This week</Link>
            <Link href={`${PAGE}?week=${addDays(weekStart, 7)}`} className="btn btn-quiet py-1 text-xs">Next</Link>
          </div>
        }
      >
        <ol className="grid gap-2 text-sm md:grid-cols-7">
          {days.map((d) => (
            <li key={d} className={`rounded-[var(--r-sm)] border p-2 ${d === today ? "border-brand bg-brand-soft/40" : "border-line"}`}>
              <p className="font-medium">{WEEKDAYS[weekdayOf(d)].slice(0, 3)} <span className="text-muted">{d.slice(8)}/{d.slice(5, 7)}</span></p>
              <DayCell date={d} rules={cal.rules} exceptions={cal.exceptions} />
            </li>
          ))}
        </ol>
        <p className="mt-2 text-xs text-muted">Agenda and day views arrive with the booking engine; this list is the accessible alternative (CAL-10).</p>
      </Section>

      <Section id="weekly" title="Weekly hours" lede="Recurring windows per clinic with effective dates (CAL-05). Clinic opening hours are not your availability (LOC-03).">
        {cal.rules.length === 0 ? <Empty>No weekly hours yet. Without them, no slots are published.</Empty> : (
          <table className="w-full text-sm">
            <caption className="sr-only">Weekly availability windows</caption>
            <thead><tr className="text-left text-muted"><th className="py-1 font-normal">Day</th><th className="py-1 font-normal">Window</th><th className="py-1 font-normal">Clinic</th><th className="py-1 font-normal">Effective</th><th className="sr-only">Actions</th></tr></thead>
            <tbody>
              {cal.rules.map((r) => (
                <tr key={r.id} className="border-t border-line">
                  <td className="py-2">{WEEKDAYS[r.weekday]}</td>
                  <td className="py-2">{r.localStart}–{r.localEnd}</td>
                  <td className="py-2 text-muted">{r.branchName}</td>
                  <td className="py-2 text-muted">{r.effectiveFrom}{r.effectiveTo ? ` → ${r.effectiveTo}` : " → open"}</td>
                  <td className="py-2 text-right">
                    <form action={removeRuleAction}><input type="hidden" name="ruleId" value={r.id} /><button type="submit" className="underline">End today</button></form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {branches.length === 0 ? <p className="mt-3 text-sm text-muted">Add a clinic before setting hours. <Link href="/workspace/clinics" className="underline">Clinics and services</Link>.</p> : (
          <form action={addRuleAction} className="mt-5 grid gap-4 sm:grid-cols-2">
            <Field label="Clinic" htmlFor="rule-branch">
              <select id="rule-branch" name="branchId" className="input" required defaultValue={branches.length === 1 ? branches[0].id : ""}>
                {branches.length > 1 ? <option value="">Select…</option> : null}
                {branches.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
              </select>
            </Field>
            <div>
              <p className="label">Weekdays</p>
              <div className="flex flex-wrap gap-2 text-sm">
                {WEEKDAYS.map((w, i) => (
                  <label key={w} className="flex items-center gap-1"><input type="checkbox" name="weekdays" value={i} defaultChecked={i >= 1 && i <= 5} /> {w.slice(0, 3)}</label>
                ))}
              </div>
            </div>
            <Field label="Start (IST)" htmlFor="rule-start"><input id="rule-start" name="localStart" type="time" className="input" required defaultValue="09:00" /></Field>
            <Field label="End (IST)" htmlFor="rule-end"><input id="rule-end" name="localEnd" type="time" className="input" required defaultValue="13:00" /></Field>
            <Field label="Effective from" htmlFor="rule-from"><input id="rule-from" name="effectiveFrom" type="date" className="input" defaultValue={today} /></Field>
            <Field label="Effective to (optional)" htmlFor="rule-to"><input id="rule-to" name="effectiveTo" type="date" className="input" /></Field>
            <div className="sm:col-span-2"><button type="submit" className="btn btn-secondary py-2 text-sm">Add weekly hours</button></div>
          </form>
        )}
      </Section>

      <Section id="exceptions" title="Leave, blocks and date overrides" lede="Leave and blocks remove availability; a date override replaces that day’s recurring hours, and an override with no windows means closed (CAL-06, PRO-15).">
        {cal.exceptions.length === 0 ? <Empty>No upcoming exceptions.</Empty> : (
          <ul className="divide-y divide-line border-y border-line text-sm">
            {cal.exceptions.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
                <div>
                  <p><StatePill state={e.kind} /> <span className="ml-1">{e.kind === "date_override" ? e.localDate : `${formatIst(e.startsAt)} → ${formatIst(e.endsAt)}`}</span>{e.branchName ? <span className="text-muted"> · {e.branchName}</span> : null}</p>
                  {e.kind === "date_override" ? <p className="text-muted">{e.replacementWindows?.length ? e.replacementWindows.map((w) => `${w.start}–${w.end}`).join(", ") : "Closed all day"}</p> : null}
                  {e.internalReason ? <p className="text-muted">Internal note: {e.internalReason}</p> : null}
                </div>
                {e.kind !== "external_busy" ? <form action={removeExceptionAction}><input type="hidden" name="exceptionId" value={e.id} /><button type="submit" className="underline">Remove</button></form> : null}
              </li>
            ))}
          </ul>
        )}

        <form method="get" action={PAGE} className="mt-5 grid gap-3 rounded-[var(--r-sm)] border border-line p-3 text-sm sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <Field label="Preview: confirmed appointments between" htmlFor="pf"><input id="pf" name="previewFrom" type="date" className="input" defaultValue={pf ?? ""} required /></Field>
          <Field label="and" htmlFor="pt"><input id="pt" name="previewTo" type="date" className="input" defaultValue={pt ?? ""} /></Field>
          <button type="submit" className="btn btn-quiet py-2 text-sm">Check</button>
          {preview !== null ? <p className="sm:col-span-3">{preview === 0 ? "No confirmed appointments in that period." : `${preview} confirmed appointment(s) in that period would need resolving (CAL-09).`}</p> : null}
        </form>

        <form action={addExceptionAction} className="mt-5 grid gap-4 sm:grid-cols-2">
          <Field label="Type" htmlFor="ex-kind">
            <select id="ex-kind" name="kind" className="input" defaultValue="leave">
              <option value="leave">Leave (whole days, all clinics)</option>
              <option value="manual_block">Manual block (times)</option>
              <option value="date_override">Date override (replace one day’s hours)</option>
            </select>
          </Field>
          <Field label="Clinic (blocks only; blank = all)" htmlFor="ex-branch">
            <select id="ex-branch" name="branchId" className="input" defaultValue="">
              <option value="">All clinics</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
            </select>
          </Field>
          <Field label="Start date" htmlFor="ex-start"><input id="ex-start" name="startDate" type="date" className="input" required defaultValue={pf ?? ""} /></Field>
          <Field label="End date (leave; blank = same day)" htmlFor="ex-end"><input id="ex-end" name="endDate" type="date" className="input" defaultValue={pt ?? ""} /></Field>
          <Field label="Start time (blocks)" htmlFor="ex-st"><input id="ex-st" name="startTime" type="time" className="input" /></Field>
          <Field label="End time (blocks)" htmlFor="ex-et"><input id="ex-et" name="endTime" type="time" className="input" /></Field>
          <div className="sm:col-span-2">
            <Field label="Internal reason (never shown to patients)" htmlFor="ex-reason"><input id="ex-reason" name="reason" className="input" maxLength={200} /></Field>
          </div>
          <fieldset className="grid gap-2 sm:col-span-2">
            <legend className="label">Replacement windows for a date override (leave empty for closed)</legend>
            {[0, 1].map((i) => (
              <div key={i} className="grid gap-2 sm:grid-cols-3">
                <select name={`w${i}Branch`} className="input" defaultValue={branches[0]?.id ?? ""} aria-label={`Window ${i + 1} clinic`}>
                  {branches.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
                </select>
                <input name={`w${i}Start`} type="time" className="input" aria-label={`Window ${i + 1} start`} />
                <input name={`w${i}End`} type="time" className="input" aria-label={`Window ${i + 1} end`} />
              </div>
            ))}
          </fieldset>
          <div className="sm:col-span-2"><button type="submit" className="btn btn-secondary py-2 text-sm">Save exception</button></div>
        </form>
      </Section>
    </div>
  );
}

function DayCell({ date, rules, exceptions }: { date: string; rules: RuleRow[]; exceptions: ExceptionRow[] }) {
  const wd = weekdayOf(date);
  const dayStart = istToUtc(date, "00:00").getTime();
  const dayEnd = dayStart + 86_400_000;
  const ex = exceptions.filter((e) => new Date(e.startsAt).getTime() < dayEnd && new Date(e.endsAt).getTime() > dayStart);
  const override = ex.find((e) => e.kind === "date_override" && e.localDate === date);
  const leave = ex.filter((e) => e.kind === "leave");
  const blocks = ex.filter((e) => e.kind === "manual_block" || e.kind === "external_busy");
  const todays = rules.filter((r) => r.weekday === wd && r.effectiveFrom <= date && (!r.effectiveTo || r.effectiveTo >= date));
  return (
    <ul className="mt-1 grid gap-1 text-xs">
      {leave.length ? <li className="rounded bg-alert-soft px-1.5 py-0.5">On leave</li> : null}
      {override ? (
        override.replacementWindows?.length ? override.replacementWindows.map((w, i) => <li key={i} className="rounded bg-mark-soft px-1.5 py-0.5">{w.start}–{w.end} (override)</li>) : <li className="rounded bg-mark-soft px-1.5 py-0.5">Closed (override)</li>
      ) : todays.length ? (
        todays.map((r) => <li key={r.id} className="rounded bg-brand-soft px-1.5 py-0.5">{r.localStart}–{r.localEnd} <span className="text-muted">{r.branchName}</span></li>)
      ) : !leave.length ? <li className="text-muted">No hours</li> : null}
      {blocks.map((b) => <li key={b.id} className="rounded bg-surface-2 px-1.5 py-0.5">Blocked {formatIst(b.startsAt, { hour: "2-digit", minute: "2-digit" })}–{formatIst(b.endsAt, { hour: "2-digit", minute: "2-digit" })}</li>)}
    </ul>
  );
}
