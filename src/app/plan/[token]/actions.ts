"use server";

import { ApiError } from "@/lib/api";
import { recordCheckin } from "@/lib/practice/exercise-plans";
import { done, failTo, str } from "@/lib/workspace/forms";

/** HEP-03: patient marks today's exercises done (idempotent per IST day). */
export async function checkinAction(formData: FormData) {
  const token = str(formData, "token");
  const page = `/plan/${token}`;
  try {
    if (!/^[A-Za-z0-9_.-]{20,80}$/.test(token)) throw new ApiError("NOT_FOUND", "This plan link is not valid");
    const raw = str(formData, "pain");
    const pain = raw === "" ? null : Number(raw);
    await recordCheckin(token, pain);
  } catch (err) {
    failTo(page, err);
  }
  done(page, { ok: "Well done. Today is marked as done." });
}
