import { createHash, randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { db, withTransaction } from "@/db/client";
import { audit } from "@/lib/audit";
import { ApiError } from "@/lib/api";
import { normaliseIndianMobile } from "@/lib/messaging/sms";
import type { Viewer } from "@/lib/auth/session";

/**
 * Team invitations and coordinator grants (IAM-02, Section 15 Team).
 * Invitations carry a hashed random token with a seven-day expiry; accepting
 * one creates a practitioner-scoped role_assignments row. Scope is never
 * widened by the invitee.
 */

export const COORDINATOR_PERMISSIONS = [
  { key: "appointments.read", label: "View appointments" },
  { key: "appointments.manage", label: "Manage appointments and walk-ins" },
  { key: "calendar.manage", label: "Edit calendar and leave" },
  { key: "profile.edit", label: "Edit profile draft" },
  { key: "clinics.manage", label: "Manage clinics and services" },
] as const;

const INVITE_TTL_DAYS = 7;

export const InviteSchema = z
  .object({
    mobile: z.string().trim().optional(),
    email: z.email("Enter a valid email").max(160).optional(),
    permissions: z.array(z.enum(COORDINATOR_PERMISSIONS.map((p) => p.key) as [string, ...string[]])).min(1, "Choose at least one permission"),
  })
  .refine((v) => v.mobile || v.email, { message: "Enter a mobile number or an email", path: ["mobile"] });

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createInvitation(practitionerId: string, inviter: Viewer, input: z.infer<typeof InviteSchema>): Promise<{ id: string; token: string; expiresAt: Date }> {
  const mobile = input.mobile ? normaliseIndianMobile(input.mobile) : null;
  if (input.mobile && !mobile) throw new ApiError("INVALID_INPUT", "Enter a valid Indian mobile number");
  const token = randomBytes(24).toString("base64url");
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 86_400_000);
  return withTransaction(async (_c, tx) => {
    const ins = await tx.execute<{ id: string }>(sql`
      INSERT INTO staff_invitations (invited_by_user_id, invitee_mobile, invitee_email, role, scope_type, scope_id, permissions, token_hash, state, expires_at)
      VALUES (${inviter.userId}, ${mobile}, ${input.email ?? null}, 'clinic_coordinator', 'practitioner', ${practitionerId}, ${JSON.stringify(input.permissions)}::jsonb, ${hashToken(token)}, 'pending', ${expiresAt.toISOString()}::timestamptz)
      RETURNING id`);
    await audit({ actorUserId: inviter.userId, action: "team.invite", objectType: "staff_invitation", objectId: ins.rows[0].id, changedFields: { practitionerId, permissions: input.permissions, channel: mobile ? "sms" : "email" } }, tx);
    return { id: ins.rows[0].id, token, expiresAt };
  });
}

export async function revokeInvitation(practitionerId: string, actorUserId: string, invitationId: string): Promise<void> {
  const res = await db().execute(sql`UPDATE staff_invitations SET state = 'revoked', revoked_at = now() WHERE id = ${invitationId} AND scope_type = 'practitioner' AND scope_id = ${practitionerId} AND state = 'pending'`);
  if (res.rowCount === 0) throw new ApiError("NOT_FOUND", "Pending invitation not found");
  await audit({ actorUserId, action: "team.invite.revoke", objectType: "staff_invitation", objectId: invitationId });
}

export async function revokeAssignment(practitionerId: string, actorUserId: string, assignmentId: string): Promise<void> {
  const res = await db().execute(sql`
    UPDATE role_assignments SET revoked_at = now(), revoked_by_user_id = ${actorUserId}
    WHERE id = ${assignmentId} AND scope_type = 'practitioner' AND scope_id = ${practitionerId} AND revoked_at IS NULL AND role <> 'practitioner'`);
  if (res.rowCount === 0) throw new ApiError("NOT_FOUND", "Team member not found");
  await audit({ actorUserId, action: "team.revoke", objectType: "role_assignment", objectId: assignmentId });
}

export type InvitationView = { id: string; practitionerId: string; practitionerName: string; inviterName: string | null; permissions: string[]; state: string; expiresAt: string; expired: boolean };

export async function getInvitationByToken(token: string): Promise<InvitationView | null> {
  const res = await db().execute<Record<string, unknown>>(sql`
    SELECT i.id, i.scope_id, p.display_name, u.display_name AS inviter_name, i.permissions, i.state::text AS state, i.expires_at, (i.expires_at < now()) AS expired
    FROM staff_invitations i JOIN practitioners p ON p.id = i.scope_id JOIN users u ON u.id = i.invited_by_user_id
    WHERE i.token_hash = ${hashToken(token)} AND i.scope_type = 'practitioner'`);
  const r = res.rows[0];
  return r
    ? { id: r.id as string, practitionerId: r.scope_id as string, practitionerName: r.display_name as string, inviterName: (r.inviter_name as string | null) ?? null, permissions: (r.permissions as string[]) ?? [], state: r.state as string, expiresAt: String(r.expires_at), expired: Boolean(r.expired) }
    : null;
}

/** Accepting binds the signed-in user; the invitee's identity is the session, never the link alone. */
export async function acceptInvitation(token: string, viewer: Viewer): Promise<string> {
  return withTransaction(async (_c, tx) => {
    const res = await tx.execute<{ id: string; scope_id: string; permissions: string[]; state: string; expired: boolean; invitee_mobile: string | null; invitee_email: string | null }>(sql`
      SELECT id, scope_id, permissions, state::text AS state, (expires_at < now()) AS expired, invitee_mobile, invitee_email
      FROM staff_invitations WHERE token_hash = ${hashToken(token)} AND scope_type = 'practitioner' FOR UPDATE`);
    const inv = res.rows[0];
    if (!inv) throw new ApiError("NOT_FOUND", "Invitation not found");
    if (inv.state !== "pending") throw new ApiError("CONFLICT", `This invitation was ${inv.state}`);
    if (inv.expired) {
      await tx.execute(sql`UPDATE staff_invitations SET state = 'expired' WHERE id = ${inv.id}`);
      throw new ApiError("CONFLICT", "This invitation has expired; ask for a new one");
    }
    if (inv.invitee_mobile && viewer.mobile && inv.invitee_mobile !== viewer.mobile) throw new ApiError("UNAUTHORISED", "This invitation was sent to a different mobile number");
    if (inv.invitee_email && viewer.email && inv.invitee_email.toLowerCase() !== viewer.email.toLowerCase()) throw new ApiError("UNAUTHORISED", "This invitation was sent to a different email address");
    const owner = await tx.execute<{ owner_user_id: string | null }>(sql`SELECT owner_user_id FROM practitioners WHERE id = ${inv.scope_id}`);
    if (owner.rows[0]?.owner_user_id === viewer.userId) throw new ApiError("CONFLICT", "You already own this profile");
    await tx.execute(sql`
      INSERT INTO role_assignments (user_id, role, scope_type, scope_id, permissions, invitation_id, reason)
      VALUES (${viewer.userId}, 'clinic_coordinator', 'practitioner', ${inv.scope_id}, ${JSON.stringify(inv.permissions)}::jsonb, ${inv.id}, 'invitation_accepted')
      ON CONFLICT DO NOTHING`);
    await tx.execute(sql`UPDATE staff_invitations SET state = 'accepted', accepted_by_user_id = ${viewer.userId}, accepted_at = now() WHERE id = ${inv.id}`);
    await audit({ actorUserId: viewer.userId, action: "team.invite.accept", objectType: "staff_invitation", objectId: inv.id, changedFields: { practitionerId: inv.scope_id } }, tx);
    return inv.scope_id;
  });
}
