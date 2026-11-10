import { sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { ApiError } from "@/lib/api";
import { audit } from "@/lib/audit";
import { normaliseIndianMobile } from "@/lib/messaging/sms";
import { attachLeadToRegistration } from "@/lib/practitioner-leads";
import { newPublicId } from "@/lib/public-id";
import { currentPolicyVersions } from "./catalog";
import { createClinicBranch, createServiceArea } from "./clinics";
import { addCredential } from "./credentials";
import { saveDraftSection } from "./draft";
import { plainText } from "./forms";
import { createPractitioner, recordConsents } from "./onboarding";
import { PRACTICE_MODES } from "./registration-options";

export { DEGREES, PRACTICE_MODES } from "./registration-options";

/**
 * One-screen practitioner registration (PRO-02, PRO-03; owner decision 7 Nov 2026).
 *
 * The practitioner has already proved the email with a one-time code, so this
 * creates the account's draft profile in one go: name, qualification,
 * registration number, where they practise, and consent. The mobile number is
 * stored unverified until SMS OTP is live. Nothing here is public: the profile
 * is listed only after it reaches 100% and a reviewer verifies the registration
 * (VER-03, DIR-14).
 */

const Uuid = z.uuid();

export const RegistrationSchema = z
  .object({
    fullName: z.string().trim().min(2, "Enter your full name").max(120),
    mobile: z.string().trim().min(10, "Enter your mobile number").max(20),
    degree: z.string().trim().min(2, "Choose your qualification").max(120),
    institution: z.string().trim().min(2, "Enter your college or university").max(160),
    authorityId: z.uuid("Choose where you are registered"),
    registrationNumber: z.string().trim().min(2, "Enter your registration number as printed").max(60),
    practiceMode: z.enum(PRACTICE_MODES.map((m) => m.value) as [string, ...string[]], { error: "Tell us where you see patients" }),
    clinicName: z.string().trim().max(160).optional(),
    addressLine1: z.string().trim().max(200).optional(),
    stateId: z.uuid("Choose a state"),
    cityId: z.uuid("Choose a city"),
    localityId: z.string().optional(),
    newLocalityName: z.string().trim().max(120).optional(),
    pinCode: z.string().regex(/^[1-9][0-9]{5}$/, "PIN code must be six digits"),
    consentTerms: z.literal(true, { error: "Please accept the provider terms and publication consent" }),
    consentContact: z.literal(true, { error: "Please allow us to contact you about your listing" }),
  })
  .superRefine((v, ctx) => {
    const clinic = PRACTICE_MODES.find((m) => m.value === v.practiceMode)?.kind === "clinic";
    if (clinic && (v.clinicName?.length ?? 0) < 2) ctx.addIssue({ code: "custom", path: ["clinicName"], message: "Enter the clinic name" });
    if (clinic && (v.addressLine1?.length ?? 0) < 3) ctx.addIssue({ code: "custom", path: ["addressLine1"], message: "Enter the clinic address" });
    const hasLocality = v.localityId && v.localityId !== "__new" && Uuid.safeParse(v.localityId).success;
    if (!hasLocality && (v.newLocalityName?.length ?? 0) < 2) ctx.addIssue({ code: "custom", path: ["localityId"], message: "Choose your locality or type its name" });
  });

export type RegistrationInput = z.infer<typeof RegistrationSchema>;

type Registrant = { userId: string; email: string };

const DAILY_LIMIT_PER_MOBILE = 3;

/** Creates the draft profile and its first credential, location and consents. Returns the sign-up reference. */
export async function registerPractitioner(who: Registrant, input: RegistrationInput, attribution: Record<string, string>, leadRef?: string | null): Promise<{ practitionerId: string; reference: string }> {
  const mobile = normaliseIndianMobile(input.mobile);
  if (!mobile) throw new ApiError("INVALID_INPUT", "Enter a valid 10-digit Indian mobile number");
  const email = who.email.toLowerCase();

  // Fail before creating anything when the references are wrong.
  const place = await db().execute<{ city: string }>(sql`SELECT ci.name AS city FROM cities ci WHERE ci.id = ${input.cityId} AND ci.state_id = ${input.stateId} AND ci.status = 'active'`);
  if (!place.rows[0]) throw new ApiError("INVALID_INPUT", "City does not belong to the selected state");
  const authority = await db().execute<{ id: string }>(sql`SELECT id FROM credential_authorities WHERE id = ${input.authorityId} AND active`);
  if (!authority.rows[0]) throw new ApiError("INVALID_INPUT", "Choose where you are registered");
  const recent = await db().execute<{ n: string | number }>(sql`SELECT count(*) AS n FROM practitioner_signups WHERE mobile = ${mobile} AND created_at > now() - interval '1 day'`);
  if (Number(recent.rows[0]?.n ?? 0) >= DAILY_LIMIT_PER_MOBILE) throw new ApiError("RATE_LIMITED", "Too many registrations with this mobile today. Please try tomorrow or contact us.");

  const name = plainText(input.fullName, 120);
  const practitionerId = await createPractitioner(who.userId, { displayName: name, designation: "Physiotherapist", headline: "", gender: "unset" });
  await saveDraftSection(practitionerId, who.userId, "qualifications", [{ degree: plainText(input.degree, 120), institution: plainText(input.institution, 160), completionYear: null, inProgress: false }]);
  await addCredential(practitionerId, who.userId, { authorityId: input.authorityId, number: input.registrationNumber }, { openReviewCase: false });

  const localityId = input.localityId && input.localityId !== "__new" ? input.localityId : undefined;
  const newLocalityName = localityId ? undefined : input.newLocalityName;
  const kind = PRACTICE_MODES.find((m) => m.value === input.practiceMode)?.kind;
  if (kind === "service_area") {
    await createServiceArea(practitionerId, who.userId, { stateId: input.stateId, cityId: input.cityId, localityId, newLocalityName, pinCode: input.pinCode });
  } else {
    await createClinicBranch(practitionerId, who.userId, {
      clinicName: plainText(input.clinicName ?? "", 160),
      branchName: "",
      addressLine1: plainText(input.addressLine1 ?? "", 200),
      addressLine2: "",
      stateId: input.stateId,
      cityId: input.cityId,
      localityId,
      newLocalityName,
      pinCode: input.pinCode,
      phone: "",
    });
  }

  const versions = await currentPolicyVersions();
  await recordConsents(practitionerId, who.userId, { providerTerms: versions.providerTerms, privacyNotice: versions.privacyNotice });

  // Unverified until SMS OTP is live; notifications only use verified numbers (MSG-01).
  await db().execute(sql`UPDATE users SET mobile = ${mobile} WHERE id = ${who.userId} AND mobile IS NULL`);

  // Lead record for operations follow-up and ad attribution, linked by email.
  // If the quick lead step ran first in this browser, complete that row instead of duplicating it.
  const regNo = plainText(input.registrationNumber, 60);
  const attached = await attachLeadToRegistration(leadRef, { mobile, email, fullName: name, city: place.rows[0].city, practiceType: input.practiceMode, registrationNumber: regNo, attribution });
  if (attached) {
    await audit({ actorUserId: who.userId, action: "practitioner_signup.register", objectType: "practitioner_signup", objectId: attached.id, changedFields: { practitionerId } });
    return { practitionerId, reference: attached.reference };
  }
  const reference = newPublicId();
  const ins = await db().execute<{ id: string }>(sql`
    INSERT INTO practitioner_signups (reference, full_name, mobile, email, city, practice_type, registration_number, attribution, status)
    VALUES (${reference}, ${name}, ${mobile}, ${email}, ${place.rows[0].city}, ${input.practiceMode}, ${regNo}, ${JSON.stringify(attribution)}::jsonb, 'onboarding')
    RETURNING id`);
  await audit({ actorUserId: who.userId, action: "practitioner_signup.create", objectType: "practitioner_signup", objectId: ins.rows[0].id, changedFields: { source: attribution.utm_source ?? null, practitionerId } });
  return { practitionerId, reference };
}
