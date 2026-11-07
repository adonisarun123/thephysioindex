import { sql } from "drizzle-orm";
import { db } from "@/db/client";

/**
 * Links a paid-landing-page sign-up (practitioner_signups) to the account that
 * later signs in with the same email, so the wizard can be pre-filled and the
 * admin queue reflects real progress instead of a hand-set label.
 */

export type SignupPrefill = { reference: string; fullName: string; city: string; practiceType: string; registrationNumber: string | null };

export async function findSignupForEmail(email: string | null): Promise<SignupPrefill | null> {
  if (!email) return null;
  const r = await db().execute<{ reference: string; full_name: string; city: string; practice_type: string; registration_number: string | null }>(sql`
    SELECT reference, full_name, city, practice_type, registration_number
    FROM practitioner_signups
    WHERE email = ${email.toLowerCase()} AND created_at > now() - interval '180 days'
    ORDER BY created_at DESC LIMIT 1`);
  const s = r.rows[0];
  return s ? { reference: s.reference, fullName: s.full_name, city: s.city, practiceType: s.practice_type, registrationNumber: s.registration_number } : null;
}

/** Moves the sign-up forward when its owner reaches a milestone. Never moves it backwards or out of a closed state. */
export async function advanceSignup(email: string | null, to: "onboarding" | "onboarded"): Promise<void> {
  if (!email) return;
  const from = to === "onboarding" ? ["new", "contacted"] : ["new", "contacted", "onboarding"];
  await db().execute(sql`
    UPDATE practitioner_signups SET status = ${to}
    WHERE email = ${email.toLowerCase()} AND status = ANY(${`{${from.join(",")}}`}::text[])`);
}
