import { sql, type SQL } from "drizzle-orm";
import { db } from "@/db/client";
import type { AuditRow } from "./practitioners";

/** Audit log browsing with keyset pagination on (occurred_at, id) (Section 22). */

export type AuditFilters = { action?: string; objectType?: string; actorUserId?: string; actor?: string; objectId?: string; from?: string; to?: string; cursor?: string; limit?: number };

export function encodeAuditCursor(occurredAt: Date, id: string): string {
  return Buffer.from(JSON.stringify({ t: new Date(occurredAt).toISOString(), i: id }), "utf8").toString("base64url");
}

function decodeCursor(c: string | undefined): { t: string; i: string } | null {
  if (!c) return null;
  try {
    const parsed = JSON.parse(Buffer.from(c, "base64url").toString("utf8")) as { t: string; i: string };
    if (typeof parsed.t === "string" && typeof parsed.i === "string") return parsed;
  } catch {
    /* ignore */
  }
  return null;
}

export async function listAudit(f: AuditFilters): Promise<{ rows: (AuditRow & { actorUserId: string | null })[]; nextCursor: string | null; actions: string[]; objectTypes: string[] }> {
  const where: SQL[] = [];
  if (f.action) where.push(sql`a.action LIKE ${f.action + "%"}`);
  if (f.objectType) where.push(sql`a.object_type = ${f.objectType}`);
  if (f.objectId) where.push(sql`a.object_id = ${f.objectId}::uuid`);
  if (f.actorUserId) where.push(sql`a.actor_user_id = ${f.actorUserId}::uuid`);
  if (f.actor?.trim()) where.push(sql`EXISTS (SELECT 1 FROM users u2 WHERE u2.id = a.actor_user_id AND (u2.email ILIKE ${"%" + f.actor.trim() + "%"} OR u2.display_name ILIKE ${"%" + f.actor.trim() + "%"}))`);
  if (f.from) where.push(sql`a.occurred_at >= (${f.from}::date)::timestamp AT TIME ZONE 'Asia/Kolkata'`);
  if (f.to) where.push(sql`a.occurred_at < ((${f.to}::date + 1))::timestamp AT TIME ZONE 'Asia/Kolkata'`);
  const cur = decodeCursor(f.cursor);
  if (cur) where.push(sql`(a.occurred_at, a.id) < (${cur.t}::timestamptz, ${cur.i}::uuid)`);
  const limit = Math.min(200, Math.max(1, f.limit ?? 50));
  const whereSql = where.length ? sql`WHERE ${sql.join(where, sql` AND `)}` : sql``;
  const [rows, actions, types] = await Promise.all([
    db().execute<AuditRow & { actorUserId: string | null }>(sql`
      SELECT a.id, a.action, a.object_type AS "objectType", a.object_id AS "objectId", a.actor_user_id AS "actorUserId", coalesce(u.display_name, u.email) AS "actorName", a.actor_role AS "actorRole", a.reason, a.changed_fields AS "changedFields", a.occurred_at AS "occurredAt"
      FROM audit_events a LEFT JOIN users u ON u.id = a.actor_user_id ${whereSql} ORDER BY a.occurred_at DESC, a.id DESC LIMIT ${limit + 1}`),
    db().execute<{ action: string }>(sql`SELECT DISTINCT split_part(action, '.', 1) AS action FROM audit_events ORDER BY 1`),
    db().execute<{ t: string }>(sql`SELECT DISTINCT object_type AS t FROM audit_events ORDER BY 1`),
  ]);
  const page = rows.rows.slice(0, limit);
  const last = page[page.length - 1];
  return { rows: page, nextCursor: rows.rows.length > limit && last ? encodeAuditCursor(last.occurredAt, last.id) : null, actions: actions.rows.map((r) => r.action), objectTypes: types.rows.map((r) => r.t) };
}
