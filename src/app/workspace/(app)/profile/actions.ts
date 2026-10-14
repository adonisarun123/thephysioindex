"use server";

import { revalidatePath } from "next/cache";
import { ApiError } from "@/lib/api";
import { requireManage } from "@/lib/workspace/context";
import { addCredential, removeCredential } from "@/lib/workspace/credentials";
import { IdentitySchema, saveDraftSection, submitDraft, validateForSubmission } from "@/lib/workspace/draft";
import { done, failTo, opt, plainText, str } from "@/lib/workspace/forms";
import { onboardingStatus } from "@/lib/workspace/onboarding";
import { parseCredentialForm, parseExperiences, parseLanguages, parsePortfolio, parseQualifications, parseSpecialties } from "@/lib/workspace/parsers";

/**
 * Profile editor actions (PRO-08, PRO-10). Writes go to the draft JSON in
 * profile_versions, never to the published relational tables. Credentials are
 * relational and written directly with status self_declared (VER-01).
 */

const PAGE = "/workspace/profile";
const back = (anchor: string) => `${PAGE}#${anchor}`;

export async function saveIdentitySection(formData: FormData) {
  try {
    const { viewer, practitioner } = await requireManage();
    const identity = IdentitySchema.parse({ displayName: str(formData, "displayName"), designation: opt(formData, "designation") ?? "", headline: opt(formData, "headline") ?? "", gender: opt(formData, "gender") ?? "unset" });
    await saveDraftSection(practitioner.id, viewer.userId, "identity", identity);
    revalidatePath(PAGE);
    done(PAGE, { ok: "Identity saved to your draft" });
  } catch (err) {
    failTo(back("identity"), err);
  }
}

export async function saveAboutSection(formData: FormData) {
  try {
    const { viewer, practitioner } = await requireManage();
    const about = plainText(str(formData, "about"), 3000);
    if (about.length < 100) throw new ApiError("INVALID_INPUT", "About must be at least 100 characters of plain text");
    if (/guarantee|100%|cure/i.test(about)) throw new ApiError("INVALID_INPUT", "Remove outcome guarantees (e.g. “guaranteed”, “cure”) from the About section");
    await saveDraftSection(practitioner.id, viewer.userId, "about", about);
    revalidatePath(PAGE);
    done(PAGE, { ok: "About saved to your draft" });
  } catch (err) {
    failTo(back("about"), err);
  }
}

export async function saveQualificationsSection(formData: FormData) {
  try {
    const { viewer, practitioner } = await requireManage();
    await saveDraftSection(practitioner.id, viewer.userId, "qualifications", parseQualifications(formData));
    revalidatePath(PAGE);
    done(PAGE, { ok: "Qualifications saved to your draft" });
  } catch (err) {
    failTo(back("qualifications"), err);
  }
}

export async function saveExperiencesSection(formData: FormData) {
  try {
    const { viewer, practitioner } = await requireManage();
    const items = parseExperiences(formData).sort((a, b) => (b.endMonth ?? "9999-99").localeCompare(a.endMonth ?? "9999-99") || b.startMonth.localeCompare(a.startMonth));
    await saveDraftSection(practitioner.id, viewer.userId, "experiences", items);
    revalidatePath(PAGE);
    done(PAGE, { ok: "Experience saved to your draft" });
  } catch (err) {
    failTo(back("experience"), err);
  }
}

export async function saveExpertiseSection(formData: FormData) {
  try {
    const { viewer, practitioner } = await requireManage();
    const specialties = parseSpecialties(formData);
    if (!specialties.some((s) => s.isPrimary)) throw new ApiError("INVALID_INPUT", "Choose one primary area of practice");
    await saveDraftSection(practitioner.id, viewer.userId, "specialties", specialties);
    await saveDraftSection(practitioner.id, viewer.userId, "languages", parseLanguages(formData));
    revalidatePath(PAGE);
    done(PAGE, { ok: "Areas of practice and languages saved to your draft" });
  } catch (err) {
    failTo(back("expertise"), err);
  }
}

export async function savePortfolioSection(formData: FormData) {
  try {
    const { viewer, practitioner } = await requireManage();
    await saveDraftSection(practitioner.id, viewer.userId, "portfolio", parsePortfolio(formData));
    revalidatePath(PAGE);
    done(PAGE, { ok: "Portfolio saved to your draft" });
  } catch (err) {
    failTo(back("portfolio"), err);
  }
}

export async function addCredentialAction(formData: FormData) {
  try {
    const { viewer, practitioner } = await requireManage();
    // VER-05: registration changes on a published profile trigger renewed review.
    const { duplicateWarning } = await addCredential(practitioner.id, viewer.userId, parseCredentialForm(formData), { openReviewCase: practitioner.listingStatus === "published" });
    revalidatePath(PAGE);
    done(PAGE, duplicateWarning ? { error: "Saved, but this number already appears on another listing. A reviewer will check for duplicates (PRO-05)." } : { ok: "Credential added; it will show as self-declared until reviewed" });
  } catch (err) {
    failTo(back("credentials"), err);
  }
}

export async function removeCredentialAction(formData: FormData) {
  try {
    const { viewer, practitioner } = await requireManage();
    await removeCredential(practitioner.id, viewer.userId, str(formData, "credentialId"));
    revalidatePath(PAGE);
    done(PAGE, { ok: "Credential removed" });
  } catch (err) {
    failTo(back("credentials"), err);
  }
}

/** PRO-03 / VER-05: listing_review for a first listing, profile_change when already published. */
export async function submitForReview() {
  try {
    const { viewer, practitioner } = await requireManage();
    const published = practitioner.listingStatus === "published";
    const s = await onboardingStatus(practitioner.id);
    const gaps = validateForSubmission(s.draft, s);
    if (gaps.length) throw new ApiError("INVALID_INPUT", `Still needed: ${gaps.join("; ")}`);
    await submitDraft(practitioner.id, viewer.userId, { published });
    revalidatePath(PAGE);
    revalidatePath("/workspace");
    done(PAGE, { ok: published ? "Changes submitted. Your current published profile stays live until they are approved." : "Profile submitted for review" });
  } catch (err) {
    failTo(back("submit"), err);
  }
}
