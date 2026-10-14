import { sql, type SQL } from "drizzle-orm";
import { db } from "@/db/client";
import type { WorkingHours } from "@/db/schema";

export type ClinicListRow = { id: string; publicId: string; name: string; status: string; ownerName: string | null; branches: number; practitioners: number; cities: string | null; createdAt: Date };

export async function listClinics(f: { q?: string; status?: string; page?: number; pageSize?: number }): Promise<{ rows: ClinicListRow[]; total: number }> {
  const where: SQL[] = [];
  if (f.q?.trim()) where.push(sql`(c.name ILIKE ${"%" + f.q.trim() + "%"} OR c.public_id = ${f.q.trim().toLowerCase()} OR c.legal_name ILIKE ${"%" + f.q.trim() + "%"})`);
  if (f.status) where.push(sql`c.status = ${f.status}::clinic_status`);
  const whereSql = where.length ? sql`WHERE ${sql.join(where, sql` AND `)}` : sql``;
  const pageSize = f.pageSize ?? 50;
  const page = Math.max(1, f.page ?? 1);
  const [rows, total] = await Promise.all([
    db().execute<ClinicListRow>(sql`
      SELECT c.id, c.public_id AS "publicId", c.name, c.status, coalesce(u.display_name, u.email, u.mobile) AS "ownerName", c.created_at AS "createdAt",
        (SELECT count(*)::int FROM branches b WHERE b.clinic_id = c.id) AS branches,
        (SELECT count(DISTINCT pb.practitioner_id)::int FROM practitioner_branches pb JOIN branches b ON b.id = pb.branch_id WHERE b.clinic_id = c.id AND pb.state = 'approved' AND pb.active_to IS NULL) AS practitioners,
        (SELECT string_agg(DISTINCT ci.name, ', ') FROM branches b JOIN cities ci ON ci.id = b.city_id WHERE b.clinic_id = c.id) AS cities
      FROM clinics c LEFT JOIN users u ON u.id = c.owner_user_id ${whereSql} ORDER BY c.created_at DESC LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`),
    db().execute<{ n: string }>(sql`SELECT count(*) AS n FROM clinics c ${whereSql}`),
  ]);
  return { rows: rows.rows, total: Number(total.rows[0]?.n ?? 0) };
}

export type ClinicDetail = { id: string; publicId: string; slug: string; name: string; legalName: string | null; ownerUserId: string | null; ownerName: string | null; ownerContact: string | null; publicPhone: string | null; publicEmail: string | null; website: string | null; about: string | null; status: string; createdAt: Date; openClaimCases: number };

export async function getClinic(id: string): Promise<ClinicDetail | null> {
  const res = await db().execute<ClinicDetail>(sql`
    SELECT c.id, c.public_id AS "publicId", c.slug, c.name, c.legal_name AS "legalName", c.owner_user_id AS "ownerUserId", coalesce(u.display_name, u.email, u.mobile) AS "ownerName", coalesce(u.email, u.mobile) AS "ownerContact",
      c.public_phone AS "publicPhone", c.public_email AS "publicEmail", c.website, c.about, c.status, c.created_at AS "createdAt",
      (SELECT count(*)::int FROM verification_cases vc WHERE vc.subject_type = 'clinic' AND vc.subject_id = c.id AND vc.state IN ('open','in_review','awaiting_evidence')) AS "openClaimCases"
    FROM clinics c LEFT JOIN users u ON u.id = c.owner_user_id WHERE c.id = ${id}`);
  return res.rows[0] ?? null;
}

export type BranchDetail = {
  id: string; name: string; addressLine1: string; addressLine2: string | null; localityId: string; localityName: string; cityId: string; cityName: string; stateId: string; stateName: string; pinCode: string;
  latitude: number | null; longitude: number | null; workingHours: WorkingHours | null; facilities: string[] | null; directions: string | null; publicPhone: string | null; status: string;
  practitioners: { id: string; practitionerId: string; name: string; state: string; bookable: boolean; listingStatus: string }[];
};

export async function listBranches(clinicId: string): Promise<BranchDetail[]> {
  const res = await db().execute<BranchDetail>(sql`
    SELECT b.id, b.name, b.address_line1 AS "addressLine1", b.address_line2 AS "addressLine2", b.locality_id AS "localityId", l.name AS "localityName", b.city_id AS "cityId", ci.name AS "cityName", b.state_id AS "stateId", s.name AS "stateName", b.pin_code AS "pinCode",
      b.latitude, b.longitude, b.working_hours AS "workingHours", b.facilities, b.directions, b.public_phone AS "publicPhone", b.status,
      coalesce((SELECT json_agg(json_build_object('id', pb.id, 'practitionerId', p.id, 'name', p.display_name, 'state', pb.state, 'bookable', pb.bookable, 'listingStatus', p.listing_status) ORDER BY p.display_name)
        FROM practitioner_branches pb JOIN practitioners p ON p.id = pb.practitioner_id WHERE pb.branch_id = b.id AND pb.state IN ('pending','approved') AND pb.active_to IS NULL), '[]'::json) AS practitioners
    FROM branches b JOIN localities l ON l.id = b.locality_id JOIN cities ci ON ci.id = b.city_id JOIN states s ON s.id = b.state_id WHERE b.clinic_id = ${clinicId} ORDER BY b.created_at`);
  return res.rows;
}

export async function localitiesForCity(cityId: string): Promise<{ id: string; name: string }[]> {
  const res = await db().execute<{ id: string; name: string }>(sql`SELECT id, name FROM localities WHERE city_id = ${cityId} AND status = 'active' ORDER BY name`);
  return res.rows;
}
