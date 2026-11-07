"use server";

import { sql } from "drizzle-orm";
import { ZodError } from "zod";
import { db } from "@/db/client";
import { ApiError } from "@/lib/api";
import { getViewer } from "@/lib/auth/session";
import { ATTRIBUTION_KEYS } from "@/lib/practitioner-signups";
import { opt, str } from "@/lib/workspace/forms";
import { RegistrationSchema, registerPractitioner } from "@/lib/workspace/registration";

export type RegisterResult = { error?: string; redirectTo?: string };

const FIELD_LABELS: Record<string, string> = {
  fullName: "Full name", mobile: "Mobile", degree: "Qualification", institution: "College or university", authorityId: "Registered with",
  registrationNumber: "Registration number", practiceMode: "Where you see patients", clinicName: "Clinic name", addressLine1: "Clinic address",
  stateId: "State", cityId: "City", localityId: "Locality", pinCode: "PIN code",
};

/**
 * One-screen registration (PRO-02, PRO-03). Runs after the browser has
 * verified the email with a one-time code, so the caller is a signed-in
 * account. Creates the draft profile and returns where to go next; the
 * thank-you page records the ad conversion. Errors come back as text so the
 * form keeps what the practitioner typed.
 */
export async function registerPhysio(formData: FormData): Promise<RegisterResult> {
  try {
    if (str(formData, "website")) throw new ApiError("INVALID_INPUT", "Please try again"); // honeypot
    const viewer = await getViewer();
    if (!viewer?.email) return { error: "Verify your email with the code first." };
    if (viewer.kind === "staff") return { error: "Staff accounts cannot register a practice. Sign out and use your own email." };

    const owned = await db().execute<{ id: string }>(sql`SELECT id FROM practitioners WHERE owner_user_id = ${viewer.userId} AND listing_status <> 'archived' LIMIT 1`);
    if (owned.rows[0]) return { redirectTo: "/workspace?ok=You+already+have+a+profile" };

    const input = RegistrationSchema.parse({
      fullName: str(formData, "fullName"),
      mobile: str(formData, "mobile"),
      degree: str(formData, "degree") === "__other" ? str(formData, "degreeOther") : str(formData, "degree"),
      institution: str(formData, "institution"),
      authorityId: str(formData, "authorityId"),
      registrationNumber: str(formData, "registrationNumber"),
      practiceMode: str(formData, "practiceMode"),
      clinicName: opt(formData, "clinicName"),
      addressLine1: opt(formData, "addressLine1"),
      stateId: str(formData, "stateId"),
      cityId: str(formData, "cityId"),
      localityId: opt(formData, "localityId"),
      newLocalityName: opt(formData, "newLocalityName"),
      pinCode: str(formData, "pinCode"),
      consentTerms: formData.get("consentTerms") === "on",
      consentContact: formData.get("consentContact") === "on",
    });

    const attribution: Record<string, string> = {};
    for (const k of ATTRIBUTION_KEYS) {
      const v = opt(formData, k);
      if (v) attribution[k] = v.slice(0, 200);
    }

    const { reference } = await registerPractitioner({ userId: viewer.userId, email: viewer.email }, input, attribution);
    return { redirectTo: `/for-physiotherapists/join/thank-you?ref=${reference}` };
  } catch (err) {
    if (err instanceof ZodError) {
      const i = err.issues[0];
      const field = typeof i?.path[0] === "string" ? FIELD_LABELS[i.path[0]] : undefined;
      return { error: `${field ? `${field}: ` : ""}${i?.message ?? "Check the form and try again"}` };
    }
    if (err instanceof ApiError) return { error: err.message };
    console.error("registerPhysio failed", err);
    return { error: "Something went wrong. Your progress is saved; sign in to continue from your workspace." };
  }
}
