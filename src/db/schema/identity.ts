import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { id, timestamps } from "./_common";
import {
  ageBand,
  guardianVerification,
  invitationState,
  patientStatus,
  roleName,
  scopeType,
  userStatus,
} from "./enums";

/**
 * Application user. Authentication (credentials, sessions, OTP) lives in the
 * Better Auth tables under the `auth` schema; `auth_subject` references the
 * auth user id. No secrets are stored here (IAM-06).
 */
export const users = pgTable(
  "users",
  {
    id: id(),
    authSubject: text("auth_subject").notNull(),
    mobile: text("mobile"),
    mobileVerifiedAt: timestamp("mobile_verified_at", { withTimezone: true }),
    email: text("email"),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    displayName: text("display_name"),
    status: userStatus("status").notNull().default("active"),
    isTestAccount: boolean("is_test_account").notNull().default(false),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("users_auth_subject_uq").on(t.authSubject),
    // Verified login identifiers are unique (Section 20).
    uniqueIndex("users_mobile_verified_uq").on(t.mobile).where(sql`${t.mobileVerifiedAt} IS NOT NULL`),
    uniqueIndex("users_email_verified_uq").on(sql`lower(${t.email})`).where(sql`${t.emailVerifiedAt} IS NOT NULL`),
  ],
);

/** Role grants with explicit scope (IAM-01, IAM-02). Global roles have no scope_id. */
export const roleAssignments = pgTable(
  "role_assignments",
  {
    id: id(),
    userId: uuid("user_id").notNull().references(() => users.id),
    role: roleName("role").notNull(),
    scopeType: scopeType("scope_type").notNull().default("global"),
    scopeId: uuid("scope_id"),
    permissions: jsonb("permissions").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    grantedByUserId: uuid("granted_by_user_id").references(() => users.id),
    invitationId: uuid("invitation_id"),
    reason: text("reason"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedByUserId: uuid("revoked_by_user_id").references(() => users.id),
    ...timestamps,
  },
  (t) => [
    index("role_assignments_user_idx").on(t.userId, t.role),
    index("role_assignments_scope_idx").on(t.scopeType, t.scopeId),
    uniqueIndex("role_assignments_active_uq")
      .on(t.userId, t.role, t.scopeType, sql`coalesce(${t.scopeId}, '00000000-0000-0000-0000-000000000000'::uuid)`)
      .where(sql`${t.revokedAt} IS NULL`),
  ],
);

/** Staff invitations: scope, expiry and permission set (IAM-02). */
export const staffInvitations = pgTable(
  "staff_invitations",
  {
    id: id(),
    invitedByUserId: uuid("invited_by_user_id").notNull().references(() => users.id),
    inviteeMobile: text("invitee_mobile"),
    inviteeEmail: text("invitee_email"),
    role: roleName("role").notNull(),
    scopeType: scopeType("scope_type").notNull(),
    scopeId: uuid("scope_id"),
    permissions: jsonb("permissions").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    tokenHash: text("token_hash").notNull(),
    state: invitationState("state").notNull().default("pending"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedByUserId: uuid("accepted_by_user_id").references(() => users.id),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [uniqueIndex("staff_invitations_token_uq").on(t.tokenHash)],
);

/**
 * Patient identity is distinct from login (Section 20). Supports dependants,
 * staff-entered walk-ins and guardian-managed records.
 */
export const patients = pgTable(
  "patients",
  {
    id: id(),
    accountUserId: uuid("account_user_id").references(() => users.id),
    displayName: text("display_name").notNull(),
    mobile: text("mobile"),
    mobileVerifiedAt: timestamp("mobile_verified_at", { withTimezone: true }),
    ageBand: ageBand("age_band"),
    status: patientStatus("status").notNull().default("active"),
    mergedIntoPatientId: uuid("merged_into_patient_id"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id),
    isTestAccount: boolean("is_test_account").notNull().default(false),
    ...timestamps,
  },
  (t) => [
    index("patients_account_user_idx").on(t.accountUserId),
    index("patients_mobile_idx").on(t.mobile),
  ],
);

/** Explicit guardian authority over a patient record; never inferred (BKG-16). */
export const guardianLinks = pgTable(
  "guardian_links",
  {
    id: id(),
    guardianUserId: uuid("guardian_user_id").notNull().references(() => users.id),
    patientId: uuid("patient_id").notNull().references(() => patients.id),
    relationship: text("relationship").notNull(),
    verificationState: guardianVerification("verification_state").notNull().default("self_declared"),
    consentId: uuid("consent_id"),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("guardian_links_active_uq").on(t.guardianUserId, t.patientId).where(sql`${t.revokedAt} IS NULL`),
    index("guardian_links_patient_idx").on(t.patientId),
  ],
);
