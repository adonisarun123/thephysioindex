"use server";

import { revalidatePath } from "next/cache";
import { ApiError } from "@/lib/api";
import {
  createCustomExercise,
  createPlan,
  CustomExerciseSchema,
  retireCustomExercise,
  rotatePlanLink,
  setPlanArchived,
  updatePlan,
} from "@/lib/practice/exercise-plans";
import { parsePlanForm } from "@/lib/practice/plan-form";
import { requireManage } from "@/lib/workspace/context";
import { done, failTo, num, opt, str } from "@/lib/workspace/forms";

const PAGE = "/workspace/exercises";

/** HEP-02: create a plan, then land on it with the share options open. */
export async function createPlanAction(formData: FormData) {
  let planId: string;
  try {
    const { viewer, practitioner } = await requireManage();
    ({ planId } = await createPlan(practitioner.id, viewer.userId, parsePlanForm(formData)));
    revalidatePath(PAGE);
  } catch (err) {
    failTo(`${PAGE}/new`, err);
  }
  done(`${PAGE}/${planId}`, { ok: "Plan saved. Send the link to your patient." });
}

export async function updatePlanAction(formData: FormData) {
  const planId = str(formData, "planId");
  try {
    const { viewer, practitioner } = await requireManage();
    await updatePlan(practitioner.id, viewer.userId, planId, parsePlanForm(formData));
    revalidatePath(PAGE);
  } catch (err) {
    failTo(`${PAGE}/${planId}`, err);
  }
  done(`${PAGE}/${planId}`, { ok: "Plan updated. Your patient's link now shows the changes." });
}

export async function rotateLinkAction(formData: FormData) {
  const planId = str(formData, "planId");
  try {
    const { viewer, practitioner } = await requireManage();
    await rotatePlanLink(practitioner.id, viewer.userId, planId);
  } catch (err) {
    failTo(`${PAGE}/${planId}`, err);
  }
  done(`${PAGE}/${planId}`, { ok: "New link created. The old link no longer works." });
}

export async function archivePlanAction(formData: FormData) {
  const planId = str(formData, "planId");
  const archived = str(formData, "archived") === "1";
  try {
    const { viewer, practitioner } = await requireManage();
    await setPlanArchived(practitioner.id, viewer.userId, planId, archived);
    revalidatePath(PAGE);
  } catch (err) {
    failTo(`${PAGE}/${planId}`, err);
  }
  done(`${PAGE}/${planId}`, { ok: archived ? "Plan archived. The patient link no longer opens it." : "Plan restored. The same link works again." });
}

/** HEP-01: practitioner's own exercise. */
export async function createExerciseAction(formData: FormData) {
  try {
    const { viewer, practitioner } = await requireManage();
    const input = CustomExerciseSchema.parse({
      name: str(formData, "name"),
      bodyRegion: str(formData, "bodyRegion"),
      instructions: str(formData, "instructions"),
      sets: num(formData, "sets"),
      reps: num(formData, "reps"),
      holdSeconds: num(formData, "holdSeconds"),
      frequency: opt(formData, "frequency"),
    });
    await createCustomExercise(practitioner.id, viewer.userId, input);
    revalidatePath(PAGE);
  } catch (err) {
    failTo(PAGE, err);
  }
  done(PAGE, { ok: "Exercise added to your list." });
}

export async function retireExerciseAction(formData: FormData) {
  try {
    const { viewer, practitioner } = await requireManage();
    const id = str(formData, "exerciseId");
    if (!id) throw new ApiError("INVALID_INPUT", "Choose an exercise");
    await retireCustomExercise(practitioner.id, viewer.userId, id);
    revalidatePath(PAGE);
  } catch (err) {
    failTo(PAGE, err);
  }
  done(PAGE, { ok: "Exercise removed from your list. Existing plans keep it." });
}
