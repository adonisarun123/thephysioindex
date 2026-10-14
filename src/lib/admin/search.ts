import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { normaliseRegistrationNumber } from "@/lib/slug";

/** Admin omnisearch: practitioners, clinics, bookings, patients (masked). */
export type SearchResults = {
  practitioners: { id: string; name: string; publicId: string; listingStatus: string; claimState: string }[];
  clinics: { id: string; name: string; publicId: string; status: string }[];
  bookings: { id: string; reference: string; status: string; startsAt: Date; practitionerName: string }[];
  patients: { id: string; name: string; mobile: string | null; status: string }[];
  cases: { id: string; caseType: string; state: string }[];
};

export async function adminSearch(qRaw: string): Promise<SearchResults> {
  const q = qRaw.trim();
  const like = "%" + q + "%";
  const digits = q.replace(/\D/g, "");
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(q);
  const d = db();
  const [practitioners, clinics, bookings, patients, cases] = await Promise.all([
    d.execute<SearchResults["practitioners"][number]>(sql`
      SELECT p.id, p.display_name AS name, p.public_id AS "publicId", p.listing_status AS "listingStatus", p.claim_state AS "claimState" FROM practitioners p
      WHERE p.display_name ILIKE ${like} OR p.public_id = ${q.toLowerCase()} OR p.slug = ${q.toLowerCase()} OR (${isUuid} AND p.id = ${isUuid ? q : "00000000-0000-0000-0000-000000000000"}::uuid)
        OR EXISTS (SELECT 1 FROM credentials c WHERE c.practitioner_id = p.id AND (c.number_normalised = ${normaliseRegistrationNumber(q)} OR c.number_original ILIKE ${like}))
      ORDER BY similarity(lower(p.display_name), lower(${q})) DESC LIMIT 15`),
    d.execute<SearchResults["clinics"][number]>(sql`SELECT c.id, c.name, c.public_id AS "publicId", c.status FROM clinics c WHERE c.name ILIKE ${like} OR c.public_id = ${q.toLowerCase()} ORDER BY similarity(lower(c.name), lower(${q})) DESC LIMIT 10`),
    d.execute<SearchResults["bookings"][number]>(sql`SELECT b.id, b.reference, b.status, b.starts_at AS "startsAt", p.display_name AS "practitionerName" FROM bookings b JOIN practitioners p ON p.id = b.practitioner_id WHERE b.reference ILIKE ${like} ORDER BY b.starts_at DESC LIMIT 10`),
    digits.length >= 4
      ? d.execute<SearchResults["patients"][number]>(sql`SELECT p.id, p.display_name AS name, p.mobile, p.status FROM patients p WHERE regexp_replace(coalesce(p.mobile,''), '\\D', '', 'g') LIKE ${"%" + digits} ORDER BY p.created_at DESC LIMIT 10`)
      : Promise.resolve({ rows: [] as SearchResults["patients"] }),
    isUuid ? d.execute<SearchResults["cases"][number]>(sql`SELECT id, case_type AS "caseType", state FROM verification_cases WHERE id = ${q}::uuid OR subject_id = ${q}::uuid OR practitioner_id = ${q}::uuid LIMIT 10`) : Promise.resolve({ rows: [] as SearchResults["cases"] }),
  ]);
  return { practitioners: practitioners.rows, clinics: clinics.rows, bookings: bookings.rows, patients: patients.rows, cases: cases.rows };
}
