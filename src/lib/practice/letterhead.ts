import { sql } from "drizzle-orm";
import { db } from "@/db/client";

/**
 * Letterhead for printed prescriptions and receipts (RCP-03). Uses only what
 * the practitioner entered: name, degrees, registration number with its
 * authority, and their first clinic (name, address, phone). Home-visit-only
 * physios get no address line (service-area PINs stay private).
 */
export type Letterhead = {
  name: string;
  degrees: string | null;
  registration: string | null;
  clinicName: string | null;
  address: string | null;
  phone: string | null;
};

export async function getLetterhead(practitionerId: string): Promise<Letterhead> {
  const res = await db().execute<{
    display_name: string; degrees: string | null; registration: string | null; clinic_name: string | null; address: string | null; phone: string | null;
  }>(sql`
    SELECT p.display_name,
      (SELECT string_agg(q.degree, ', ' ORDER BY q.sort_order, q.completion_year) FROM qualifications q WHERE q.practitioner_id = p.id AND NOT q.in_progress) AS degrees,
      (SELECT coalesce(a.short_name, a.name) || ' Reg. No. ' || c.number_original FROM credentials c JOIN credential_authorities a ON a.id = c.authority_id
        WHERE c.practitioner_id = p.id AND c.number_original IS NOT NULL ORDER BY c.created_at LIMIT 1) AS registration,
      b.clinic_name, b.address, b.phone
    FROM practitioners p
    LEFT JOIN LATERAL (
      SELECT cl.name AS clinic_name,
             concat_ws(', ', br.address_line1, br.address_line2, l.name, ci.name || ' ' || br.pin_code) AS address,
             br.public_phone AS phone
      FROM practitioner_branches pb
      JOIN branches br ON br.id = pb.branch_id AND br.kind = 'clinic'
      JOIN clinics cl ON cl.id = br.clinic_id
      JOIN localities l ON l.id = br.locality_id
      JOIN cities ci ON ci.id = br.city_id
      WHERE pb.practitioner_id = p.id AND pb.active_to IS NULL AND pb.state IN ('pending', 'approved')
      ORDER BY (pb.state = 'approved') DESC, pb.active_from
      LIMIT 1
    ) b ON true
    WHERE p.id = ${practitionerId}`);
  const r = res.rows[0];
  return {
    name: r?.display_name ?? "",
    degrees: r?.degrees ?? null,
    registration: r?.registration ?? null,
    clinicName: r?.clinic_name ?? null,
    address: r?.address ?? null,
    phone: r?.phone ?? null,
  };
}
