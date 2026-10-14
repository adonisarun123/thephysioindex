"use server";

import { sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { ApiError } from "@/lib/api";
import { audit } from "@/lib/audit";
import { apiStaff } from "@/lib/auth/session";
import { OverrideInput } from "@/lib/content/schemas";
import { normalisePath } from "./gate";

/** Per-route indexation overrides (SEO-02). super_admin only; every change is audited with its reason. */

export type OverrideState = { ok: boolean; message: string | null };

export async function setOverrideAction(_prev: OverrideState, formData: FormData): Promise<OverrideState> {
  try {
    const viewer = await apiStaff("super_admin");
    const parsed = OverrideInput.safeParse({
      path: formData.get("path") ?? "",
      directive: formData.get("directive") ?? "",
      reason: formData.get("reason") ?? "",
      expiresAt: formData.get("expires_at") ?? "",
    });
    if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid input" };
    const o = parsed.data;
    const path = normalisePath(o.path);
    await db().execute(sql`
      INSERT INTO seo_route_overrides (path, directive, reason, set_by_user_id, expires_at)
      VALUES (${path}, ${o.directive}, ${o.reason}, ${viewer.userId}, ${o.expiresAt})
      ON CONFLICT (path) DO UPDATE SET directive = excluded.directive, reason = excluded.reason, set_by_user_id = excluded.set_by_user_id, expires_at = excluded.expires_at, updated_at = now()
    `);
    await audit({ actorUserId: viewer.userId, actorRole: "super_admin", action: "seo.override.set", objectType: "seo_route_override", objectId: path, reason: o.reason, changedFields: { directive: o.directive, expiresAt: o.expiresAt } });
    revalidatePath(path);
    revalidatePath("/admin/seo");
    return { ok: true, message: `Override saved for ${path}.` };
  } catch (e) {
    if (e instanceof ApiError) return { ok: false, message: e.message };
    console.error("[seo] setOverride failed", e);
    return { ok: false, message: "Could not save the override." };
  }
}

export async function deleteOverrideAction(formData: FormData): Promise<void> {
  const viewer = await apiStaff("super_admin");
  const id = String(formData.get("id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ApiError("INVALID_INPUT", "Invalid id");
  const res = await db().execute<{ path: string }>(sql`DELETE FROM seo_route_overrides WHERE id = ${id} RETURNING path`);
  const path = res.rows[0]?.path;
  if (path) {
    await audit({ actorUserId: viewer.userId, actorRole: "super_admin", action: "seo.override.delete", objectType: "seo_route_override", objectId: path });
    revalidatePath(path);
  }
  revalidatePath("/admin/seo");
}
