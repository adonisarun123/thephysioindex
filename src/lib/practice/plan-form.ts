import { ApiError } from "@/lib/api";
import { opt, rows, str } from "@/lib/workspace/forms";
import { PlanInputSchema, type PlanInput } from "./exercise-plans";

/** Whole numbers only; blank → undefined. Anything else is a typed error, not a silent drop. */
function whole(v: string | undefined, label: string): number | undefined {
  if (v === undefined || v === "") return undefined;
  if (!/^\d{1,4}$/.test(v)) throw new ApiError("INVALID_INPUT", `${label} must be a whole number`);
  return Number(v);
}

/** Builder form → validated PlanInput (HEP-02). */
export function parsePlanForm(fd: FormData): PlanInput {
  const items = rows(fd, "items").map((r) => ({
    exerciseId: r.exerciseId ?? "",
    sets: whole(r.sets, "Sets"),
    reps: whole(r.reps, "Reps"),
    holdSeconds: whole(r.holdSeconds, "Hold"),
    frequency: r.frequency || undefined,
    note: r.note || undefined,
  }));
  return PlanInputSchema.parse({
    patientLabel: str(fd, "patientLabel"),
    title: str(fd, "title"),
    advice: opt(fd, "advice"),
    endsOn: opt(fd, "endsOn"),
    items,
  });
}
