import { sql } from "drizzle-orm";
import { z } from "zod";
import { db, withTransaction, type Db } from "@/db/client";
import { ApiError } from "@/lib/api";
import { audit } from "@/lib/audit";

/**
 * Session packages (addendum PKG-01..04). A practice-side ledger: packages are
 * sold and paid at the clinic, never online, and are not shown on public
 * pages. Sessions and price are snapshots at sale; money is integer paise
 * (OFR-02). Every query is scoped by practitioner id (IAM-01).
 */

export const PAYMENT_MODES = [
  { key: "cash", label: "Cash" },
  { key: "upi", label: "UPI" },
  { key: "card", label: "Card" },
  { key: "bank", label: "Bank transfer" },
  { key: "other", label: "Other" },
] as const;
type PaymentMode = (typeof PAYMENT_MODES)[number]["key"];
const MODE_KEYS = PAYMENT_MODES.map((m) => m.key) as [PaymentMode, ...PaymentMode[]];

export const TemplateSchema = z.object({
  name: z.string().trim().min(3, "Name is too short").max(80),
  sessions: z.number().int().min(2, "A package has at least 2 sessions").max(100),
  pricePaise: z.number().int().min(0).max(100_000_000),
  validityDays: z.number().int().min(7, "Validity is at least 7 days").max(730),
});
export type TemplateInput = z.infer<typeof TemplateSchema>;

export const SaleSchema = z.object({
  templateId: z.uuid(),
  patientLabel: z.string().trim().min(1, "Enter the patient's first name or initials").max(40, "Use a first name or initials only"),
  paidPaise: z.number().int().min(0),
  paymentMode: z.enum(MODE_KEYS).optional(),
  startsOn: z.iso.date(),
  note: z.string().trim().max(500).optional(),
});
export type SaleInput = z.infer<typeof SaleSchema>;

export type PackageTemplate = { id: string; name: string; sessions: number; pricePaise: number; validityDays: number; sold: number };

export async function listTemplates(practitionerId: string): Promise<PackageTemplate[]> {
  const res = await db().execute<{ id: string; name: string; sessions: number; price_paise: number; validity_days: number; sold: number }>(sql`
    SELECT t.id, t.name, t.sessions, t.price_paise, t.validity_days,
           (SELECT count(*)::int FROM patient_packages pp WHERE pp.template_id = t.id) AS sold
    FROM package_templates t WHERE t.practitioner_id = ${practitionerId} AND t.is_active ORDER BY t.created_at`);
  return res.rows.map((r) => ({ id: r.id, name: r.name, sessions: r.sessions, pricePaise: r.price_paise, validityDays: r.validity_days, sold: r.sold }));
}

export async function createTemplate(practitionerId: string, actorUserId: string, input: TemplateInput): Promise<string> {
  const res = await db().execute<{ id: string }>(sql`
    INSERT INTO package_templates (practitioner_id, name, sessions, price_paise, validity_days, created_by)
    VALUES (${practitionerId}, ${input.name}, ${input.sessions}, ${input.pricePaise}, ${input.validityDays}, ${actorUserId}) RETURNING id`);
  await audit({ actorUserId, action: "package_template.create", objectType: "package_template", objectId: res.rows[0].id, changedFields: { ...input } });
  return res.rows[0].id;
}

/** Retiring stops new sales; packages already sold are unaffected (snapshots). */
export async function retireTemplate(practitionerId: string, actorUserId: string, templateId: string): Promise<void> {
  const res = await db().execute(sql`UPDATE package_templates SET is_active = false WHERE id = ${templateId} AND practitioner_id = ${practitionerId} AND is_active`);
  if (res.rowCount === 0) throw new ApiError("NOT_FOUND", "Package not found");
  await audit({ actorUserId, action: "package_template.retire", objectType: "package_template", objectId: templateId });
}

/** PKG-02: sell a package; copies sessions, price and validity from the template. */
export async function sellPackage(practitionerId: string, actorUserId: string, input: SaleInput): Promise<string> {
  return withTransaction(async (_c, tx) => {
    const t = (await tx.execute<{ name: string; sessions: number; price_paise: number; validity_days: number }>(sql`
      SELECT name, sessions, price_paise, validity_days FROM package_templates WHERE id = ${input.templateId} AND practitioner_id = ${practitionerId} AND is_active`)).rows[0];
    if (!t) throw new ApiError("INVALID_INPUT", "Choose one of your packages");
    if (input.paidPaise > t.price_paise) throw new ApiError("INVALID_INPUT", "Amount paid cannot be more than the package price");
    const res = await tx.execute<{ id: string }>(sql`
      INSERT INTO patient_packages (practitioner_id, template_id, name, patient_label, sessions_total, price_paise, paid_paise, payment_mode, starts_on, expires_on, note, created_by)
      VALUES (${practitionerId}, ${input.templateId}, ${t.name}, ${input.patientLabel}, ${t.sessions}, ${t.price_paise}, ${input.paidPaise}, ${input.paymentMode ?? null},
              ${input.startsOn}::date, ${input.startsOn}::date + ${t.validity_days}::int, ${input.note ?? null}, ${actorUserId})
      RETURNING id`);
    await audit({ actorUserId, action: "patient_package.sell", objectType: "patient_package", objectId: res.rows[0].id, changedFields: { templateId: input.templateId, paidPaise: input.paidPaise } }, tx);
    return res.rows[0].id;
  });
}

export type SoldPackage = {
  id: string;
  name: string;
  patientLabel: string;
  sessionsTotal: number;
  used: number;
  pricePaise: number;
  paidPaise: number;
  paymentMode: string | null;
  startsOn: string;
  expiresOn: string;
  state: "active" | "closed";
  expired: boolean;
  lastUsedOn: string | null;
  note: string | null;
};

export type PackageFilter = "active" | "closed";

/** PKG-04: sold packages with sessions left, balance due and expiry. "active" excludes closed ones; expired ones stay visible until closed. */
export async function listSold(practitionerId: string, filter: PackageFilter): Promise<SoldPackage[]> {
  const res = await db().execute<{
    id: string; name: string; patient_label: string; sessions_total: number; used: number; price_paise: number; paid_paise: number; payment_mode: string | null;
    starts_on: string; expires_on: string; state: "active" | "closed"; expired: boolean; last_used_on: string | null; note: string | null;
  }>(sql`
    SELECT pp.id, pp.name, pp.patient_label, pp.sessions_total, pp.price_paise, pp.paid_paise, pp.payment_mode, pp.starts_on::text AS starts_on,
           pp.expires_on::text AS expires_on, pp.state, pp.note,
           pp.expires_on < (now() AT TIME ZONE 'Asia/Kolkata')::date AS expired,
           (SELECT count(*)::int FROM package_session_uses u WHERE u.package_id = pp.id) AS used,
           (SELECT max(u.used_on)::text FROM package_session_uses u WHERE u.package_id = pp.id) AS last_used_on
    FROM patient_packages pp
    WHERE pp.practitioner_id = ${practitionerId} AND pp.state = ${filter}
    ORDER BY pp.expires_on, pp.created_at
    LIMIT 300`);
  return res.rows.map((r) => ({
    id: r.id, name: r.name, patientLabel: r.patient_label, sessionsTotal: r.sessions_total, used: r.used, pricePaise: r.price_paise, paidPaise: r.paid_paise,
    paymentMode: r.payment_mode, startsOn: r.starts_on, expiresOn: r.expires_on, state: r.state, expired: r.expired, lastUsedOn: r.last_used_on, note: r.note,
  }));
}

async function lockPackage(tx: Db, practitionerId: string, packageId: string) {
  const p = (await tx.execute<{ id: string; sessions_total: number; state: string; expired: boolean; price_paise: number; paid_paise: number }>(sql`
    SELECT id, sessions_total, state, expires_on < (now() AT TIME ZONE 'Asia/Kolkata')::date AS expired, price_paise, paid_paise
    FROM patient_packages WHERE id = ${packageId} AND practitioner_id = ${practitionerId} FOR UPDATE`)).rows[0];
  if (!p) throw new ApiError("NOT_FOUND", "Package not found");
  return p;
}

/** PKG-03: use one session. The row lock serialises concurrent clicks so a package is never over-used. */
export async function recordSessionUse(practitionerId: string, actorUserId: string, packageId: string, usedOn: string, note?: string): Promise<{ remaining: number }> {
  return withTransaction(async (_c, tx) => {
    const p = await lockPackage(tx, practitionerId, packageId);
    if (p.state !== "active") throw new ApiError("CONFLICT", "This package is closed");
    if (p.expired) throw new ApiError("CONFLICT", "This package has expired. Extend it or sell a new one.");
    const used = Number((await tx.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM package_session_uses WHERE package_id = ${packageId}`)).rows[0].n);
    if (used >= p.sessions_total) throw new ApiError("CONFLICT", "All sessions in this package are used");
    await tx.execute(sql`INSERT INTO package_session_uses (package_id, used_on, note, created_by) VALUES (${packageId}, ${usedOn}::date, ${note ?? null}, ${actorUserId})`);
    await audit({ actorUserId, action: "patient_package.use_session", objectType: "patient_package", objectId: packageId, changedFields: { usedOn } }, tx);
    return { remaining: p.sessions_total - used - 1 };
  });
}

/** PKG-03: undo the most recent session use (mis-clicks). */
export async function undoLastSession(practitionerId: string, actorUserId: string, packageId: string): Promise<void> {
  await withTransaction(async (_c, tx) => {
    await lockPackage(tx, practitionerId, packageId);
    const res = await tx.execute<{ used_on: string }>(sql`
      DELETE FROM package_session_uses WHERE id = (SELECT id FROM package_session_uses WHERE package_id = ${packageId} ORDER BY created_at DESC, id DESC LIMIT 1)
      RETURNING used_on::text AS used_on`);
    if (!res.rows[0]) throw new ApiError("CONFLICT", "No sessions to undo");
    await audit({ actorUserId, action: "patient_package.undo_session", objectType: "patient_package", objectId: packageId, changedFields: { usedOn: res.rows[0].used_on } }, tx);
  });
}

/** PKG-02: record a further payment towards the balance. */
export async function recordPayment(practitionerId: string, actorUserId: string, packageId: string, amountPaise: number, mode?: PaymentMode): Promise<void> {
  if (!Number.isInteger(amountPaise) || amountPaise <= 0) throw new ApiError("INVALID_INPUT", "Enter the amount received");
  await withTransaction(async (_c, tx) => {
    const p = await lockPackage(tx, practitionerId, packageId);
    if (p.paid_paise + amountPaise > p.price_paise) throw new ApiError("INVALID_INPUT", "That is more than the balance due");
    await tx.execute(sql`UPDATE patient_packages SET paid_paise = paid_paise + ${amountPaise}::int, payment_mode = coalesce(${mode ?? null}, payment_mode) WHERE id = ${packageId}`);
    await audit({ actorUserId, action: "patient_package.payment", objectType: "patient_package", objectId: packageId, changedFields: { amountPaise, mode: mode ?? null } }, tx);
  });
}

/** PKG-04: extend validity (e.g. the patient was unwell). */
export async function extendPackage(practitionerId: string, actorUserId: string, packageId: string, days: number): Promise<void> {
  if (!Number.isInteger(days) || days < 1 || days > 365) throw new ApiError("INVALID_INPUT", "Extend by 1 to 365 days");
  const res = await db().execute(sql`
    UPDATE patient_packages SET expires_on = greatest(expires_on, (now() AT TIME ZONE 'Asia/Kolkata')::date) + ${days}::int
    WHERE id = ${packageId} AND practitioner_id = ${practitionerId} AND state = 'active'`);
  if (res.rowCount === 0) throw new ApiError("NOT_FOUND", "Active package not found");
  await audit({ actorUserId, action: "patient_package.extend", objectType: "patient_package", objectId: packageId, changedFields: { days } });
}

export async function setPackageClosed(practitionerId: string, actorUserId: string, packageId: string, closed: boolean): Promise<void> {
  const res = await db().execute(sql`UPDATE patient_packages SET state = ${closed ? "closed" : "active"} WHERE id = ${packageId} AND practitioner_id = ${practitionerId}`);
  if (res.rowCount === 0) throw new ApiError("NOT_FOUND", "Package not found");
  await audit({ actorUserId, action: closed ? "patient_package.close" : "patient_package.reopen", objectType: "patient_package", objectId: packageId });
}

/** Per-session price for display, rounded down to whole rupees. */
export function perSessionPaise(pricePaise: number, sessions: number): number {
  return sessions > 0 ? Math.floor(pricePaise / sessions / 100) * 100 : 0;
}
