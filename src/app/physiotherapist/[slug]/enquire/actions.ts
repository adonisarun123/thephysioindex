"use server";

import { sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { ApiError } from "@/lib/api";
import { audit } from "@/lib/audit";
import { getViewer } from "@/lib/auth/session";
import { resolvePractitionerSlug } from "@/lib/directory";
import { normaliseIndianMobile } from "@/lib/messaging/sms";
import { done, failTo, opt, plainText, str } from "@/lib/workspace/forms";

const Enquiry = z.object({
  name: z.string().trim().min(2, "Enter your name").max(80),
  mobile: z.string().trim().min(10, "Enter your mobile number").max(20),
  message: z.string().trim().max(1000).optional(),
  consent: z.literal(true, { error: "Confirm that we may pass your details to the clinic" }),
});

const DAILY_LIMIT = 3;

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
    const ins = await db().execute<{ id: string }>(sql`
      INSERT INTO enquiries (practitioner_id, requester_user_id, requester_name, requester_mobile, message, status)
      VALUES (${p.id}, ${viewer?.userId ?? null}, ${input.name}, ${mobile}, ${input.message ? plainText(input.message, 1000) : null}, 'new') RETURNING id`);
    await audit({ actorUserId: viewer?.userId ?? null, action: "enquiry.create", objectType: "enquiry", objectId: ins.rows[0].id, changedFields: { practitionerId: p.id } });
    done(back, { ok: "sent" });
  } catch (err) {
    failTo(back, err);
  }
}
