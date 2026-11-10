import { sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { ApiError } from "@/lib/api";
import { audit } from "@/lib/audit";
import { normaliseIndianMobile } from "@/lib/messaging/sms";
import { PRACTICE_TYPES } from "@/lib/practitioner-signups";
import { newPublicId } from "@/lib/public-id";
import { plainText } from "@/lib/workspace/forms";

/**
 * Quick lead capture on the paid landing page (owner decision 10 Nov 2026).
 *
 * Ad visitors who stop before the full registration (registration number,
 * address, email code) used to leave nothing behind. This saves name, WhatsApp
 * number, city and practice type as a `practitioner_signups` row with status
 * `new`, so operations can call them. Nothing is public and no account is
 * created; the full registration later updates this same row (see
 * `attachLeadToRegistration`).
 */

export const LeadSchema = z.object({
  fullName: z.string().trim().min(2, "Enter your full name").max(120),
  mobile: z.string().trim().min(10, "Enter your WhatsApp number").max(20),
  city: z.string().trim().min(2, "Enter your city").max(80),
  practiceType: z.enum(PRACTICE_TYPES.map((p) => p.value) as [string, ...string[]], { error: "Tell us how you practise" }),
  consentContact: z.literal(true, { error: "Please allow us to contact you" }),
});

export type LeadInput = z.infer<typeof LeadSchema>;

const DAILY_LIMIT_PER_MOBILE = 3;

export async function captureLead(input: LeadInput, attribution: Record<string, string>): Promise<{ reference: string; mobile: string }> {
  const mobile = normaliseIndianMobile(input.mobile);
  if (!mobile) throw new ApiError("INVALID_INPUT", "Enter a valid 10-digit Indian mobile number");

  // Same person submitting twice (back button, double tap): reuse the open lead.
  const open = await db().execute<{ reference: string }>(sql`
    SELECT reference FROM practitioner_signups
    WHERE mobile = ${mobile} AND status IN ('new', 'contacted') AND created_at > now() - interval '30 days'
    ORDER BY created_at DESC LIMIT 1`);
  if (open.rows[0]) return { reference: open.rows[0].reference, mobile };

  const recent = await db().execute<{ n: string | number }>(sql`SELECT count(*) AS n FROM practitioner_signups WHERE mobile = ${mobile} AND created_at > now() - interval '1 day'`);
  if (Number(recent.rows[0]?.n ?? 0) >= DAILY_LIMIT_PER_MOBILE) throw new ApiError("RATE_LIMITED", "Too many sign-ups with this number today. Please try tomorrow or contact us.");

  const reference = newPublicId();
  const ins = await db().execute<{ id: string }>(sql`
    INSERT INTO practitioner_signups (reference, full_name, mobile, city, practice_type, attribution, status)
    VALUES (${reference}, ${plainText(input.fullName, 120)}, ${mobile}, ${plainText(input.city, 80)}, ${input.practiceType}, ${JSON.stringify(attribution)}::jsonb, 'new')
    RETURNING id`);
  await audit({ actorUserId: null, action: "practitioner_signup.lead", objectType: "practitioner_signup", objectId: ins.rows[0].id, changedFields: { source: attribution.utm_source ?? null } });
  return { reference, mobile };
}

/**
 * Called from the full registration: if this browser captured a lead first,
 * complete that row instead of inserting a duplicate. Matches on reference AND
 * mobile so a tampered reference cannot overwrite someone else's lead.
 * Returns the reference when a lead was updated, otherwise null.
 */
export async function attachLeadToRegistration(
  leadRef: string | null | undefined,
  fields: { mobile: string; email: string; fullName: string; city: string; practiceType: string; registrationNumber: string; attribution: Record<string, string> },
): Promise<{ id: string; reference: string } | null> {
  if (!leadRef) return null;
  const r = await db().execute<{ id: string; reference: string }>(sql`
    UPDATE practitioner_signups
    SET email = ${fields.email}, full_name = ${fields.fullName}, city = ${fields.city}, practice_type = ${fields.practiceType},
        registration_number = ${fields.registrationNumber}, attribution = attribution || ${JSON.stringify(fields.attribution)}::jsonb,
        status = 'onboarding', updated_at = now()
    WHERE reference = ${leadRef.slice(0, 40)} AND mobile = ${fields.mobile} AND status IN ('new', 'contacted')
    RETURNING id, reference`);
  return r.rows[0] ?? null;
}
