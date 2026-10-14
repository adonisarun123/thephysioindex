import { sql } from "drizzle-orm";
import { db, type Db } from "@/db/client";
import { enumArray } from "@/lib/sql";

/** Review queue entries (ADM-02). One open case per (type, subject) at a time. */

export type CaseType =
  | "listing_review"
  | "profile_change"
  | "claim"
  | "credential_check"
  | "duplicate_candidate"
  | "offer_review"
  | "locality_proposal";

export async function openCase(
  input: { caseType: CaseType; subjectType: string; subjectId: string; practitionerId?: string | null; submittedByUserId: string | null; priority?: "low" | "normal" | "high"; evidence?: Record<string, unknown> },
  tx?: Db,
): Promise<string> {
  const d = tx ?? db();
  const existing = await d.execute<{ id: string }>(sql`
    SELECT id FROM verification_cases
    WHERE case_type = ${input.caseType}::case_type AND subject_type = ${input.subjectType} AND subject_id = ${input.subjectId}::uuid
      AND state IN ('open', 'in_review', 'awaiting_evidence')
    LIMIT 1`);
  if (existing.rows[0]) return existing.rows[0].id;
  const res = await d.execute<{ id: string }>(sql`
    INSERT INTO verification_cases (case_type, subject_type, subject_id, practitioner_id, submitted_by_user_id, priority, evidence)
    VALUES (${input.caseType}::case_type, ${input.subjectType}, ${input.subjectId}::uuid, ${input.practitionerId ?? null}, ${input.submittedByUserId},
            ${input.priority ?? "normal"}::priority, ${JSON.stringify(input.evidence ?? {})}::jsonb)
    RETURNING id`);
  return res.rows[0].id;
}

export type CaseSummary = { id: string; caseType: string; state: string; decision: string | null; decisionReason: string | null; submittedAt: string; decidedAt: string | null };

/** Latest review case of the given types for a practitioner, for feedback on the editor (Section 15 profile editor). */
export async function latestCase(practitionerId: string, caseTypes: CaseType[]): Promise<CaseSummary | null> {
  const res = await db().execute<Record<string, unknown>>(sql`
    SELECT id, case_type::text AS case_type, state::text AS state, decision::text AS decision, decision_reason, submitted_at, decided_at
    FROM verification_cases
    WHERE practitioner_id = ${practitionerId} AND case_type = ANY(${enumArray(caseTypes, "case_type")})
    ORDER BY submitted_at DESC LIMIT 1`);
  const r = res.rows[0];
  if (!r) return null;
  return {
    id: r.id as string,
    caseType: r.case_type as string,
    state: r.state as string,
    decision: (r.decision as string | null) ?? null,
    decisionReason: (r.decision_reason as string | null) ?? null,
    submittedAt: String(r.submitted_at),
    decidedAt: r.decided_at ? String(r.decided_at) : null,
  };
}
