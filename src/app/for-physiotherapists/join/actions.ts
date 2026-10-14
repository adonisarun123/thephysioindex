"use server";

import { sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db/client";
import { ApiError } from "@/lib/api";
import { audit } from "@/lib/audit";
import { normaliseIndianMobile } from "@/lib/messaging/sms";
import { newPublicId } from "@/lib/public-id";
import { ATTRIBUTION_KEYS, PRACTICE_TYPES } from "@/lib/practitioner-signups";
import { failTo, opt, plainText, str } from "@/lib/workspace/forms";

const Signup = z.object({
  fullName: z.string().trim().min(2, "Enter your full name").max(80),
  mobile: z.string().trim().min(10, "Enter your mobile number").max(20),
  email: z.union([z.literal(""), z.email("Enter a valid email address").max(120)]).optional(),
  city: z.string().trim().min(2, "Enter your city").max(80),
  practiceType: z.enum(PRACTICE_TYPES.map((p) => p.value) as [string, ...string[]], { error: "Tell us how you practise" }),
  registrationNumber: z.string().trim().max(60).optional(),
  consent: z.literal(true, { error: "Please allow us to contact you about your listing" }),
});

const FORM = "/for-physiotherapists/join";
const DAILY_LIMIT = 3;

/**
 * Lead capture for the paid-acquisition landing page. No OTP: nothing is
 * published from this form, operations calls the practitioner and onboarding
 * verifies credentials as usual (VER-03, DIR-14). A repeat sign-up from the
 * same mobile within 30 days reuses the earlier reference.
 */
export async function submitPhysioSignup(formData: FormData) {
  let reference: string;
  try {
    if (str(formData, "website")) throw new ApiError("INVALID_INPUT", "Please try again"); // honeypot
    const input = Signup.parse({
      fullName: str(formData, "fullName"),
      mobile: str(formData, "mobile"),
      email: opt(formData, "email") ?? "",
      city: str(formData, "city"),
      practiceType: str(formData, "practiceType"),
      registrationNumber: opt(formData, "registrationNumber"),
      consent: formData.get("consent") === "on",
    });
    const mobile = normaliseIndianMobile(input.mobile);
    if (!mobile) throw new ApiError("INVALID_INPUT", "Enter a valid 10-digit Indian mobile number");

    const attribution: Record<string, string> = {};
    for (const k of ATTRIBUTION_KEYS) {
      const v = opt(formData, k);
      if (v) attribution[k] = v.slice(0, 200);
    }

    const recent = await db().execute<{ n: string | number }>(sql`SELECT count(*) AS n FROM practitioner_signups WHERE mobile = ${mobile} AND created_at > now() - interval '1 day'`);
    if (Number(recent.rows[0]?.n ?? 0) >= DAILY_LIMIT) throw new ApiError("RATE_LIMITED", "We already have your details. Our team will call you.");

    const existing = await db().execute<{ reference: string }>(sql`SELECT reference FROM practitioner_signups WHERE mobile = ${mobile} AND created_at > now() - interval '30 days' ORDER BY created_at DESC LIMIT 1`);
    if (existing.rows[0]) {
      reference = existing.rows[0].reference;
    } else {
      reference = newPublicId();
      const ins = await db().execute<{ id: string }>(sql`
        INSERT INTO practitioner_signups (reference, full_name, mobile, email, city, practice_type, registration_number, attribution)
        VALUES (${reference}, ${plainText(input.fullName, 80)}, ${mobile}, ${input.email ? input.email.toLowerCase() : null}, ${plainText(input.city, 80)},
          ${input.practiceType}, ${input.registrationNumber ? plainText(input.registrationNumber, 60) : null}, ${JSON.stringify(attribution)}::jsonb)
        RETURNING id`);
      await audit({ actorUserId: null, action: "practitioner_signup.create", objectType: "practitioner_signup", objectId: ins.rows[0].id, changedFields: { source: attribution.utm_source ?? null } });
    }
  } catch (err) {
    failTo(FORM, err);
  }
  redirect(`${FORM}/thank-you?ref=${reference}`);
}
