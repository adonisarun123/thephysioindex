import { sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { ApiError } from "@/lib/api";
import { audit } from "@/lib/audit";

/**
 * Practitioner enquiry inbox (addendum ENQ-01..04). Enquiries come from the
 * public "enquire" form on profiles that cannot be booked online (home visits,
 * online sessions, unverified jurisdictions). The patient consented to their
 * details being passed to the practice, so the practitioner sees name, mobile
 * and message; follow-up notes stay private to the practice.
 */

export const OUTCOMES = [
  { key: "booked", label: "Booked an appointment" },
  { key: "not_interested", label: "Not interested" },
  { key: "no_response", label: "Could not reach" },
  { key: "other", label: "Other" },
] as const;
export type Outcome = (typeof OUTCOMES)[number]["key"];

export type InboxEnquiry = {
  id: string;
  requesterName: string;
  requesterMobile: string;
  message: string | null;
  status: "new" | "forwarded" | "contacted" | "closed";
  outcome: Outcome | null;
  followUpOn: string | null;
  practitionerNote: string | null;
  contactedAt: Date | null;
  closedAt: Date | null;
  createdAt: Date;
};

export type InboxFilter = "open" | "due" | "closed" | "all";

/** ENQ-01: inbox for one practitioner; "open" = not closed, "due" = follow-up date today or earlier. */
export async function listInbox(practitionerId: string, filter: InboxFilter): Promise<InboxEnquiry[]> {
  const where =
    filter === "open" ? sql`AND e.status <> 'closed'`
    : filter === "due" ? sql`AND e.status <> 'closed' AND e.follow_up_on <= (now() AT TIME ZONE 'Asia/Kolkata')::date`
    : filter === "closed" ? sql`AND e.status = 'closed'`
    : sql``;
  const res = await db().execute<{
    id: string; requester_name: string; requester_mobile: string; message: string | null; status: InboxEnquiry["status"]; outcome: Outcome | null;
    follow_up_on: string | null; practitioner_note: string | null; contacted_at: string | null; closed_at: string | null; created_at: string;
  }>(sql`
    SELECT e.id, e.requester_name, e.requester_mobile, e.message, e.status, e.outcome, e.follow_up_on::text AS follow_up_on, e.practitioner_note,
           e.contacted_at, e.closed_at, e.created_at
    FROM enquiries e
    WHERE e.practitioner_id = ${practitionerId} ${where}
    ORDER BY (e.status IN ('new', 'forwarded')) DESC, e.follow_up_on ASC NULLS LAST, e.created_at DESC
    LIMIT 200`);
  return res.rows.map((r) => ({
    id: r.id, requesterName: r.requester_name, requesterMobile: r.requester_mobile, message: r.message, status: r.status, outcome: r.outcome,
    followUpOn: r.follow_up_on, practitionerNote: r.practitioner_note, contactedAt: r.contacted_at ? new Date(r.contacted_at) : null,
    closedAt: r.closed_at ? new Date(r.closed_at) : null, createdAt: new Date(r.created_at),
  }));
}

/** ENQ-03: counts for the nav badge and overview: unanswered and follow-ups due. */
export async function inboxCounts(practitionerId: string): Promise<{ unanswered: number; due: number }> {
  const res = await db().execute<{ unanswered: number; due: number }>(sql`
    SELECT count(*) FILTER (WHERE status IN ('new', 'forwarded'))::int AS unanswered,
           count(*) FILTER (WHERE status <> 'closed' AND follow_up_on <= (now() AT TIME ZONE 'Asia/Kolkata')::date)::int AS due
    FROM enquiries WHERE practitioner_id = ${practitionerId}`);
  return res.rows[0] ?? { unanswered: 0, due: 0 };
}

export const FollowUpSchema = z.object({
  enquiryId: z.uuid(),
  action: z.enum(["contacted", "follow_up", "close", "reopen"]),
  followUpOn: z.iso.date().optional(),
  note: z.string().trim().max(1000).optional(),
  outcome: z.enum(OUTCOMES.map((o) => o.key) as [Outcome, ...Outcome[]]).optional(),
});
export type FollowUpInput = z.infer<typeof FollowUpSchema>;

/** ENQ-02: record contact, schedule a follow-up, close with an outcome, or reopen. Scoped to the practitioner (IAM-01). */
export async function updateEnquiry(practitionerId: string, actorUserId: string, input: FollowUpInput): Promise<void> {
  const note = input.note === undefined ? sql`practitioner_note` : sql`${input.note || null}`;
  let set;
  switch (input.action) {
    case "contacted":
      set = sql`status = 'contacted', contacted_at = coalesce(contacted_at, now()), follow_up_on = ${input.followUpOn ?? null}::date, practitioner_note = ${note}`;
      break;
    case "follow_up":
      if (!input.followUpOn) throw new ApiError("INVALID_INPUT", "Choose a follow-up date");
      set = sql`follow_up_on = ${input.followUpOn}::date, practitioner_note = ${note}`;
      break;
    case "close":
      if (!input.outcome) throw new ApiError("INVALID_INPUT", "Choose how it ended");
      set = sql`status = 'closed', closed_at = now(), outcome = ${input.outcome}, follow_up_on = NULL, practitioner_note = ${note}`;
      break;
    case "reopen":
      set = sql`status = 'contacted', closed_at = NULL, outcome = NULL`;
      break;
  }
  const res = await db().execute(sql`UPDATE enquiries SET ${set}, updated_at = now() WHERE id = ${input.enquiryId} AND practitioner_id = ${practitionerId}`);
  if (res.rowCount === 0) throw new ApiError("NOT_FOUND", "Enquiry not found");
  await audit({ actorUserId, action: `enquiry.${input.action}`, objectType: "enquiry", objectId: input.enquiryId, changedFields: { outcome: input.outcome ?? null, followUpOn: input.followUpOn ?? null } });
}

/** wa.me needs the number without "+"; the greeting names the practice so the patient recognises the chat. */
export function whatsappChatUrl(mobileE164: string, text: string): string {
  return `https://wa.me/${mobileE164.replace(/[^\d]/g, "")}?text=${encodeURIComponent(text)}`;
}

/** First name only for notifications (ENQ-04: no mobile numbers in SMS/WhatsApp/email bodies). */
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0]?.slice(0, 40) || "a patient";
}
