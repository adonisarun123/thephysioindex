import { and, eq, isNull, or, gt, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db } from "@/db/client";
import { roleAssignments, users } from "@/db/schema";
import { ApiError } from "@/lib/api";
import { auth } from "./server";

/**
 * Server-side identity and authorisation (IAM-01, IAM-03, SEC-03).
 * Every privileged read or mutation calls one of these helpers; hiding a
 * control in the UI is never sufficient.
 */

export type RoleName =
  | "patient"
  | "practitioner"
  | "clinic_coordinator"
  | "clinic_manager"
  | "clinic_owner"
  | "verification_reviewer"
  | "support_agent"
  | "analyst"
  | "super_admin";

export type Grant = { role: RoleName; scopeType: "global" | "practitioner" | "clinic" | "branch" | "case"; scopeId: string | null; permissions: string[] };

export type Viewer = {
  authUserId: string;
  userId: string; // application users.id
  name: string | null;
  email: string | null;
  mobile: string | null;
  mobileVerified: boolean;
  kind: "patient" | "practitioner" | "staff";
  twoFactorEnabled: boolean;
  grants: Grant[];
  sessionId: string;
  sessionCreatedAt: Date;
};

export const STAFF_ROLES: RoleName[] = ["verification_reviewer", "support_agent", "analyst", "super_admin"];

/** Current viewer or null. Cached per request. */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const u = session.user as typeof session.user & { phoneNumber?: string | null; phoneNumberVerified?: boolean | null; kind?: string | null; twoFactorEnabled?: boolean | null };
  const [appUser] = await db().select({ id: users.id, status: users.status }).from(users).where(eq(users.authSubject, u.id)).limit(1);
  if (!appUser || appUser.status !== "active") return null;
  const grants = await db()
    .select({ role: roleAssignments.role, scopeType: roleAssignments.scopeType, scopeId: roleAssignments.scopeId, permissions: roleAssignments.permissions })
    .from(roleAssignments)
    .where(and(eq(roleAssignments.userId, appUser.id), isNull(roleAssignments.revokedAt), or(isNull(roleAssignments.expiresAt), gt(roleAssignments.expiresAt, sql`now()`))));
  const kind = (u.kind as Viewer["kind"]) ?? (grants.some((g) => STAFF_ROLES.includes(g.role)) ? "staff" : grants.some((g) => g.role === "practitioner") ? "practitioner" : "patient");
  return {
    authUserId: u.id,
    userId: appUser.id,
    name: u.name ?? null,
    email: u.email?.endsWith("@phone.thephysioindex.invalid") ? null : (u.email ?? null),
    mobile: u.phoneNumber ?? null,
    mobileVerified: Boolean(u.phoneNumberVerified),
    kind,
    twoFactorEnabled: Boolean(u.twoFactorEnabled),
    grants: grants as Grant[],
    sessionId: session.session.id,
    sessionCreatedAt: new Date(session.session.createdAt),
  };
});

export function hasRole(v: Viewer, role: RoleName, scope?: { scopeType: Grant["scopeType"]; scopeId: string }) {
  if (v.grants.some((g) => g.role === "super_admin")) return true;
  return v.grants.some((g) => g.role === role && (!scope || g.scopeType === "global" || (g.scopeType === scope.scopeType && g.scopeId === scope.scopeId)));
}

export function isStaff(v: Viewer) {
  return v.grants.some((g) => STAFF_ROLES.includes(g.role));
}

/** Pages: redirect to sign-in when anonymous. */
export async function requireViewer(next?: string): Promise<Viewer> {
  const v = await getViewer();
  if (!v) redirect(`/sign-in${next ? `?next=${encodeURIComponent(next)}` : ""}`);
  return v;
}

/** Pages: staff area. Requires a staff role and completed TOTP enrolment (IAM-03, SEC-02). */
export async function requireStaff(role?: RoleName, next?: string): Promise<Viewer> {
  const v = await getViewer();
  if (!v) redirect(`/admin/sign-in${next ? `?next=${encodeURIComponent(next)}` : ""}`);
  if (!isStaff(v)) redirect("/account?error=not_staff");
  if (mfaRequired() && !v.twoFactorEnabled) redirect("/admin/security?enrol=1");
  if (role && !hasRole(v, role)) redirect("/admin?error=forbidden");
  return v;
}

/** API: throw catalogue errors instead of redirecting. */
export async function apiViewer(): Promise<Viewer> {
  const v = await getViewer();
  if (!v) throw new ApiError("UNAUTHENTICATED", "Sign in to continue");
  return v;
}

export async function apiStaff(role?: RoleName): Promise<Viewer> {
  const v = await apiViewer();
  if (!isStaff(v)) throw new ApiError("UNAUTHORISED", "Staff access required");
  if (mfaRequired() && !v.twoFactorEnabled) throw new ApiError("UNAUTHORISED", "Multi-factor authentication must be enabled");
  if (role && !hasRole(v, role)) throw new ApiError("UNAUTHORISED", "Insufficient role");
  return v;
}

export function mfaRequired() {
  return process.env.STAFF_MFA_REQUIRED !== "0";
}

/** Practitioner ownership or an explicit coordinator grant for that practitioner (IAM-01). */
export async function canManagePractitioner(v: Viewer, practitionerId: string): Promise<boolean> {
  if (hasRole(v, "super_admin")) return true;
  const res = await db().execute<{ owner_user_id: string | null }>(sql`SELECT owner_user_id FROM practitioners WHERE id = ${practitionerId}`);
  const row = res.rows[0];
  if (!row) return false;
  if (row.owner_user_id === v.userId) return true;
  return v.grants.some((g) => (g.role === "clinic_coordinator" || g.role === "clinic_manager" || g.role === "clinic_owner") && g.scopeType === "practitioner" && g.scopeId === practitionerId);
}

/** Recent reauthentication for sensitive actions: session younger than N minutes (IAM-03). */
export function recentlyAuthenticated(v: Viewer, maxAgeMinutes = 30) {
  return Date.now() - v.sessionCreatedAt.getTime() < maxAgeMinutes * 60_000;
}
