import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { Empty, Notice, PageHeader, Section, StatePill } from "@/components/workspace/forms/ui";
import { inboxCounts, listInbox, OUTCOMES, whatsappChatUrl, type InboxFilter } from "@/lib/practice/enquiries";
import { nowMs } from "@/lib/booking/time";
import { istToday } from "@/lib/practice/exercise-plans";
import { formatIst } from "@/lib/workspace/calendar";
import { requireWorkspace } from "@/lib/workspace/context";
import { readMessage } from "@/lib/workspace/forms";
import { confirmRequestedAction, enquiryAction } from "./actions";

export const metadata: Metadata = { title: "Enquiries" };

export default function Page({ searchParams }: PageProps<"/workspace/enquiries">) {
  return (
    <Suspense fallback={<p className="text-muted">Loading…</p>}>
      <Inbox searchParams={searchParams} />
    </Suspense>
  );
}

const FILTERS: { key: InboxFilter; label: string }[] = [
  { key: "open", label: "Open" },
  { key: "due", label: "Follow-ups due" },
  { key: "closed", label: "Closed" },
  { key: "all", label: "All" },
];
const OUTCOME_LABEL = Object.fromEntries(OUTCOMES.map((o) => [o.key, o.label]));
const STATUS_LABEL: Record<string, string> = { new: "new", forwarded: "new", contacted: "contacted", closed: "closed" };

function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** ENQ-01..03: enquiry inbox with call / WhatsApp, follow-up dates and outcomes. */
async function Inbox({ searchParams }: { searchParams: PageProps<"/workspace/enquiries">["searchParams"] }) {
  await connection();
  const sp = await searchParams;
  const show = (FILTERS.find((f) => f.key === sp.show)?.key ?? "open") as InboxFilter;
  const { practitioner: p } = await requireWorkspace("/workspace/enquiries");
  const [rows, counts] = await Promise.all([listInbox(p.id, show), inboxCounts(p.id)]);
  const msg = readMessage(sp);
  const today = istToday();
  const now = nowMs();

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Enquiries" lede="Patients who asked to be contacted from your profile. Call or WhatsApp them, set a follow-up date, and close each one with how it ended. Only you see your notes." />
      <Notice ok={msg.ok} error={msg.error} />

      <nav aria-label="Filter" className="mt-5 flex flex-wrap gap-2 text-sm">
        {FILTERS.map((f) => (
          <Link key={f.key} href={`/workspace/enquiries?show=${f.key}`} aria-current={show === f.key ? "page" : undefined}
            className={`pill ${show === f.key ? "bg-brand-soft font-semibold text-brand-ink" : "bg-surface-2 text-ink-2"}`}>
            {f.label}{f.key === "open" && counts.unanswered ? ` · ${counts.unanswered} new` : ""}{f.key === "due" && counts.due ? ` · ${counts.due}` : ""}
          </Link>
        ))}
      </nav>

      <Section title={FILTERS.find((f) => f.key === show)!.label}>
        {rows.length === 0 ? (
          <Empty>{show === "due" ? "No follow-ups due today." : show === "closed" ? "No closed enquiries yet." : "No enquiries yet. They appear here when a patient uses “Enquire” on your profile."}</Empty>
        ) : (
          <ul className="grid gap-4">
            {rows.map((e) => {
              const overdue = e.status !== "closed" && e.followUpOn !== null && e.followUpOn <= today;
              const requestedLabel = e.requested ? formatIst(e.requested.startsAt, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : null;
              const canConfirm = e.requested !== null && e.status !== "closed" && e.requested.startsAt.getTime() > now;
              const greeting = requestedLabel
                ? `Hello ${e.requesterName.split(/\s+/)[0]}, this is ${p.displayName}. You requested ${requestedLabel} on The Physio Index.`
                : `Hello ${e.requesterName.split(/\s+/)[0]}, this is ${p.displayName}. You enquired on The Physio Index — how can I help?`;
              return (
                <li key={e.id} className={`rounded-[var(--r-sm)] border p-4 text-sm ${overdue ? "border-mark bg-mark-soft" : "border-line"}`}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">{e.requesterName} <span className="text-muted">· {e.requesterMobile}</span></p>
                      <p className="text-xs text-muted">
                        Received {formatIst(e.createdAt)}
                        {e.contactedAt ? ` · contacted ${formatIst(e.contactedAt, { day: "numeric", month: "short" })}` : ""}
                        {e.followUpOn && e.status !== "closed" ? ` · follow up ${e.followUpOn === today ? "today" : e.followUpOn}${overdue && e.followUpOn !== today ? " (overdue)" : ""}` : ""}
                        {e.outcome ? ` · ${OUTCOME_LABEL[e.outcome]}` : ""}
                      </p>
                    </div>
                    <StatePill state={STATUS_LABEL[e.status] ?? e.status} />
                  </div>
                  {e.message ? <p className="mt-2 whitespace-pre-line">{e.message}</p> : <p className="mt-2 text-muted">No message.</p>}
                  {e.bookingId ? <p className="mt-2"><Link href={`/workspace/appointments/${e.bookingId}`} className="underline">View the appointment</Link></p> : null}
                  {canConfirm && e.requested ? (
                    <form action={confirmRequestedAction} className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-[var(--r-sm)] border border-brand bg-brand-soft p-3">
                      <input type="hidden" name="enquiryId" value={e.id} />
                      <input type="hidden" name="show" value={show} />
                      <p><span className="font-medium">Requested: {requestedLabel}</span><span className="block text-muted">{e.requested.offeringName}, {e.requested.durationMin} min. Confirming adds it to your calendar and blocks the time.</span></p>
                      <button type="submit" className="btn btn-primary py-1.5 text-sm">Confirm appointment</button>
                    </form>
                  ) : e.requested && e.status !== "closed" ? (
                    <p className="mt-2 text-muted">Requested {requestedLabel}, which has passed. Agree a new time and <Link href="/workspace/appointments/new" className="underline">add the appointment</Link>.</p>
                  ) : null}

                  {e.status !== "closed" ? (
                    <>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <a href={`tel:${e.requesterMobile}`} className="btn btn-secondary py-1.5 text-sm">Call</a>
                        <a href={whatsappChatUrl(e.requesterMobile, greeting)} target="_blank" rel="noopener noreferrer" className="btn btn-primary py-1.5 text-sm">WhatsApp</a>
                      </div>
                      <form action={enquiryAction} className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
                        <input type="hidden" name="enquiryId" value={e.id} />
                        <input type="hidden" name="show" value={show} />
                        <label className="text-xs text-muted">Private note
                          <input name="note" className="input mt-0.5" maxLength={1000} defaultValue={e.practitionerNote ?? ""} placeholder="e.g. Wants home visits after 6 pm, call back Monday" />
                        </label>
                        <label className="text-xs text-muted">Follow up on
                          <input name="followUpOn" type="date" className="input mt-0.5" min={today} defaultValue={e.followUpOn ?? addDays(today, 2)} />
                        </label>
                        <div className="flex flex-wrap gap-2 sm:col-span-2">
                          {e.status !== "contacted" ? <button type="submit" name="action" value="contacted" className="btn btn-secondary py-1 text-xs">I contacted them</button> : null}
                          <button type="submit" name="action" value="follow_up" className="btn btn-quiet py-1 text-xs">Save note and follow-up date</button>
                          <span className="ml-auto flex items-center gap-2">
                            <select name="outcome" className="input py-1 text-xs" style={{ width: "auto" }} defaultValue="" aria-label="Outcome">
                              <option value="">Close as…</option>
                              {OUTCOMES.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
                            </select>
                            <button type="submit" name="action" value="close" className="btn btn-quiet py-1 text-xs">Close</button>
                          </span>
                        </div>
                      </form>
                    </>
                  ) : (
                    <form action={enquiryAction} className="mt-3 flex flex-wrap items-center gap-2">
                      <input type="hidden" name="enquiryId" value={e.id} />
                      <input type="hidden" name="show" value={show} />
                      {e.practitionerNote ? <p className="text-muted">Note: {e.practitionerNote}</p> : null}
                      <button type="submit" name="action" value="reopen" className="btn btn-quiet py-1 text-xs">Reopen</button>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Section>
    </div>
  );
}
