import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { createAuthMiddleware } from "better-auth/api";
import { deleteSessionCookie } from "better-auth/cookies";
import { generateRandomString } from "better-auth/crypto";
import { nextCookies } from "better-auth/next-js";
import { emailOTP, phoneNumber, twoFactor } from "better-auth/plugins";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import * as appSchema from "@/db/schema";
import * as authSchema from "@/db/schema/auth";
import { email } from "@/lib/messaging/email";
import { normaliseIndianMobile, sms } from "@/lib/messaging/sms";

/**
 * Authentication (IAM-06, IAM-07, SEC-02).
 *
 * - Patients and practitioners sign in with a mobile OTP (phone-number plugin).
 * - Staff sign in with an email OTP and must complete TOTP MFA (two-factor
 *   plugin); admin routes enforce the MFA requirement server-side.
 * - OTPs are single use, expire after platform_config otp.ttl_seconds (default
 *   300) and lock after otp.max_attempts (default 5). Error messages never
 *   disclose whether a number already has an account.
 * - Auth tables live in the `auth` schema; the app `users` row is created from
 *   a database hook and references the auth user by auth_subject.
 */
const OTP_TTL_SECONDS = Number(process.env.OTP_TTL_SECONDS ?? 300);

/** Public origin of this deployment: explicit env, else Vercel's branch/deployment host, else local dev. */
function resolveBaseUrl(): string {
  if (process.env.BETTER_AUTH_URL) return process.env.BETTER_AUTH_URL;
  if (process.env.VERCEL_ENV === "production" && process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (process.env.VERCEL_BRANCH_URL) return `https://${process.env.VERCEL_BRANCH_URL}`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}
const OTP_MAX_ATTEMPTS = Number(process.env.OTP_MAX_ATTEMPTS ?? 5);

export const auth = betterAuth({
  appName: "The Physio Index",
  baseURL: resolveBaseUrl(),
  // Preview deployments are served from several *.vercel.app hosts (deployment and branch aliases).
  trustedOrigins: process.env.VERCEL_ENV === "preview" ? ["https://*.vercel.app"] : [],
  secret: process.env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db(), { provider: "pg", schema: authSchema }),
  emailAndPassword: { enabled: false },
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
    cookieCache: { enabled: true, maxAge: 60 }, // short: role/kind changes (onboarding, staff grants) must show within a minute
  },
  advanced: {
    database: { generateId: "uuid" },
    cookiePrefix: "tpi",
    useSecureCookies: process.env.NODE_ENV === "production",
  },
  rateLimit: {
    enabled: true,
    window: 60,
    max: 30,
    storage: "database",
    customRules: {
      "/phone-number/send-otp": { window: 60, max: 3 },
      "/phone-number/verify": { window: 300, max: OTP_MAX_ATTEMPTS },
      "/email-otp/send-verification-otp": { window: 60, max: 3 },
      "/sign-in/email-otp": { window: 300, max: OTP_MAX_ATTEMPTS },
    },
  },
  user: {
    additionalFields: {
      kind: { type: "string", required: false, defaultValue: "patient", input: false }, // patient | practitioner | staff
    },
  },
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          // Mirror into the application users table (Section 20). No secrets are copied (IAM-06).
          const phone = (user as { phoneNumber?: string | null }).phoneNumber ?? null;
          await db()
            .insert(appSchema.users)
            .values({
              authSubject: user.id,
              mobile: phone,
              email: user.email?.endsWith("@phone.thephysioindex.invalid") ? null : user.email,
              displayName: user.name,
            })
            .onConflictDoNothing();
        },
      },
      update: {
        after: async (user) => {
          const u = user as { id: string; phoneNumber?: string | null; phoneNumberVerified?: boolean; email?: string; emailVerified?: boolean; name?: string };
          await db().execute(sql`
            UPDATE users SET
              mobile = coalesce(${u.phoneNumber ?? null}, mobile),
              mobile_verified_at = CASE WHEN ${u.phoneNumberVerified ?? false} AND mobile_verified_at IS NULL THEN now() ELSE mobile_verified_at END,
              email = CASE WHEN ${u.email ?? null} LIKE '%@phone.thephysioindex.invalid' THEN email ELSE coalesce(${u.email ?? null}, email) END,
              email_verified_at = CASE WHEN ${u.emailVerified ?? false} AND email_verified_at IS NULL THEN now() ELSE email_verified_at END,
              display_name = coalesce(${u.name ?? null}, display_name)
            WHERE auth_subject = ${u.id}
          `);
        },
      },
    },
  },
  hooks: {
    /**
     * The two-factor plugin only challenges credential sign-ins
     * (/sign-in/email, /sign-in/username, /sign-in/phone-number). Staff sign in
     * with an email OTP, so without this hook an email inbox alone would open
     * the admin area. Replicate the plugin's challenge for /sign-in/email-otp:
     * discard the fresh session, store a pending-2FA record and set the signed
     * two_factor cookie that /two-factor/verify-totp consumes (IAM-05, SEC-02).
     */
    after: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/sign-in/email-otp") return;
      const data = ctx.context.newSession;
      if (!data?.user || !(data.user as { twoFactorEnabled?: boolean | null }).twoFactorEnabled) return;
      deleteSessionCookie(ctx, true);
      await ctx.context.internalAdapter.deleteSession(data.session.token);
      ctx.context.setNewSession(null);
      const maxAge = 600;
      const twoFactorCookie = ctx.context.createAuthCookie("two_factor", { maxAge });
      const identifier = `2fa-${generateRandomString(20)}`;
      const expiresAt = new Date(Date.now() + maxAge * 1000);
      await ctx.context.internalAdapter.createVerificationValue({ value: data.user.id, identifier, expiresAt });
      await ctx.context.internalAdapter.createVerificationValue({ value: "0", identifier: `2fa-attempts-${identifier}`, expiresAt });
      await ctx.setSignedCookie(twoFactorCookie.name, identifier, ctx.context.secret, twoFactorCookie.attributes);
      return ctx.json({ twoFactorRedirect: true, twoFactorMethods: ["totp"] });
    }),
  },
  plugins: [
    phoneNumber({
      otpLength: 6,
      expiresIn: OTP_TTL_SECONDS,
      allowedAttempts: OTP_MAX_ATTEMPTS,
      requireVerification: true,
      phoneNumberValidator: (p) => normaliseIndianMobile(p) !== null,
      sendOTP: async ({ phoneNumber: phone, code }) => {
        const e164 = normaliseIndianMobile(phone) ?? phone;
        await sms().sendOtp(e164, code);
      },
      signUpOnVerification: {
        getTempEmail: (phone) => `${phone.replace(/[^\d]/g, "")}@phone.thephysioindex.invalid`,
        getTempName: () => "Patient",
      },
    }),
    emailOTP({
      otpLength: 6,
      expiresIn: OTP_TTL_SECONDS,
      allowedAttempts: OTP_MAX_ATTEMPTS,
      disableSignUp: true, // staff accounts are created by an administrator (IAM-02)
      sendVerificationOTP: async ({ email: to, otp, type }) => {
        const subject = type === "sign-in" ? "Your The Physio Index sign-in code" : "Your The Physio Index verification code";
        await email().send(to, subject, `Your code is ${otp}. It expires in ${Math.round(OTP_TTL_SECONDS / 60)} minutes. If you did not request this, ignore this email.`);
      },
    }),
    twoFactor({
      issuer: "The Physio Index",
      skipVerificationOnEnable: false,
      allowPasswordless: true, // staff have no password; enrolment requires a fresh OTP session instead (IAM-03)
    }),
    nextCookies(),
  ],
});

export type Session = typeof auth.$Infer.Session;
