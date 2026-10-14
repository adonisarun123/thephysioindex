import { sql } from "drizzle-orm";
import { db, type Db } from "@/db/client";

/**
 * Append-only audit trail (Section 22, IAM-03). Call after every privileged
 * write. Values are redacted by the caller; never pass OTPs, tokens or full
 * documents.
 */
export async function audit(
  entry: {
    actorUserId: string | null;
    actorRole?: string | null;
    action: string; // dotted, e.g. "listing.approve"
    objectType: string;
    objectId?: string | null;
    reason?: string | null;
    changedFields?: Record<string, unknown> | null;
    correlationId?: string | null;
  },
  tx?: Db,
) {
  const d = tx ?? db();
  await d.execute(sql`
    INSERT INTO audit_events (actor_user_id, actor_role, action, object_type, object_id, reason, changed_fields, correlation_id)
    VALUES (${entry.actorUserId}, ${entry.actorRole ?? null}, ${entry.action}, ${entry.objectType}, ${entry.objectId ?? null}, ${entry.reason ?? null},
            ${entry.changedFields ? JSON.stringify(entry.changedFields) : null}::jsonb, ${entry.correlationId ?? null})
  `);
}
