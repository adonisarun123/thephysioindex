"use server";

import { revalidatePath } from "next/cache";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { withTransaction } from "@/db/client";
import { ApiError } from "@/lib/api";
import { audit } from "@/lib/audit";
import { requireStaff } from "@/lib/auth/session";
import { openCase } from "@/lib/admin/cases";
import { act, parseForm, requireRecent, zReason, zReq, zUuid } from "@/lib/admin/forms";
import { actorRole } from "@/lib/admin/practitioner-ops";

const STAFF_ROLES = ["verification_reviewer", "support_agent", "analyst", "super_admin"] as const;

/**
 * IAM-02 / IAM-03: staff accounts are created with a reason by a super
 * administrator after recent re-authentication. The super_admin role itself
 * is a privileged escalation and needs a second administrator (role_escalation case).
 */
export async function inviteStaffAction(fd: FormData) {
  const v = await requireStaff("super_admin");
  const i = parseForm(z.object({ email: z.string().trim().toLowerCase().email().max(200), name: zReq(120, 2), role: z.enum(STAFF_ROLES), reason: zReason }), fd);
  requireRecent(v, "/admin/staff");
  await act("/admin/staff", async () => {
    const result = await withTransaction(async (_c, tx) => {
      // Same SQL shape as scripts/bootstrap-admin.ts: auth user (kind staff, email verified) → users row → role grant.
      const au = await tx.execute<{ id: string }>(sql`INSERT INTO auth."user" (name, email, email_verified, kind, created_at, updated_at) VALUES (${i.name}, ${i.email}, true, 'staff', now(), now())
        ON CONFLICT (email) DO UPDATE SET kind = 'staff', email_verified = true, updated_at = now() RETURNING id`);
      const authId = au.rows[0].id;
      const u = await tx.execute<{ id: string }>(sql`INSERT INTO users (auth_subject, email, email_verified_at, display_name) VALUES (${String(authId)}, ${i.email}, now(), ${i.name})
        ON CONFLICT (auth_subject) DO UPDATE SET email = EXCLUDED.email, email_verified_at = coalesce(users.email_verified_at, now()), display_name = coalesce(users.display_name, EXCLUDED.display_name), status = 'active' RETURNING id`);
      const userId = u.rows[0].id;
      if (i.role === "super_admin") {
        const { id, created } = await openCase(tx, { caseType: "role_escalation", subjectType: "user", subjectId: userId, submittedByUserId: v.userId, priority: "high", evidence: { role: "super_admin", email: i.email, reason: i.reason } });
        await audit({ actorUserId: v.userId, actorRole: actorRole(v), action: "staff.invite", objectType: "user", objectId: userId, reason: i.reason, changedFields: { email: i.email, role: "super_admin", escalationCaseId: id } }, tx);
        return { userId, caseId: id, created };
      }
      await tx.execute(sql`INSERT INTO role_assignments (user_id, role, scope_type, granted_by_user_id, reason) VALUES (${userId}, ${i.role}::role_name, 'global', ${v.userId}, ${i.reason}) ON CONFLICT DO NOTHING`);
      await audit({ actorUserId: v.userId, actorRole: actorRole(v), action: "staff.invite", objectType: "user", objectId: userId, reason: i.reason, changedFields: { email: i.email, role: i.role } }, tx);
      return { userId, caseId: null as string | null, created: false };
    });
    revalidatePath("/admin/staff");
    if (result.caseId) return { path: `/admin/cases/${result.caseId}`, notice: result.created ? "Account created. Granting super_admin needs approval from a different super administrator (IAM-03)." : "Account exists; an escalation case is already open." };
    return { notice: `${i.email} can now sign in at /admin/sign-in with an emailed code and must enrol an authenticator.` };
  });
}

/** Grant or revoke a global staff role. Escalation to super_admin goes through a second-admin case. */
export async function changeRoleAction(fd: FormData) {
  const v = await requireStaff("super_admin");
  const i = parseForm(z.object({ userId: zUuid, role: z.enum(STAFF_ROLES), op: z.enum(["grant", "revoke"]), reason: zReason }), fd);
  requireRecent(v, "/admin/staff");
  await act("/admin/staff", async () => {
    const out = await withTransaction(async (_c, tx) => {
      if (i.op === "grant" && i.role === "super_admin") {
        const { id, created } = await openCase(tx, { caseType: "role_escalation", subjectType: "user", subjectId: i.userId, submittedByUserId: v.userId, priority: "high", evidence: { role: "super_admin", reason: i.reason } });
        await audit({ actorUserId: v.userId, actorRole: actorRole(v), action: "staff.escalation_requested", objectType: "user", objectId: i.userId, reason: i.reason, changedFields: { role: "super_admin", caseId: id } }, tx);
        return { caseId: id, created };
      }
      if (i.op === "grant") {
        await tx.execute(sql`INSERT INTO role_assignments (user_id, role, scope_type, granted_by_user_id, reason) VALUES (${i.userId}, ${i.role}::role_name, 'global', ${v.userId}, ${i.reason}) ON CONFLICT DO NOTHING`);
        await tx.execute(sql`UPDATE auth."user" SET kind = 'staff' WHERE id::text = (SELECT auth_subject FROM users WHERE id = ${i.userId})`);
      } else {
        if (i.userId === v.userId && i.role === "super_admin") throw new ApiError("INVALID_INPUT", "You cannot revoke your own super_admin role");
        const r = await tx.execute(sql`UPDATE role_assignments SET revoked_at = now(), revoked_by_user_id = ${v.userId} WHERE user_id = ${i.userId} AND role = ${i.role}::role_name AND scope_type = 'global' AND revoked_at IS NULL`);
        if ((r.rowCount ?? 0) === 0) throw new ApiError("NOT_FOUND", "No active grant for that role");
        // Revocation takes effect on the next authorised request; sessions are re-evaluated per request (IAM-02).
        if (i.role === "super_admin") await tx.execute(sql`DELETE FROM auth.session WHERE user_id::text = (SELECT auth_subject FROM users WHERE id = ${i.userId})`);
      }
      await audit({ actorUserId: v.userId, actorRole: actorRole(v), action: `staff.${i.op}_role`, objectType: "user", objectId: i.userId, reason: i.reason, changedFields: { role: i.role } }, tx);
      return { caseId: null as string | null, created: false };
    });
    revalidatePath("/admin/staff");
    if (out.caseId) return { path: `/admin/cases/${out.caseId}`, notice: out.created ? "Escalation requested; a different super administrator must approve." : "An escalation case is already open." };
    return { notice: `Role ${i.op === "grant" ? "granted" : "revoked"}` };
  });
}

/** IAM-02: deactivation revokes grants and terminates sessions immediately. */
export async function deactivateStaffAction(fd: FormData) {
  const v = await requireStaff("super_admin");
  const i = parseForm(z.object({ userId: zUuid, reason: zReason }), fd);
  requireRecent(v, "/admin/staff");
  await act("/admin/staff", async () => {
    if (i.userId === v.userId) throw new ApiError("INVALID_INPUT", "You cannot deactivate your own account");
    await withTransaction(async (_c, tx) => {
      const u = await tx.execute<{ auth_subject: string; status: string }>(sql`SELECT auth_subject, status FROM users WHERE id = ${i.userId} FOR UPDATE`);
      if (!u.rows[0]) throw new ApiError("NOT_FOUND", "User not found");
      const others = await tx.execute<{ n: string }>(sql`SELECT count(DISTINCT user_id) AS n FROM role_assignments WHERE role = 'super_admin' AND revoked_at IS NULL AND user_id <> ${i.userId}`);
      if (Number(others.rows[0].n) === 0) throw new ApiError("CONFLICT", "At least one other active super administrator is required");
      await tx.execute(sql`UPDATE users SET status = 'suspended' WHERE id = ${i.userId}`);
      const grants = await tx.execute(sql`UPDATE role_assignments SET revoked_at = now(), revoked_by_user_id = ${i.userId === v.userId ? null : v.userId} WHERE user_id = ${i.userId} AND revoked_at IS NULL`);
      const sessions = await tx.execute(sql`DELETE FROM auth.session WHERE user_id::text = ${u.rows[0].auth_subject}`);
      await tx.execute(sql`UPDATE verification_cases SET assignee_user_id = NULL WHERE assignee_user_id = ${i.userId} AND state IN ('open','in_review','awaiting_evidence')`);
      await audit({ actorUserId: v.userId, actorRole: actorRole(v), action: "staff.deactivate", objectType: "user", objectId: i.userId, reason: i.reason, changedFields: { status: { from: u.rows[0].status, to: "suspended" }, grantsRevoked: grants.rowCount ?? 0, sessionsTerminated: sessions.rowCount ?? 0 } }, tx);
    });
    revalidatePath("/admin/staff");
    return { notice: "Account deactivated; grants revoked and sessions terminated" };
  });
}

export async function reactivateStaffAction(fd: FormData) {
  const v = await requireStaff("super_admin");
  const i = parseForm(z.object({ userId: zUuid, reason: zReason }), fd);
  requireRecent(v, "/admin/staff");
  await act("/admin/staff", async () => {
    await withTransaction(async (_c, tx) => {
      await tx.execute(sql`UPDATE users SET status = 'active' WHERE id = ${i.userId}`);
      await audit({ actorUserId: v.userId, actorRole: actorRole(v), action: "staff.reactivate", objectType: "user", objectId: i.userId, reason: i.reason }, tx);
    });
    revalidatePath("/admin/staff");
    return { notice: "Account reactivated. Grant roles again as needed." };
  });
}
