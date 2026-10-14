import { sql } from "drizzle-orm";
import { db, type Db } from "@/db/client";
import { normaliseAlias, normaliseRegistrationNumber, slugify } from "@/lib/slug";
import { newPublicId } from "@/lib/public-id";
import { openCase } from "./cases";
import { uuidArray } from "@/lib/sql";

/**
 * Bulk onboarding (ADM-06, PRO-07). Rows are validated against master data,
 * checked for duplicates, and published only as unclaimed drafts with a
 * listing_review case each. Import never verifies or claims a profile.
 */

export const IMPORT_COLUMNS = ["name", "designation", "registration_authority", "registration_number", "clinic", "branch_address", "state", "city", "locality", "pin", "phone", "source_url"] as const;

const ALIASES: Record<string, string> = {
  practitioner: "name",
  full_name: "name",
  authority: "registration_authority",
  issuer: "registration_authority",
  council: "registration_authority",
  number: "registration_number",
  reg_no: "registration_number",
  registration_no: "registration_number",
  clinic_name: "clinic",
  address: "branch_address",
  branch: "branch_address",
  pincode: "pin",
  pin_code: "pin",
  postal_code: "pin",
  mobile: "phone",
  contact: "phone",
  url: "source_url",
  source: "source_url",
};

export function normaliseRecord(r: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(r)) out[ALIASES[k] ?? k] = v;
  return out;
}

export type Resolved = { cityId: string; stateId: string; localityId: string; authorityId: string | null; numberNormalised: string | null };
export type RowCheck = { state: "valid" | "invalid" | "duplicate"; errors: string[]; resolved?: Resolved };

type Lookups = {
  cities: { id: string; stateId: string; stateCode: string; name: string; aliases: string[] }[];
  localities: Map<string, { id: string; name: string; aliases: string[] }[]>; // by cityId
  authorities: { id: string; name: string; shortName: string | null; stateCode: string | null }[];
};

export async function loadLookups(d: Db = db()): Promise<Lookups> {
  const [cities, locs, auths] = await Promise.all([
    d.execute<{ id: string; stateId: string; stateCode: string; name: string; aliases: string[] | null }>(sql`
      SELECT c.id, c.state_id AS "stateId", s.code AS "stateCode", c.name, (SELECT array_agg(alias_normalised) FROM geo_aliases ga WHERE ga.target_type = 'city' AND ga.target_id = c.id) AS aliases
      FROM cities c JOIN states s ON s.id = c.state_id WHERE c.status = 'active'`),
    d.execute<{ id: string; cityId: string; name: string; aliases: string[] | null }>(sql`
      SELECT l.id, l.city_id AS "cityId", l.name, (SELECT array_agg(alias_normalised) FROM geo_aliases ga WHERE ga.target_type = 'locality' AND ga.target_id = l.id) AS aliases FROM localities l WHERE l.status = 'active'`),
    d.execute<{ id: string; name: string; shortName: string | null; stateCode: string | null }>(sql`SELECT a.id, a.name, a.short_name AS "shortName", s.code AS "stateCode" FROM credential_authorities a LEFT JOIN states s ON s.id = a.jurisdiction_state_id WHERE a.active`),
  ]);
  const localities = new Map<string, { id: string; name: string; aliases: string[] }[]>();
  for (const l of locs.rows) {
    const arr = localities.get(l.cityId) ?? [];
    arr.push({ id: l.id, name: l.name, aliases: l.aliases ?? [] });
    localities.set(l.cityId, arr);
  }
  return { cities: cities.rows.map((c) => ({ ...c, aliases: c.aliases ?? [] })), localities, authorities: auths.rows };
}

function matchName(input: string, name: string, aliases: string[]): boolean {
  const n = normaliseAlias(input);
  return n === normaliseAlias(name) || aliases.includes(n);
}

export function validateRow(raw: Record<string, string>, lk: Lookups, seenNumbers: Set<string>): RowCheck {
  const r = normaliseRecord(raw);
  const errors: string[] = [];
  const name = r.name ?? "";
  if (name.length < 2 || name.length > 120) errors.push("name must be 2–120 characters");
  if (!r.clinic) errors.push("clinic is required");
  if (!r.branch_address) errors.push("branch_address is required");
  if (!/^[1-9][0-9]{5}$/.test(r.pin ?? "")) errors.push("pin must be six digits");
  const stateFilter = r.state ? r.state.trim().toUpperCase() : null;
  let cityMatches = lk.cities.filter((c) => matchName(r.city ?? "", c.name, c.aliases));
  if (stateFilter) cityMatches = cityMatches.filter((c) => c.stateCode === stateFilter || normaliseAlias(stateFilter) === normaliseAlias(c.stateCode));
  if (!r.city) errors.push("city is required");
  else if (cityMatches.length === 0) errors.push(`city "${r.city}" not found in master data`);
  else if (cityMatches.length > 1) errors.push(`city "${r.city}" is ambiguous; add a state column (${cityMatches.map((c) => c.stateCode).join(", ")})`);
  const city = cityMatches.length === 1 ? cityMatches[0] : null;
  let localityId: string | null = null;
  if (city) {
    const locs = (lk.localities.get(city.id) ?? []).filter((l) => matchName(r.locality ?? "", l.name, l.aliases) || slugify(l.name) === slugify(r.locality ?? ""));
    if (!r.locality) errors.push("locality is required");
    else if (locs.length === 0) errors.push(`locality "${r.locality}" not found in ${city.name}; add it under Geography first`);
    else localityId = locs[0].id;
  }
  let authorityId: string | null = null;
  let numberNormalised: string | null = null;
  if (r.registration_number) {
    numberNormalised = normaliseRegistrationNumber(r.registration_number);
    const a = lk.authorities.filter((x) => normaliseAlias(x.name) === normaliseAlias(r.registration_authority ?? "") || (x.shortName && normaliseAlias(x.shortName) === normaliseAlias(r.registration_authority ?? "")));
    if (!r.registration_authority) errors.push("registration_authority is required when a number is given");
    else if (a.length === 0) errors.push(`registration_authority "${r.registration_authority}" not found`);
    else authorityId = a[0].id;
  }
  if (r.source_url && !/^https?:\/\//i.test(r.source_url)) errors.push("source_url must start with http(s)://");
  if (errors.length) return { state: "invalid", errors };
  if (authorityId && numberNormalised) {
    const key = `${authorityId}:${numberNormalised}`;
    if (seenNumbers.has(key)) return { state: "duplicate", errors: ["same authority and number appears earlier in this file"], resolved: { cityId: city!.id, stateId: city!.stateId, localityId: localityId!, authorityId, numberNormalised } };
    seenNumbers.add(key);
  }
  return { state: "valid", errors: [], resolved: { cityId: city!.id, stateId: city!.stateId, localityId: localityId!, authorityId, numberNormalised } };
}

/** Duplicate detection against existing data (PRO-05): same issuer+number, or same name with a branch in the same city. */
export async function findExistingDuplicates(d: Db, rows: { rowNo: number; name: string; resolved: Resolved }[]): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  for (const r of rows) {
    if (r.resolved.authorityId && r.resolved.numberNormalised) {
      const res = await d.execute<{ id: string; display_name: string; status: string }>(sql`SELECT p.id, p.display_name, c.status FROM credentials c JOIN practitioners p ON p.id = c.practitioner_id WHERE c.authority_id = ${r.resolved.authorityId} AND c.number_normalised = ${r.resolved.numberNormalised} AND p.listing_status <> 'archived' LIMIT 1`);
      if (res.rows[0]) {
        out.set(r.rowNo, `registration number already on ${res.rows[0].display_name} (${res.rows[0].status})`);
        continue;
      }
    }
    const res = await d.execute<{ id: string; display_name: string }>(sql`
      SELECT p.id, p.display_name FROM practitioners p WHERE lower(p.display_name) = lower(${r.name}) AND p.listing_status <> 'archived'
        AND EXISTS (SELECT 1 FROM practitioner_branches pb JOIN branches b ON b.id = pb.branch_id WHERE pb.practitioner_id = p.id AND b.city_id = ${r.resolved.cityId}) LIMIT 1`);
    if (res.rows[0]) out.set(r.rowNo, `same name with a branch in this city: ${res.rows[0].display_name}`);
  }
  return out;
}

export type BatchRow = { id: string; batchId: string; rowNo: number; raw: Record<string, string>; state: string; errors: string[] | null; practitionerId: string | null };

export async function listBatches() {
  const res = await db().execute<{ id: string; sourceName: string; sourceUrl: string | null; collectedOn: string; permittedUseBasis: string; state: string; rowCount: number; summary: Record<string, unknown> | null; createdBy: string | null; createdAt: Date }>(sql`
    SELECT b.id, b.source_name AS "sourceName", b.source_url AS "sourceUrl", b.collected_on::text AS "collectedOn", b.permitted_use_basis AS "permittedUseBasis", b.state, b.row_count AS "rowCount", b.summary, coalesce(u.display_name, u.email) AS "createdBy", b.created_at AS "createdAt"
    FROM import_batches b LEFT JOIN users u ON u.id = b.created_by_user_id ORDER BY b.created_at DESC LIMIT 100`);
  return res.rows;
}

export async function getBatch(id: string) {
  const [b, rows] = await Promise.all([
    db().execute<{ id: string; sourceName: string; sourceUrl: string | null; collectedOn: string; permittedUseBasis: string; state: string; rowCount: number; summary: Record<string, unknown> | null; createdBy: string | null; createdAt: Date }>(sql`
      SELECT b.id, b.source_name AS "sourceName", b.source_url AS "sourceUrl", b.collected_on::text AS "collectedOn", b.permitted_use_basis AS "permittedUseBasis", b.state, b.row_count AS "rowCount", b.summary, coalesce(u.display_name, u.email) AS "createdBy", b.created_at AS "createdAt"
      FROM import_batches b LEFT JOIN users u ON u.id = b.created_by_user_id WHERE b.id = ${id}`),
    db().execute<BatchRow>(sql`SELECT id, batch_id AS "batchId", row_no AS "rowNo", raw, state, errors, practitioner_id AS "practitionerId" FROM import_rows WHERE batch_id = ${id} ORDER BY row_no`),
  ]);
  return b.rows[0] ? { batch: b.rows[0], rows: rows.rows } : null;
}

/** Re-validates every pending/valid/invalid/duplicate row of a batch (dry run). */
export async function validateBatch(tx: Db, batchId: string): Promise<{ valid: number; invalid: number; duplicate: number }> {
  const lk = await loadLookups(tx);
  const rows = await tx.execute<BatchRow>(sql`SELECT id, batch_id AS "batchId", row_no AS "rowNo", raw, state, errors, practitioner_id AS "practitionerId" FROM import_rows WHERE batch_id = ${batchId} AND state <> 'published' ORDER BY row_no`);
  const seen = new Set<string>();
  const checks = rows.rows.map((r) => ({ row: r, check: validateRow(r.raw, lk, seen) }));
  const dups = await findExistingDuplicates(tx, checks.filter((c) => c.check.resolved && c.check.state !== "invalid").map((c) => ({ rowNo: c.row.rowNo, name: normaliseRecord(c.row.raw).name ?? "", resolved: c.check.resolved! })));
  const counts = { valid: 0, invalid: 0, duplicate: 0 };
  for (const { row, check } of checks) {
    let state = check.state;
    const errors = [...check.errors];
    const dup = dups.get(row.rowNo);
    if (dup && state === "valid") {
      state = "duplicate";
      errors.push(dup);
    }
    counts[state] += 1;
    await tx.execute(sql`UPDATE import_rows SET state = ${state}::import_row_state, errors = ${JSON.stringify(errors)}::jsonb WHERE id = ${row.id}`);
  }
  await tx.execute(sql`UPDATE import_batches SET state = ${counts.valid + counts.duplicate > 0 ? "validated" : "failed"}::import_batch_state, row_count = ${rows.rows.length}, summary = coalesce(summary, '{}'::jsonb) || ${JSON.stringify({ validation: counts, validatedAt: new Date().toISOString() })}::jsonb WHERE id = ${batchId}`);
  return counts;
}

/** Publishes valid (optionally duplicate) rows as unclaimed drafts in listing review. Never verified or claimed (ADM-06). */
export async function publishBatch(tx: Db, batchId: string, actorUserId: string, includeDuplicates: boolean): Promise<{ practitioners: number; clinics: number; branches: number; cases: number; skipped: number }> {
  const batch = await tx.execute<{ state: string; source_url: string | null; source_name: string }>(sql`SELECT state, source_url, source_name FROM import_batches WHERE id = ${batchId} FOR UPDATE`);
  if (!batch.rows[0]) throw new Error("Batch not found");
  if (batch.rows[0].state === "published" || batch.rows[0].state === "reverted") throw new Error(`Batch is already ${batch.rows[0].state}`);
  const lk = await loadLookups(tx);
  const states = includeDuplicates ? sql`('valid','duplicate')` : sql`('valid')`;
  const rows = await tx.execute<BatchRow>(sql`SELECT id, batch_id AS "batchId", row_no AS "rowNo", raw, state, errors, practitioner_id AS "practitionerId" FROM import_rows WHERE batch_id = ${batchId} AND state IN ${states} ORDER BY row_no`);
  const created = { clinicIds: [] as string[], branchIds: [] as string[], practitionerIds: [] as string[], caseIds: [] as string[] };
  let skipped = 0;
  const seen = new Set<string>();
  for (const row of rows.rows) {
    const r = normaliseRecord(row.raw);
    const check = validateRow(row.raw, lk, seen);
    if (check.state === "invalid" || !check.resolved) {
      skipped += 1;
      await tx.execute(sql`UPDATE import_rows SET state = 'invalid', errors = ${JSON.stringify(check.errors)}::jsonb WHERE id = ${row.id}`);
      continue;
    }
    const res = check.resolved;
    // Clinic: reuse by name within the city, else create as draft.
    let clinicId: string;
    const ec = await tx.execute<{ id: string }>(sql`SELECT c.id FROM clinics c WHERE lower(c.name) = lower(${r.clinic}) AND c.status <> 'archived' AND EXISTS (SELECT 1 FROM branches b WHERE b.clinic_id = c.id AND b.city_id = ${res.cityId}) LIMIT 1`);
    if (ec.rows[0]) clinicId = ec.rows[0].id;
    else {
      const c = await tx.execute<{ id: string }>(sql`INSERT INTO clinics (public_id, slug, name, public_phone, status) VALUES (${newPublicId()}, ${slugify(r.clinic)}, ${r.clinic}, ${r.phone || null}, 'draft') RETURNING id`);
      clinicId = c.rows[0].id;
      created.clinicIds.push(clinicId);
    }
    let branchId: string;
    const eb = await tx.execute<{ id: string }>(sql`SELECT id FROM branches WHERE clinic_id = ${clinicId} AND lower(address_line1) = lower(${r.branch_address}) AND pin_code = ${r.pin} AND status <> 'archived' LIMIT 1`);
    if (eb.rows[0]) branchId = eb.rows[0].id;
    else {
      const b = await tx.execute<{ id: string }>(sql`INSERT INTO branches (clinic_id, name, address_line1, locality_id, city_id, state_id, pin_code, public_phone, status)
        VALUES (${clinicId}, ${r.locality}, ${r.branch_address}, ${res.localityId}, ${res.cityId}, ${res.stateId}, ${r.pin}, ${r.phone || null}, 'draft') RETURNING id`);
      branchId = b.rows[0].id;
      created.branchIds.push(branchId);
    }
    const p = await tx.execute<{ id: string }>(sql`INSERT INTO practitioners (public_id, slug, claim_state, listing_status, source, import_batch_id, display_name, designation)
      VALUES (${newPublicId()}, ${slugify(r.name)}, 'unclaimed', 'submitted', 'imported', ${batchId}, ${r.name}, ${r.designation || "Physiotherapist"}) RETURNING id`);
    const pid = p.rows[0].id;
    created.practitionerIds.push(pid);
    const content = { displayName: r.name, designation: r.designation || "Physiotherapist", sourceUrl: r.source_url || batch.rows[0].source_url, importBatchId: batchId };
    const pv = await tx.execute<{ id: string }>(sql`INSERT INTO profile_versions (practitioner_id, version, state, structured_content, created_by_user_id, submitted_at) VALUES (${pid}, 1, 'submitted', ${JSON.stringify(content)}::jsonb, ${actorUserId}, now()) RETURNING id`);
    await tx.execute(sql`INSERT INTO practitioner_branches (practitioner_id, branch_id, state, bookable, approved_by_user_id) VALUES (${pid}, ${branchId}, 'approved', false, ${actorUserId})`);
    if (res.authorityId && r.registration_number) {
      await tx.execute(sql`INSERT INTO credentials (practitioner_id, authority_id, type, number_original, number_normalised, status, source)
        VALUES (${pid}, ${res.authorityId}, 'statutory_registration', ${r.registration_number}, ${res.numberNormalised}, 'self_declared', ${"import: " + batch.rows[0].source_name})`);
    }
    const { id: caseId } = await openCase(tx, { caseType: "listing_review", subjectType: "profile_version", subjectId: pv.rows[0].id, practitionerId: pid, submittedByUserId: actorUserId, evidence: { importBatchId: batchId, rowNo: row.rowNo, duplicateWarning: row.state === "duplicate" ? row.errors : undefined } });
    created.caseIds.push(caseId);
    await tx.execute(sql`UPDATE import_rows SET state = 'published', practitioner_id = ${pid} WHERE id = ${row.id}`);
  }
  await tx.execute(sql`UPDATE import_rows SET state = 'skipped' WHERE batch_id = ${batchId} AND state IN ('invalid','duplicate','pending')`);
  await tx.execute(sql`UPDATE import_batches SET state = 'published', summary = coalesce(summary, '{}'::jsonb) || ${JSON.stringify({ created, publishedAt: new Date().toISOString(), skipped })}::jsonb WHERE id = ${batchId}`);
  return { practitioners: created.practitionerIds.length, clinics: created.clinicIds.length, branches: created.branchIds.length, cases: created.caseIds.length, skipped };
}

/** Archives everything the batch created and closes its review cases. */
export async function revertBatch(tx: Db, batchId: string, actorUserId: string, reason: string): Promise<{ practitioners: number; branches: number; clinics: number }> {
  const b = await tx.execute<{ state: string; summary: { created?: { clinicIds?: string[]; branchIds?: string[]; practitionerIds?: string[]; caseIds?: string[] } } | null }>(sql`SELECT state, summary FROM import_batches WHERE id = ${batchId} FOR UPDATE`);
  if (!b.rows[0]) throw new Error("Batch not found");
  if (b.rows[0].state !== "published") throw new Error("Only a published batch can be reverted");
  const created = b.rows[0].summary?.created ?? {};
  const pr = await tx.execute(sql`UPDATE practitioners SET listing_status = 'archived', booking_eligible = false WHERE import_batch_id = ${batchId} AND claim_state = 'unclaimed'`);
  await tx.execute(sql`UPDATE verification_cases SET state = 'closed', decision = 'dismissed', decision_reason = ${"import batch reverted: " + reason}, decided_at = now(), decided_by_user_id = ${actorUserId} WHERE id = ANY(${uuidArray(created.caseIds)}) AND state IN ('open','in_review','awaiting_evidence')`);
  const br = await tx.execute(sql`UPDATE branches SET status = 'archived' WHERE id = ANY(${uuidArray(created.branchIds)}) AND NOT EXISTS (SELECT 1 FROM practitioner_branches pb JOIN practitioners p ON p.id = pb.practitioner_id WHERE pb.branch_id = branches.id AND p.listing_status <> 'archived')`);
  const cl = await tx.execute(sql`UPDATE clinics SET status = 'archived' WHERE id = ANY(${uuidArray(created.clinicIds)}) AND NOT EXISTS (SELECT 1 FROM branches b WHERE b.clinic_id = clinics.id AND b.status <> 'archived')`);
  await tx.execute(sql`UPDATE import_rows SET state = 'skipped' WHERE batch_id = ${batchId}`);
  await tx.execute(sql`UPDATE import_batches SET state = 'reverted', summary = coalesce(summary, '{}'::jsonb) || ${JSON.stringify({ revertedAt: new Date().toISOString(), revertReason: reason })}::jsonb WHERE id = ${batchId}`);
  return { practitioners: pr.rowCount ?? 0, branches: br.rowCount ?? 0, clinics: cl.rowCount ?? 0 };
}
