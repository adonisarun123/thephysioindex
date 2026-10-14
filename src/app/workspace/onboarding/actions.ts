"use server";

import { ApiError } from "@/lib/api";
import { canManagePractitioner, getViewer } from "@/lib/auth/session";
import { currentPolicyVersions, offeringDefaults } from "@/lib/workspace/catalog";
import { createClinicBranch, joinBranch } from "@/lib/workspace/clinics";
import { resolveWorkspacePractitioner } from "@/lib/workspace/context";
import { addCredential, removeCredential } from "@/lib/workspace/credentials";
import { IdentitySchema, saveDraftSection, submitDraft, validateForSubmission } from "@/lib/workspace/draft";
import { bool, done, failTo, opt, plainText, str } from "@/lib/workspace/forms";
import { createOffering } from "@/lib/workspace/offerings";
import { createPractitioner, nextStep, onboardingStatus, recordConsents, type Step } from "@/lib/workspace/onboarding";
import { parseClinicForm, parseCredentialForm, parseLanguages, parseOfferingForm, parseQualifications, parseSpecialties } from "@/lib/workspace/parsers";

/** Creation wizard actions (PRO-02, PRO-03). Each step autosaves and returns to the wizard. */

const page = (step: Step) => `/workspace/onboarding?step=${step}`;

async function actor() {
  const viewer = await getViewer();
  if (!viewer) throw new ApiError("UNAUTHENTICATED", "Sign in to continue");
  const practitioner = await resolveWorkspacePractitioner(viewer);
  if (practitioner && !(await canManagePractitioner(viewer, practitioner.id))) throw new ApiError("UNAUTHORISED", "You cannot manage this profile");
  return { viewer, practitioner };
}

function requirePractitioner<T extends { id: string }>(p: T | null): T {
  if (!p) throw new ApiError("NOT_FOUND", "Start with your identity details first");
  return p;
}

export async function saveIdentity(formData: FormData) {
  const back = page("identity");
  try {
    const { viewer, practitioner } = await actor();
    const identity = IdentitySchema.parse({ displayName: str(formData, "displayName"), designation: opt(formData, "designation") ?? "", headline: opt(formData, "headline") ?? "", gender: opt(formData, "gender") ?? "unset" });
    if (practitioner) await saveDraftSection(practitioner.id, viewer.userId, "identity", identity);
    else await createPractitioner(viewer.userId, identity);
    done(page(nextStep("identity")), { ok: "Identity saved" });
  } catch (err) {
    failTo(back, err);
  }
}

export async function saveQualifications(formData: FormData) {
  const back = page("credentials");
  try {
    const { viewer, practitioner } = await actor();
    const p = requirePractitioner(practitioner);
    await saveDraftSection(p.id, viewer.userId, "qualifications", parseQualifications(formData));
    done(back, { ok: "Qualifications saved" });
  } catch (err) {
    failTo(back, err);
  }
}

export async function addRegistration(formData: FormData) {
  const back = page("credentials");
  try {
    const { viewer, practitioner } = await actor();
    const p = requirePractitioner(practitioner);
    const { duplicateWarning } = await addCredential(p.id, viewer.userId, parseCredentialForm(formData), { openReviewCase: false });
    done(back, duplicateWarning ? { error: "Saved, but this number already appears on another listing. A reviewer will check for duplicates before publication (PRO-05)." } : { ok: "Registration added" });
  } catch (err) {
    failTo(back, err);
  }
}

export async function deleteRegistration(formData: FormData) {
  const back = page("credentials");
  try {
    const { viewer, practitioner } = await actor();
    const p = requirePractitioner(practitioner);
    await removeCredential(p.id, viewer.userId, str(formData, "credentialId"));
    done(back, { ok: "Registration removed" });
  } catch (err) {
    failTo(back, err);
  }
}

export async function joinExistingBranch(formData: FormData) {
  const back = page("practice");
  try {
    const { viewer, practitioner } = await actor();
    const p = requirePractitioner(practitioner);
    await joinBranch(p.id, viewer.userId, str(formData, "branchId"));
    done(back, { ok: "Clinic added. The association is pending approval." });
  } catch (err) {
    failTo(back, err);
  }
}

export async function createClinic(formData: FormData) {
  const back = page("practice");
  try {
    const { viewer, practitioner } = await actor();
    const p = requirePractitioner(practitioner);
    const input = parseClinicForm(formData);
    await createClinicBranch(p.id, viewer.userId, input);
    done(back, { ok: input.newLocalityName && !input.localityId ? "Clinic added. Your new locality has been sent for review." : "Clinic added. The association is pending approval." });
  } catch (err) {
    failTo(back, err);
  }
}

export async function addService(formData: FormData) {
  const back = page("services");
  try {
    const { viewer, practitioner } = await actor();
    const p = requirePractitioner(practitioner);
    const defaults = await offeringDefaults();
    await createOffering(p.id, viewer.userId, str(formData, "associationId"), parseOfferingForm(formData, defaults));
    done(back, { ok: "Service added" });
  } catch (err) {
    failTo(back, err);
  }
}

export async function saveExpertise(formData: FormData) {
  const back = page("services");
  try {
    const { viewer, practitioner } = await actor();
    const p = requirePractitioner(practitioner);
    await saveDraftSection(p.id, viewer.userId, "specialties", parseSpecialties(formData));
    await saveDraftSection(p.id, viewer.userId, "languages", parseLanguages(formData));
    await saveDraftSection(p.id, viewer.userId, "about", plainText(str(formData, "about"), 3000));
    done(page(nextStep("services")), { ok: "Expertise saved" });
  } catch (err) {
    failTo(back, err);
  }
}

export async function saveConsent(formData: FormData) {
  const back = page("consent");
  try {
    const { viewer, practitioner } = await actor();
    const p = requirePractitioner(practitioner);
    if (!p.isOwner) throw new ApiError("UNAUTHORISED", "Only the profile owner can accept terms");
    if (!bool(formData, "publication") || !bool(formData, "terms")) throw new ApiError("INVALID_INPUT", "Both consents are required to publish a profile");
    const versions = await currentPolicyVersions();
    await recordConsents(p.id, viewer.userId, { providerTerms: versions.providerTerms, privacyNotice: versions.privacyNotice });
    done(page("review"), { ok: "Consent recorded" });
  } catch (err) {
    failTo(back, err);
  }
}

/** PRO-03: validates mandatory fields, moves the listing to 'submitted' and opens a listing_review case. */
export async function submitListing() {
  const back = page("review");
  try {
    const { viewer, practitioner } = await actor();
    const p = requirePractitioner(practitioner);
    const s = await onboardingStatus(p.id);
    const gaps = validateForSubmission(s.draft, s);
    if (gaps.length) throw new ApiError("INVALID_INPUT", `Still needed: ${gaps.join("; ")}`);
    await submitDraft(p.id, viewer.userId, { published: p.listingStatus === "published" });
    done("/workspace", { ok: "Your profile has been submitted for review" });
  } catch (err) {
    failTo(back, err);
  }
}
