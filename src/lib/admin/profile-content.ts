import { sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { slugify } from "@/lib/slug";

/**
 * Shape of profile_versions.structured_content (PRO-08, PRO-10). The draft is
 * a self-contained JSON document; approval copies it into the relational
 * tables that the public read models use. Missing keys leave the existing
 * relational rows untouched; present arrays replace them.
 */
type Gender = "female" | "male" | "non_binary" | "unset";

export type StructuredContent = {
  /**
   * The workspace draft nests the identity fields here
   * (src/lib/workspace/draft.ts); imports and admin-created drafts use the
   * top-level keys below. Approval reads both; the top-level key wins.
   */
  identity?: { displayName?: string; designation?: string; headline?: string; gender?: Gender };
  displayName?: string;
  designation?: string;
  headline?: string;
  about?: string;
  gender?: Gender;
  practiceStartDate?: string; // YYYY-MM-DD
  qualifications?: { degree: string; institution: string; completionYear?: number | null; inProgress?: boolean }[];
  experiences?: { role: string; organisationName: string; startMonth: string; endMonth?: string | null; description?: string | null }[];
  /**
   * Specialty codes or ids; first entry (or isPrimary) is primary. The
   * workspace draft stores `{ specialtyId, isPrimary }` (src/lib/workspace/draft.ts).
   */
  specialties?: (string | { code?: string; id?: string; specialtyId?: string; isPrimary?: boolean })[];
  /** Language codes or ids. */
  languages?: (string | { code?: string; id?: string })[];
  portfolio?: { kind: "award" | "certification" | "membership" | "publication" | "website" | "social"; title: string; issuer?: string | null; itemDate?: string | null; url?: string | null; description?: string | null }[];
};

export const PROFILE_FIELDS = ["displayName", "designation", "headline", "about", "gender", "practiceStartDate", "qualifications", "experiences", "specialties", "languages", "portfolio"] as const;

/** Field-level diff between two content documents (VER-05 review aid). */
export function diffContent(published: StructuredContent | null | undefined, draft: StructuredContent | null | undefined): { field: string; before: unknown; after: unknown }[] {
  const out: { field: string; before: unknown; after: unknown }[] = [];
  const a = published ?? {};
  const b = draft ?? {};
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    const before = (a as Record<string, unknown>)[k];
    const after = (b as Record<string, unknown>)[k];
    if (JSON.stringify(before ?? null) !== JSON.stringify(after ?? null)) out.push({ field: k, before, after });
  }
  return out.sort((x, y) => PROFILE_FIELDS.indexOf(x.field as (typeof PROFILE_FIELDS)[number]) - PROFILE_FIELDS.indexOf(y.field as (typeof PROFILE_FIELDS)[number]));
}

/** Specialty or language reference from either content shape: a code, an id, or the workspace draft's `specialtyId`. */
export const toCode = (x: string | { code?: string; id?: string; specialtyId?: string }) => (typeof x === "string" ? x : (x.code ?? x.id ?? x.specialtyId ?? ""));

/**
 * The workspace draft stores experience months as `YYYY-MM` (an
 * `<input type="month">` value), which Postgres does not accept as a date.
 * Months are stored as the first day of that month; full dates pass through.
 */
export const monthToDate = (m: string) => (/^\d{4}-(0[1-9]|1[0-2])$/.test(m) ? `${m}-01` : m);

/** Identity fields from either content shape. `undefined` means "not part of this change". */
export function identityOf(c: StructuredContent): { displayName?: string; designation?: string; headline?: string; gender?: Gender } {
  const i = c.identity ?? {};
  return {
    displayName: (c.displayName ?? i.displayName)?.trim() || undefined,
    designation: c.designation ?? i.designation,
    headline: c.headline ?? i.headline,
    gender: c.gender ?? i.gender,
  };
}

const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

/**
 * Copies an approved draft into the relational tables. Runs inside the
 * caller's transaction. Only approved fields are written; evidence ids are
 * not public (PRO-10, DAT-02).
 */
export async function applyStructuredContent(tx: Db, practitionerId: string, c: StructuredContent): Promise<string[]> {
  const applied: string[] = [];
  const sets: ReturnType<typeof sql>[] = [];
  const idn = identityOf(c);
  if (idn.displayName !== undefined) {
    sets.push(sql`display_name = ${idn.displayName}`);
    // The profile address carries the name. When an approved name changes the
    // slug follows it and the old one is kept in the history; links keep
    // working because the page resolves by public id.
    const cur = await tx.execute<{ slug: string }>(sql`SELECT slug FROM practitioners WHERE id = ${practitionerId}`);
    const oldSlug = cur.rows[0]?.slug;
    const slug = slugify(idn.displayName);
    if (oldSlug && slug && slug !== oldSlug) {
      await tx.execute(sql`INSERT INTO practitioner_slug_history (practitioner_id, slug) VALUES (${practitionerId}, ${oldSlug})`);
      sets.push(sql`slug = ${slug}`);
    }
  }
  if (idn.designation !== undefined) sets.push(sql`designation = ${idn.designation.trim() || null}`);
  if (idn.headline !== undefined) sets.push(sql`headline = ${idn.headline.trim() || null}`);
  if (idn.gender !== undefined) sets.push(sql`gender = ${idn.gender}::gender_pref`);
  if (c.practiceStartDate !== undefined) sets.push(sql`practice_start_date = ${c.practiceStartDate || null}::date`);
  if (sets.length) {
    await tx.execute(sql`UPDATE practitioners SET ${sql.join(sets, sql`, `)} WHERE id = ${practitionerId}`);
    applied.push("identity");
  }
  if (Array.isArray(c.qualifications)) {
    await tx.execute(sql`DELETE FROM qualifications WHERE practitioner_id = ${practitionerId}`);
    for (const [i, q] of c.qualifications.entries()) {
      await tx.execute(sql`INSERT INTO qualifications (practitioner_id, degree, institution, completion_year, in_progress, sort_order)
        VALUES (${practitionerId}, ${q.degree}, ${q.institution}, ${q.completionYear ?? null}, ${Boolean(q.inProgress)}, ${i})`);
    }
    applied.push("qualifications");
  }
  if (Array.isArray(c.experiences)) {
    await tx.execute(sql`DELETE FROM experiences WHERE practitioner_id = ${practitionerId}`);
    for (const [i, e] of c.experiences.entries()) {
      await tx.execute(sql`INSERT INTO experiences (practitioner_id, role, organisation_name, start_month, end_month, description, sort_order)
        VALUES (${practitionerId}, ${e.role}, ${e.organisationName}, ${monthToDate(e.startMonth)}::date, ${e.endMonth ? monthToDate(e.endMonth) : null}::date, ${e.description || null}, ${i})`);
    }
    applied.push("experiences");
  }
  if (Array.isArray(c.specialties)) {
    await tx.execute(sql`DELETE FROM practitioner_specialties WHERE practitioner_id = ${practitionerId}`);
    const codes = c.specialties.map(toCode).filter(Boolean);
    const primaryIdx = c.specialties.findIndex((s) => typeof s === "object" && s.isPrimary);
    for (const [i, code] of codes.entries()) {
      const isPrimary = primaryIdx >= 0 ? i === primaryIdx : i === 0;
      await tx.execute(sql`INSERT INTO practitioner_specialties (practitioner_id, specialty_id, is_primary)
        SELECT ${practitionerId}, s.id, ${isPrimary} FROM specialties s WHERE ${isUuid(code) ? sql`s.id = ${code}::uuid` : sql`s.code = ${code}`} AND s.active
        ON CONFLICT DO NOTHING`);
    }
    applied.push("specialties");
  }
  if (Array.isArray(c.languages)) {
    await tx.execute(sql`DELETE FROM practitioner_languages WHERE practitioner_id = ${practitionerId}`);
    for (const code of c.languages.map(toCode).filter(Boolean)) {
      await tx.execute(sql`INSERT INTO practitioner_languages (practitioner_id, language_id)
        SELECT ${practitionerId}, l.id FROM languages l WHERE ${isUuid(code) ? sql`l.id = ${code}::uuid` : sql`l.code = ${code}`} ON CONFLICT DO NOTHING`);
    }
    applied.push("languages");
  }
  if (Array.isArray(c.portfolio)) {
    await tx.execute(sql`DELETE FROM portfolio_items WHERE practitioner_id = ${practitionerId}`);
    for (const [i, p] of c.portfolio.entries()) {
      await tx.execute(sql`INSERT INTO portfolio_items (practitioner_id, kind, title, issuer, item_date, url, description, sort_order)
        VALUES (${practitionerId}, ${p.kind}::portfolio_kind, ${p.title}, ${p.issuer ?? null}, ${p.itemDate ?? null}::date, ${p.url ?? null}, ${p.description ?? null}, ${i})`);
    }
    applied.push("portfolio");
  }
  return applied;
}
