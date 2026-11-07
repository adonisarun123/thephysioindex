import { sql } from "drizzle-orm";
import type { Db } from "@/db/client";

/**
 * Publishes the draft clinics and home-visit areas a practitioner created
 * themselves, once their association is approved (LOC-02, LOC-03). Search and
 * location pages show only published clinics/branches, so without this an
 * approved practitioner would list nowhere. Records created by someone else
 * (a clinic the practitioner merely joined) are left to their owner/admin.
 */
export async function publishOwnApprovedLocations(tx: Db, practitionerId: string, associationId?: string): Promise<{ branches: number; clinics: number }> {
  const br = await tx.execute<{ id: string; clinic_id: string }>(sql`
    UPDATE branches b SET status = 'published'
    FROM practitioner_branches pb, clinics c, practitioners p
    WHERE pb.branch_id = b.id AND c.id = b.clinic_id AND p.id = pb.practitioner_id
      AND pb.practitioner_id = ${practitionerId} AND pb.state = 'approved' AND pb.active_to IS NULL
      ${associationId ? sql`AND pb.id = ${associationId}` : sql``}
      AND b.status = 'draft' AND c.owner_user_id = p.owner_user_id
    RETURNING b.id, b.clinic_id`);
  const clinicIds = [...new Set(br.rows.map((r) => r.clinic_id))];
  if (clinicIds.length) {
    await tx.execute(sql`UPDATE clinics SET status = 'published' WHERE id = ANY(${`{${clinicIds.join(",")}}`}::uuid[]) AND status = 'draft'`);
  }
  return { branches: br.rows.length, clinics: clinicIds.length };
}
