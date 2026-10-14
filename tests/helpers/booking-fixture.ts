import { randomUUID } from "node:crypto";
import { Pool } from "pg";

/**
 * Integration fixtures for the booking engine. Requires TEST_DATABASE_URL
 * pointing at a disposable, migrated database (never production). Every row
 * is a TEST record; each test file builds its own practitioner.
 */

export const TEST_DB = process.env.TEST_DATABASE_URL;

export function useTestDatabase() {
  if (!TEST_DB) return;
  if (/neon\.tech/.test(TEST_DB) && !/dev|test/i.test(TEST_DB)) throw new Error("refusing to run booking integration tests against a non-test Neon endpoint");
  process.env.DATABASE_URL = TEST_DB;
  process.env.DB_POOL_MAX = process.env.DB_POOL_MAX ?? "70";
  process.env.SHOW_TEST_ACCOUNTS = "1";
}

let pool: Pool | undefined;
export function admin(): Pool {
  pool ??= new Pool({ connectionString: TEST_DB, max: 5 });
  return pool;
}

export async function q<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  const r = await admin().query(text, params);
  return r.rows as T[];
}

const ALPHA = "23456789abcdefghjkmnpqrstuvwxyz";
function pid() {
  let s = "";
  for (let i = 0; i < 8; i++) s += ALPHA[Math.floor(Math.random() * ALPHA.length)];
  return s;
}

export type Fixture = {
  practitionerId: string;
  resourceId: string;
  branchId: string;
  offeringId: string;
  offeringVersionId: string;
  serviceId: string;
  practitionerBranchId: string;
  clinicId: string;
};

/** A bookable practitioner open every day 00:00–24:00 at one branch, 30 min + 10 min after-buffer, no notice. */
export async function makePractitioner(opts: { basePaise?: number; taxPaise?: number; durationMin?: number } = {}): Promise<Fixture> {
  const [geo] = await q<{ locality_id: string; city_id: string; state_id: string }>(
    `SELECT l.id AS locality_id, l.city_id, c.state_id FROM localities l JOIN cities c ON c.id = l.city_id LIMIT 1`,
  );
  const [svc] = await q<{ id: string }>(`SELECT id FROM services WHERE code = 'initial_assessment'`);
  const [pol] = await q<{ id: string }>(`SELECT id FROM policies WHERE type = 'cancellation' AND key = 'default' ORDER BY effective_at DESC LIMIT 1`);
  const [p] = await q<{ id: string }>(
    `INSERT INTO practitioners (public_id, slug, claim_state, listing_status, booking_eligible, display_name, designation, is_test_account, published_at)
     VALUES ($1, $2, 'claimed', 'published', true, 'TEST Engine Physio', 'Physiotherapist', true, now()) RETURNING id`,
    [pid(), `test-engine-${randomUUID().slice(0, 8)}`],
  );
  const [cr] = await q<{ id: string }>(`INSERT INTO calendar_resources (practitioner_id) VALUES ($1) RETURNING id`, [p.id]);
  const [clinic] = await q<{ id: string }>(
    `INSERT INTO clinics (public_id, slug, name, status) VALUES ($1, $2, 'TEST Engine Clinic', 'published') RETURNING id`,
    [pid(), `test-engine-clinic-${randomUUID().slice(0, 8)}`],
  );
  const [branch] = await q<{ id: string }>(
    `INSERT INTO branches (clinic_id, name, address_line1, locality_id, city_id, state_id, pin_code, status)
     VALUES ($1, 'Main', '1 Test Road', $2, $3, $4, '560001', 'published') RETURNING id`,
    [clinic.id, geo.locality_id, geo.city_id, geo.state_id],
  );
  const [pb] = await q<{ id: string }>(
    `INSERT INTO practitioner_branches (practitioner_id, branch_id, state, bookable) VALUES ($1, $2, 'approved', true) RETURNING id`,
    [p.id, branch.id],
  );
  const [o] = await q<{ id: string }>(
    `INSERT INTO offerings (practitioner_branch_id, practitioner_id, branch_id, service_id, mode, display_name, active)
     VALUES ($1, $2, $3, $4, 'clinic', 'Assessment', true) RETURNING id`,
    [pb.id, p.id, branch.id, svc.id],
  );
  const [ov] = await q<{ id: string }>(
    `INSERT INTO offering_versions (offering_id, version, duration_min, interval_min, buffer_before_min, buffer_after_min, base_price_paise, tax_paise,
       booking_horizon_days, min_notice_min, booking_mode, cancellation_policy_id, active_from)
     VALUES ($1, 1, $2, 15, 0, 10, $3, $4, 60, 0, 'instant', $5, current_date - 1) RETURNING id`,
    [o.id, opts.durationMin ?? 30, opts.basePaise ?? 100000, opts.taxPaise ?? 0, pol.id],
  );
  await q(`UPDATE offerings SET current_version_id = $1 WHERE id = $2`, [ov.id, o.id]);
  await q(
    `INSERT INTO availability_rules (resource_id, branch_id, weekday, local_start, local_end, schedule_version, effective_from)
     SELECT $1, $2, d, '00:00', '24:00', 1, current_date - 1 FROM generate_series(0, 6) d`,
    [cr.id, branch.id],
  );
  return { practitionerId: p.id, resourceId: cr.id, branchId: branch.id, offeringId: o.id, offeringVersionId: ov.id, serviceId: svc.id, practitionerBranchId: pb.id, clinicId: clinic.id };
}

/** A user with their own adult patient record. */
export async function makePatientUser(): Promise<{ userId: string; patientId: string }> {
  const [u] = await q<{ id: string }>(`INSERT INTO users (auth_subject, display_name, is_test_account) VALUES ($1, 'TEST Patient', true) RETURNING id`, [`test-${randomUUID()}`]);
  const [p] = await q<{ id: string }>(
    `INSERT INTO patients (account_user_id, display_name, age_band, created_by_user_id, is_test_account) VALUES ($1, 'TEST Patient', 'adult', $1, true) RETURNING id`,
    [u.id],
  );
  return { userId: u.id, patientId: p.id };
}

/** A local IST date N days from today, and an instant at HH:MM on it. */
export function istDate(daysAhead: number): string {
  return new Date(Date.now() + 330 * 60_000 + daysAhead * 86_400_000).toISOString().slice(0, 10);
}

export function istInstant(date: string, hhmm: string): string {
  return new Date(`${date}T${hhmm}:00+05:30`).toISOString();
}

export function key(): string {
  return `test-${randomUUID()}`;
}

export async function closeFixtures() {
  await pool?.end();
  pool = undefined;
  await globalThis.__tpiPool?.end();
  globalThis.__tpiPool = undefined;
}
