"use server";

import { sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { ApiError } from "@/lib/api";
import { audit } from "@/lib/audit";
import { getViewer } from "@/lib/auth/session";
import { formatLocal } from "@/lib/booking/time";
import { resolvePractitionerSlug } from "@/lib/directory";
import { normaliseIndianMobile } from "@/lib/messaging/sms";
import { kickDispatch } from "@/lib/messaging/kick";
import { done, failTo, opt, plainText, str } from "@/lib/workspace/forms";

const Enquiry = z.object({
  name: z.string().trim().min(2, "Enter your name").max(80),
  mobile: z.string().trim().min(10, "Enter your mobile number").max(20),
  message: z.string().trim().max(1000).optional(),
  consent: z.literal(true, { error: "Confirm that we may pass your details to the clinic" }),
});

const DAILY_LIMIT = 3;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REQUEST_HORIZON_MS = 60 * 86_400_000;

/**
 * A time picked on the public calendar becomes the first line of the enquiry
 * (CAL-10). It is a request only: no capacity is reserved and the
 * physiotherapist confirms with the patient directly (Section 2).
 */
async function requestedTimeLine(practitionerId: string, offeringId: string | undefined, startsAt: string | undefined): Promise<string | null> {
  if (!offeringId || !startsAt || !UUID.test(offeringId)) return null;
  const ms = Date.parse(startsAt);
  if (Number.isNaN(ms) || ms < Date.now() || ms > Date.now() + REQUEST_HORIZON_MS) return null;
  const o = await db().execute<{ display_name: string }>(sql`SELECT display_name FROM offerings WHERE id = ${offeringId} AND practitioner_id = ${practitionerId} AND active`);
  if (!o.rows[0]) return null;
  return `Requested time: ${formatLocal(ms)} IST, ${o.rows[0].display_name}`;
}

/** Enquiry for an unbookable profile. It is not a booking and reserves no capacity (Section 2). */
export async function submitEnquiry(formData: FormData) {
  const slug = str(formData, "slug");
  const back = `/physiotherapist/${slug}/enquire`;
  try {
    const input = Enquiry.parse({ name: str(formData, "name"), mobile: str(formData, "mobile"), message: opt(formData, "message"), consent: formData.get("consent") === "on" });
    const mobile = normaliseIndianMobile(input.mobile);
    if (!mobile) throw new ApiError("INVALID_INPUT", "Enter a valid Indian mobile number");
    const resolved = await resolvePractitionerSlug(slug);
    if (!resolved) throw new ApiError("NOT_FOUND", "Profile not found");
    const pr = await db().execute<{ id: string; listing_status: string }>(sql`SELECT id, listing_status::text AS listing_status FROM practitioners WHERE public_id = ${resolved.publicId}`);
    const p = pr.rows[0];
    if (!p || p.listing_status !== "published") throw new ApiError("NOT_FOUND", "Profile not available");
    // Light abuse control: at most three enquiries per mobile per day, counted in the database (SEC-05).
    const recent = await db().execute<{ n: string | number }>(sql`SELECT count(*) AS n FROM enquiries WHERE requester_mobile = ${mobile} AND created_at > now() - interval '1 day'`);
    if (Number(recent.rows[0]?.n ?? 0) >= DAILY_LIMIT) throw new ApiError("RATE_LIMITED", "You have sent several enquiries today. Please try again tomorrow or call the clinic.");
    const viewer = await getViewer();
    const requested = await requestedTimeLine(p.id, opt(formData, "offeringId"), opt(formData, "requestedStart"));
    const message = [requested, input.message ? plainText(input.message, 1000) : null].filter(Boolean).join("\n\n") || null;
    const ins = await db().execute<{ id: string }>(sql`
      INSERT INTO enquiries (practitioner_id, requester_user_id, requester_name, requester_mobile, message, status)
      VALUES (${p.id}, ${viewer?.userId ?? null}, ${input.name}, ${mobile}, ${message}, 'new') RETURNING id`);
    await audit({ actorUserId: viewer?.userId ?? null, action: "enquiry.create", objectType: "enquiry", objectId: ins.rows[0].id, changedFields: { practitionerId: p.id } });
    // ENQ-04: tell the practitioner (email / SMS / WhatsApp per their preferences) through the outbox.
    await db().execute(sql`INSERT INTO outbox_events (aggregate_type, aggregate_id, event_type, payload) VALUES ('enquiry', ${ins.rows[0].id}, 'enquiry.created', ${JSON.stringify({ practitionerId: p.id })}::jsonb)`);
    kickDispatch();
    done(back, { ok: "sent" });
  } catch (err) {
    failTo(back, err);
  }
}
