import { sql } from "drizzle-orm";
import { z } from "zod";
import { currentPolicyVersions, offeringDefaults } from "./catalog";
import { mutateSchedule, WORKSPACE_TZ } from "./calendar";
import { ABOUT_MIN_CHARS, completionPercent, profileChecklist } from "./completion";
import { addCredential } from "./credentials";
import { saveDraftSection, submitDraft, validateForSubmission } from "./draft";
import { plainText } from "./forms";
import { createOffering } from "./offerings";
import { onboardingStatus, recordConsents } from "./onboarding";
import { listAssociations } from "./queries";

/**
 * One-screen profile completion (PRO-03; owner decision 8 Nov 2026: whole
 * onboarding under two minutes). Everything the 100% checklist still needs is
 * saved in one submit: About, main area of practice, languages, one service
 * with its fee at every place they practise, and weekly hours at each clinic.
 * When that brings the profile to 100% it is submitted for verification in the
 * same step. Anything already done is left as it is.
 */

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
/** SpecialtiesSchema allows eight in total, one of them primary. */
export const MAX_SPECIALTIES = 8;

export const FinishSchema = z
  .object({
    about: z.string().trim().min(ABOUT_MIN_CHARS, `About you needs at least ${ABOUT_MIN_CHARS} characters`).max(3000).optional(),
    primarySpecialtyId: z.uuid("Choose your main area of practice").optional(),
    /** Other areas they treat, ticked on the finish screen (owner request 11 Nov 2026). Optional; never blocks submission. */
    otherSpecialtyIds: z.array(z.uuid()).max(MAX_SPECIALTIES - 1, `Choose up to ${MAX_SPECIALTIES - 1} other areas`).optional(),
    languageIds: z.array(z.uuid()).min(1, "Choose at least one language").optional(),
    service: z.object({ serviceId: z.uuid("Choose a service"), displayName: z.string().trim().min(2).max(120), feePaise: z.number().int().min(0).max(10_000_000) }).optional(),
    hours: z
      .object({ weekdays: z.array(z.number().int().min(0).max(6)).min(1, "Choose at least one day"), localStart: z.string().regex(TIME), localEnd: z.string().regex(TIME) })
      .refine((h) => h.localEnd > h.localStart, { message: "Closing time must be after opening time" })
      .optional(),
    qualification: z.object({ degree: z.string().trim().min(2).max(120), institution: z.string().trim().min(2).max(160) }).optional(),
    credential: z.object({ authorityId: z.uuid("Choose where you are registered"), number: z.string().trim().min(2).max(60) }).optional(),
    consent: z.boolean().optional(),
    submit: z.boolean(),
  });

export type FinishInput = z.infer<typeof FinishSchema>;

export async function finishProfile(practitionerId: string, userId: string, listingStatus: string, input: FinishInput): Promise<{ percent: number; submitted: boolean; gaps: string[] }> {
  const before = await onboardingStatus(practitionerId);
  const d = before.draft;

  if (input.qualification && !(d.qualifications?.length)) {
    await saveDraftSection(practitionerId, userId, "qualifications", [{ degree: plainText(input.qualification.degree, 120), institution: plainText(input.qualification.institution, 160), completionYear: null, inProgress: false }]);
  }
  if (input.credential && before.credentialCount === 0) {
    await addCredential(practitionerId, userId, input.credential, { openReviewCase: false });
  }
  if (input.about) await saveDraftSection(practitionerId, userId, "about", plainText(input.about, 3000));
  if (input.primarySpecialtyId) {
    await saveDraftSection(practitionerId, userId, "specialties", mergeSpecialties(d.specialties ?? [], input.primarySpecialtyId, input.otherSpecialtyIds ?? []));
  }
  if (input.languageIds) await saveDraftSection(practitionerId, userId, "languages", input.languageIds);
  if (input.consent && !before.consents) {
    const v = await currentPolicyVersions();
    await recordConsents(practitionerId, userId, { providerTerms: v.providerTerms, privacyNotice: v.privacyNotice });
  }

  const live = (await listAssociations(practitionerId)).filter((a) => a.state !== "ended" && a.state !== "rejected");
  if (input.service && before.offeringCount === 0) {
    const dflt = await offeringDefaults();
    for (const a of live) {
      await createOffering(practitionerId, userId, a.id, {
        serviceId: input.service.serviceId,
        displayName: plainText(input.service.displayName, 120),
        description: "",
        basePricePaise: input.service.feePaise,
        taxPaise: 0,
        extraChargesPaise: 0,
        priceNote: "",
        durationMin: dflt.durationMin,
        intervalMin: dflt.intervalMin,
        bufferBeforeMin: dflt.bufferBeforeMin,
        bufferAfterMin: dflt.bufferAfterMin,
        minNoticeMin: dflt.minNoticeMin,
        bookingHorizonDays: dflt.horizonDays,
      });
    }
  }

  const clinics = live.filter((a) => a.kind !== "service_area");
  if (input.hours && clinics.length > 0 && before.availabilityRuleCount === 0) {
    const h = input.hours;
    const today = new Date().toLocaleDateString("en-CA", { timeZone: WORKSPACE_TZ });
    // Same write path as Calendar → weekly hours (CAL-05, CAL-09): lock, insert, bump schedule_version.
    await mutateSchedule(practitionerId, userId, "calendar.rule.add", async ({ tx, resourceId, nextVersion }) => {
      for (const a of clinics) {
        for (const weekday of h.weekdays) {
          await tx.execute(sql`
            INSERT INTO availability_rules (resource_id, branch_id, weekday, local_start, local_end, timezone, effective_from, effective_to, schedule_version, created_by_user_id)
            VALUES (${resourceId}, ${a.branchId}, ${weekday}, ${h.localStart}::time, ${h.localEnd}::time, ${WORKSPACE_TZ}, ${today}::date, ${null}, ${nextVersion}, ${userId})`);
        }
      }
    });
  }

  const after = await onboardingStatus(practitionerId);
  const percent = completionPercent(profileChecklist(after.draft, after));
  const gaps = validateForSubmission(after.draft, after);
  let submitted = false;
  if (input.submit && gaps.length === 0 && after.versionState === "draft" && ["draft", "rejected", "changes_requested", "published"].includes(listingStatus)) {
    await submitDraft(practitionerId, userId, { published: listingStatus === "published" });
    submitted = true;
  }
  return { percent, submitted, gaps };
}

/** Primary first, then the newly ticked areas, then any already saved; de-duplicated and capped at the schema limit. */
export function mergeSpecialties(existing: { specialtyId: string; isPrimary: boolean }[], primaryId: string, otherIds: string[]): { specialtyId: string; isPrimary: boolean }[] {
  const ids = [primaryId, ...otherIds, ...existing.map((s) => s.specialtyId)];
  return Array.from(new Set(ids)).slice(0, MAX_SPECIALTIES).map((specialtyId) => ({ specialtyId, isPrimary: specialtyId === primaryId }));
}
