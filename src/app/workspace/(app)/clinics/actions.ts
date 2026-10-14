"use server";

import { revalidatePath } from "next/cache";
import { ApiError } from "@/lib/api";
import { offeringDefaults } from "@/lib/workspace/catalog";
import { createClinicBranch, endAssociation, joinBranch, updateContactRules } from "@/lib/workspace/clinics";
import { requireManage } from "@/lib/workspace/context";
import { bool, done, failTo, opt, str } from "@/lib/workspace/forms";
import { createOffering, reviseOffering, setOfferingActive } from "@/lib/workspace/offerings";
import { parseClinicForm, parseOfferingForm } from "@/lib/workspace/parsers";

/** Clinics and services actions (LOC-02, CAL-02, CAL-03). */

const PAGE = "/workspace/clinics";

export async function joinBranchAction(formData: FormData) {
  try {
    const { viewer, practitioner } = await requireManage();
    await joinBranch(practitioner.id, viewer.userId, str(formData, "branchId"));
    revalidatePath(PAGE);
    done(PAGE, { ok: "Association requested. It becomes public once approved." });
  } catch (err) {
    failTo(PAGE, err);
  }
}

export async function createClinicAction(formData: FormData) {
  try {
    const { viewer, practitioner } = await requireManage();
    const input = parseClinicForm(formData);
    await createClinicBranch(practitioner.id, viewer.userId, input);
    revalidatePath(PAGE);
    done(PAGE, { ok: input.newLocalityName && !input.localityId ? "Clinic added; the new locality has gone to review." : "Clinic added. The association is pending approval." });
  } catch (err) {
    failTo(`${PAGE}#add`, err);
  }
}

export async function endAssociationAction(formData: FormData) {
  try {
    const { viewer, practitioner } = await requireManage();
    if (!bool(formData, "confirm")) throw new ApiError("INVALID_INPUT", "Tick the confirmation to end this association");
    const { futureBookings } = await endAssociation(practitioner.id, viewer.userId, str(formData, "associationId"), opt(formData, "reason") ?? null);
    revalidatePath(PAGE);
    done(PAGE, { ok: futureBookings > 0 ? `Association ended. ${futureBookings} future appointment(s) need resolution; a task has been created and support will contact you.` : "Association ended. No future appointments were affected." });
  } catch (err) {
    failTo(PAGE, err);
  }
}

export async function contactRulesAction(formData: FormData) {
  try {
    const { viewer, practitioner } = await requireManage();
    await updateContactRules(practitioner.id, viewer.userId, str(formData, "associationId"), { showBranchPhone: bool(formData, "showBranchPhone") });
    revalidatePath(PAGE);
    revalidatePath("/workspace/settings");
    done(str(formData, "back") || PAGE, { ok: "Contact rules updated" });
  } catch (err) {
    failTo(str(formData, "back") || PAGE, err);
  }
}

export async function addOfferingAction(formData: FormData) {
  const associationId = str(formData, "associationId");
  try {
    const { viewer, practitioner } = await requireManage();
    const defaults = await offeringDefaults();
    await createOffering(practitioner.id, viewer.userId, associationId, parseOfferingForm(formData, defaults));
    revalidatePath(PAGE);
    done(PAGE, { ok: "Service added" });
  } catch (err) {
    failTo(`${PAGE}#assoc-${associationId}`, err);
  }
}

export async function reviseOfferingAction(formData: FormData) {
  const offeringId = str(formData, "offeringId");
  try {
    const { viewer, practitioner } = await requireManage();
    const defaults = await offeringDefaults();
    await reviseOffering(practitioner.id, viewer.userId, offeringId, parseOfferingForm(formData, defaults));
    revalidatePath(PAGE);
    done(PAGE, { ok: "New version saved. Existing appointments keep the version they were booked on (CAL-02)." });
  } catch (err) {
    failTo(`${PAGE}?edit=${offeringId}`, err);
  }
}

export async function toggleOfferingAction(formData: FormData) {
  try {
    const { viewer, practitioner } = await requireManage();
    const active = str(formData, "active") === "1";
    await setOfferingActive(practitioner.id, viewer.userId, str(formData, "offeringId"), active);
    revalidatePath(PAGE);
    done(PAGE, { ok: active ? "Service activated" : "Service deactivated; it no longer appears or accepts bookings" });
  } catch (err) {
    failTo(PAGE, err);
  }
}
