import { sql, type SQL } from "drizzle-orm";
import { db } from "@/db/client";

/** Enquiries, support cases and privacy requests (Section 2, ADM-07, Section 26). */

export type EnquiryRow = { id: string; practitionerId: string | null; practitionerName: string | null; branchName: string | null; requesterName: string; requesterMobile: string; message: string | null; status: string; forwardedAt: Date | null; closedAt: Date | null; createdAt: Date };

export async function listEnquiries(f: { status?: string; page?: number; pageSize?: number }): Promise<{ rows: EnquiryRow[]; total: number; counts: Record<string, number> }> {
  const where: SQL[] = [];
  if (f.status) where.push(sql`e.status = ${f.status}`);
  const whereSql = where.length ? sql`WHERE ${sql.join(where, sql` AND `)}` : sql``;
  const pageSize = f.pageSize ?? 50;
  const page = Math.max(1, f.page ?? 1);
  const [rows, total, counts] = await Promise.all([
    db().execute<EnquiryRow>(sql`
      SELECT e.id, e.practitioner_id AS "practitionerId", p.display_name AS "practitionerName", (SELECT c.name || ' · ' || b.name FROM branches b JOIN clinics c ON c.id = b.clinic_id WHERE b.id = e.branch_id) AS "branchName",
        e.requester_name AS "requesterName", e.requester_mobile AS "requesterMobile", e.message, e.status, e.forwarded_at AS "forwardedAt", e.closed_at AS "closedAt", e.created_at AS "createdAt"
      FROM enquiries e LEFT JOIN practitioners p ON p.id = e.practitioner_id ${whereSql} ORDER BY e.created_at DESC LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`),
    db().execute<{ n: string }>(sql`SELECT count(*) AS n FROM enquiries e ${whereSql}`),
    db().execute<{ status: string; n: string }>(sql`SELECT status, count(*) AS n FROM enquiries GROUP BY 1`),
  ]);
  return { rows: rows.rows, total: Number(total.rows[0]?.n ?? 0), counts: Object.fromEntries(counts.rows.map((r) => [r.status, Number(r.n)])) };
}

export type SignupRow = { id: string; reference: string; fullName: string; mobile: string; email: string | null; city: string; practiceType: string; registrationNumber: string | null; attribution: Record<string, string>; status: string; notes: string | null; createdAt: Date };

/** Practitioner sign-up leads from the paid landing page. Not listings (DIR-14). */
export async function listSignups(f: { status?: string; page?: number; pageSize?: number }): Promise<{ rows: SignupRow[]; total: number; counts: Record<string, number> }> {
  const whereSql = f.status ? sql`WHERE s.status = ${f.status}` : sql``;
  const pageSize = f.pageSize ?? 50;
  const page = Math.max(1, f.page ?? 1);
  const [rows, total, counts] = await Promise.all([
    db().execute<SignupRow>(sql`
      SELECT s.id, s.reference, s.full_name AS "fullName", s.mobile, s.email, s.city, s.practice_type AS "practiceType", s.registration_number AS "registrationNumber",
        s.attribution, s.status, s.notes, s.created_at AS "createdAt"
      FROM practitioner_signups s ${whereSql} ORDER BY s.created_at DESC LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`),
    db().execute<{ n: string }>(sql`SELECT count(*) AS n FROM practitioner_signups s ${whereSql}`),
    db().execute<{ status: string; n: string }>(sql`SELECT status, count(*) AS n FROM practitioner_signups GROUP BY 1`),
  ]);
  return { rows: rows.rows, total: Number(total.rows[0]?.n ?? 0), counts: Object.fromEntries(counts.rows.map((r) => [r.status, Number(r.n)])) };
}

export type SupportRow = { id: string; reference: string; category: string; priority: string; state: string; requesterContact: string | null; requesterName: string | null; linkedType: string | null; linkedId: string | null; linkedLabel: string | null; assigneeName: string | null; assigneeUserId: string | null; description: string; resolution: string | null; resolvedAt: Date | null; createdAt: Date; updatedAt: Date };

const SUPPORT_SELECT = sql`
  SELECT s.id, s.reference, s.category, s.priority, s.state, s.requester_contact AS "requesterContact", coalesce(u.display_name, u.email, u.mobile) AS "requesterName", s.linked_type AS "linkedType", s.linked_id AS "linkedId",
    CASE s.linked_type WHEN 'practitioner' THEN (SELECT display_name FROM practitioners WHERE id = s.linked_id) WHEN 'booking' THEN (SELECT reference FROM bookings WHERE id = s.linked_id) WHEN 'clinic' THEN (SELECT name FROM clinics WHERE id = s.linked_id) WHEN 'review' THEN 'review' ELSE NULL END AS "linkedLabel",
    coalesce(a.display_name, a.email) AS "assigneeName", s.assignee_user_id AS "assigneeUserId", s.description, s.resolution, s.resolved_at AS "resolvedAt", s.created_at AS "createdAt", s.updated_at AS "updatedAt"
  FROM support_cases s LEFT JOIN users u ON u.id = s.requester_user_id LEFT JOIN users a ON a.id = s.assignee_user_id`;

export async function listSupport(f: { state?: string; category?: string; assignee?: string; viewerUserId: string; page?: number; pageSize?: number }): Promise<{ rows: SupportRow[]; total: number; counts: Record<string, number> }> {
  const where: SQL[] = [];
  const state = f.state ?? "open";
  if (state === "active") where.push(sql`s.state IN ('open','in_progress','waiting_on_requester')`);
  else if (state !== "all") where.push(sql`s.state = ${state}::support_state`);
  if (f.category) where.push(sql`s.category = ${f.category}`);
  if (f.assignee === "me") where.push(sql`s.assignee_user_id = ${f.viewerUserId}`);
  if (f.assignee === "unassigned") where.push(sql`s.assignee_user_id IS NULL`);
  const whereSql = where.length ? sql`WHERE ${sql.join(where, sql` AND `)}` : sql``;
  const pageSize = f.pageSize ?? 50;
  const page = Math.max(1, f.page ?? 1);
  const [rows, total, counts] = await Promise.all([
    db().execute<SupportRow>(sql`${SUPPORT_SELECT} ${whereSql} ORDER BY CASE s.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END, s.created_at ASC LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`),
    db().execute<{ n: string }>(sql`SELECT count(*) AS n FROM support_cases s ${whereSql}`),
    db().execute<{ state: string; n: string }>(sql`SELECT state::text, count(*) AS n FROM support_cases GROUP BY 1`),
  ]);
  return { rows: rows.rows, total: Number(total.rows[0]?.n ?? 0), counts: Object.fromEntries(counts.rows.map((r) => [r.state, Number(r.n)])) };
}

export async function getSupport(id: string): Promise<SupportRow | null> {
  const res = await db().execute<SupportRow>(sql`${SUPPORT_SELECT} WHERE s.id = ${id}`);
  return res.rows[0] ?? null;
}

export async function listSupportEvents(caseId: string) {
  const res = await db().execute<{ id: string; eventType: string; actorName: string | null; payload: Record<string, unknown> | null; occurredAt: Date }>(sql`
    SELECT e.id, e.event_type AS "eventType", coalesce(u.display_name, u.email) AS "actorName", e.payload, e.occurred_at AS "occurredAt" FROM support_case_events e LEFT JOIN users u ON u.id = e.actor_user_id WHERE e.case_id = ${caseId} ORDER BY e.occurred_at`);
  return res.rows;
}

export const SUPPORT_CATEGORIES = ["booking", "account", "listing", "review_appeal", "payment", "accessibility", "data_correction", "fraud_report", "other"];

export type PrivacyRow = { id: string; requestType: string; state: string; requesterContact: string | null; requesterName: string | null; subjectType: string | null; subjectId: string | null; verifiedAt: Date | null; dueAt: Date; assigneeName: string | null; assigneeUserId: string | null; details: string | null; resolution: string | null; resolvedAt: Date | null; createdAt: Date };

const PRIVACY_SELECT = sql`
  SELECT r.id, r.request_type AS "requestType", r.state, r.requester_contact AS "requesterContact", coalesce(u.display_name, u.email, u.mobile) AS "requesterName", r.subject_type AS "subjectType", r.subject_id AS "subjectId",
    r.verified_at AS "verifiedAt", r.due_at AS "dueAt", coalesce(a.display_name, a.email) AS "assigneeName", r.assignee_user_id AS "assigneeUserId", r.details, r.resolution, r.resolved_at AS "resolvedAt", r.created_at AS "createdAt"
  FROM privacy_requests r LEFT JOIN users u ON u.id = r.requester_user_id LEFT JOIN users a ON a.id = r.assignee_user_id`;

export async function listPrivacy(f: { state?: string; page?: number; pageSize?: number }): Promise<{ rows: PrivacyRow[]; total: number; counts: Record<string, number> }> {
  const where: SQL[] = [];
  const state = f.state ?? "active";
  if (state === "active") where.push(sql`r.state IN ('received','verified','in_progress')`);
  else if (state !== "all") where.push(sql`r.state = ${state}::privacy_request_state`);
  const whereSql = where.length ? sql`WHERE ${sql.join(where, sql` AND `)}` : sql``;
  const pageSize = f.pageSize ?? 50;
  const page = Math.max(1, f.page ?? 1);
  const [rows, total, counts] = await Promise.all([
    db().execute<PrivacyRow>(sql`${PRIVACY_SELECT} ${whereSql} ORDER BY r.due_at ASC LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`),
    db().execute<{ n: string }>(sql`SELECT count(*) AS n FROM privacy_requests r ${whereSql}`),
    db().execute<{ state: string; n: string }>(sql`SELECT state::text, count(*) AS n FROM privacy_requests GROUP BY 1`),
  ]);
  return { rows: rows.rows, total: Number(total.rows[0]?.n ?? 0), counts: Object.fromEntries(counts.rows.map((r) => [r.state, Number(r.n)])) };
}

export async function getPrivacy(id: string): Promise<PrivacyRow | null> {
  const res = await db().execute<PrivacyRow>(sql`${PRIVACY_SELECT} WHERE r.id = ${id}`);
  return res.rows[0] ?? null;
}

export async function staffOptions(): Promise<{ id: string; name: string; roles: string[] }[]> {
  const res = await db().execute<{ id: string; name: string; roles: string[] }>(sql`
    SELECT u.id, coalesce(u.display_name, u.email) AS name, array_agg(DISTINCT ra.role::text) AS roles FROM users u JOIN role_assignments ra ON ra.user_id = u.id AND ra.revoked_at IS NULL
    WHERE ra.role IN ('verification_reviewer','support_agent','analyst','super_admin') AND u.status = 'active' GROUP BY u.id ORDER BY name`);
  return res.rows;
}
