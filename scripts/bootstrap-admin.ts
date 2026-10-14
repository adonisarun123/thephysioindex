/**
 * Creates (or promotes) the first super administrator (IAM-02, IAM-03).
 * Staff accounts sign in with an email OTP and must enrol TOTP before the
 * admin area opens. Idempotent.
 *
 *   npm run admin:bootstrap -- --email you@example.com --name "Full Name"
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: [".env.local", ".env"] });
import { Pool } from "pg";

const args = process.argv.slice(2);
const email = (args[args.indexOf("--email") + 1] ?? "").toLowerCase().trim();
const name = args[args.indexOf("--name") + 1] ?? "Administrator";
if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  console.error("usage: bootstrap-admin --email <email> [--name <name>]");
  process.exit(1);
}

export const BOOTSTRAP_ADMIN_SQL = (email: string, name: string) => `
WITH au AS (
  INSERT INTO auth."user" (name, email, email_verified, kind, created_at, updated_at)
  VALUES ('${name.replace(/'/g, "''")}', '${email}', true, 'staff', now(), now())
  ON CONFLICT (email) DO UPDATE SET kind = 'staff', email_verified = true, updated_at = now()
  RETURNING id
), u AS (
  INSERT INTO users (auth_subject, email, email_verified_at, display_name)
  SELECT au.id::text, '${email}', now(), '${name.replace(/'/g, "''")}' FROM au
  ON CONFLICT (auth_subject) DO UPDATE SET email = EXCLUDED.email, email_verified_at = coalesce(users.email_verified_at, now())
  RETURNING id
)
INSERT INTO role_assignments (user_id, role, scope_type, reason)
SELECT u.id, 'super_admin', 'global', 'bootstrap' FROM u
ON CONFLICT DO NOTHING;
`;

async function main() {
  const url = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("No database URL");
  const pool = new Pool({ connectionString: url, max: 1 });
  await pool.query(BOOTSTRAP_ADMIN_SQL(email, name));
  console.log(`[bootstrap-admin] ${email} is a super administrator. They sign in at /admin/sign-in and enrol an authenticator.`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
