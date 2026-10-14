"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { withTransaction } from "@/db/client";
import { requireStaff } from "@/lib/auth/session";
import { openCase } from "@/lib/admin/cases";
import { addCaseNote, assignCase, decideCase, setCasePriority, type Decision } from "@/lib/admin/decisions";
import { act, messageOf, parseForm, zBool, zList, zOpt, zReason, zUuid } from "@/lib/admin/forms";
import { CASE_TYPES } from "@/lib/admin/format";

const DECISIONS = ["approved", "rejected", "changes_requested", "suspended", "dismissed", "merged", "reinstated"] as const;

const decideSchema = z.object({
  caseId: zUuid,
  decision: z.enum(DECISIONS),
  reason: zReason,
  evidenceRef: zOpt(500),
  credentialStatus: zOpt(40),
  method: zOpt(200),
  scopeOfCheck: zOpt(500),
  nextReviewAt: zOpt(20),
  publicNumberApproved: zBool,
  resolvedLocalityId: zOpt(40),
  keep: z.enum(["a", "b"]).optional(),
  returnTo: zOpt(300),
});

export async function decideCaseAction(fd: FormData) {
  const v = await requireStaff();
  const input = parseForm(decideSchema, fd);
  const back = input.returnTo?.startsWith("/admin") ? input.returnTo : `/admin/cases/${input.caseId}`;
  await act(back, async () => {
    const message = await decideCase(v, {
      caseId: input.caseId,
      decision: input.decision as Decision,
      reason: input.reason,
      evidenceRef: input.evidenceRef,
      credentialStatus: input.credentialStatus,
      method: input.method,
      scopeOfCheck: input.scopeOfCheck,
      nextReviewAt: input.nextReviewAt ? `${input.nextReviewAt}T00:00:00+05:30` : undefined,
      publicNumberApproved: input.publicNumberApproved,
      resolvedLocalityId: input.resolvedLocalityId || undefined,
      keep: input.keep,
    });
    revalidatePath("/admin", "layout");
    return { notice: message };
  });
}

const caseIdSchema = z.object({ caseId: zUuid, returnTo: zOpt(300) });

export async function assignToMeAction(fd: FormData) {
  const v = await requireStaff();
  const { caseId, returnTo } = parseForm(caseIdSchema, fd);
  await act(returnTo?.startsWith("/admin") ? returnTo : `/admin/cases/${caseId}`, async () => {
    await assignCase(v, caseId, v.userId);
    revalidatePath("/admin", "layout");
    return { notice: "Assigned to you" };
  });
}

export async function unassignAction(fd: FormData) {
  const v = await requireStaff();
  const { caseId, returnTo } = parseForm(caseIdSchema, fd);
  await act(returnTo?.startsWith("/admin") ? returnTo : `/admin/cases/${caseId}`, async () => {
    await assignCase(v, caseId, null);
    revalidatePath("/admin", "layout");
    return { notice: "Unassigned" };
  });
}

export async function setPriorityAction(fd: FormData) {
  const v = await requireStaff();
  const { caseId, priority } = parseForm(z.object({ caseId: zUuid, priority: z.enum(["low", "normal", "high", "urgent"]) }), fd);
  await act(`/admin/cases/${caseId}`, async () => {
    await setCasePriority(v, caseId, priority);
    revalidatePath(`/admin/cases/${caseId}`);
    return { notice: `Priority set to ${priority}` };
  });
}

export async function addNoteAction(fd: FormData) {
  const v = await requireStaff();
  const { caseId, note } = parseForm(z.object({ caseId: zUuid, note: z.string().trim().min(1).max(4000) }), fd);
  await act(`/admin/cases/${caseId}`, async () => {
    await addCaseNote(v, caseId, note);
    revalidatePath(`/admin/cases/${caseId}`);
    return { notice: "Note added" };
  });
}

/** ADM-03: bulk assign / reject with per-record outcome. Each record is its own transaction. */
const bulkSchema = z.object({
  op: z.enum(["assign_me", "reject"]),
  ids: zList,
  reason: zOpt(2000),
  caseType: z.enum(CASE_TYPES as [string, ...string[]]),
  state: zOpt(30),
});

export async function bulkApplyAction(fd: FormData) {
  const v = await requireStaff("verification_reviewer");
  const input = parseForm(bulkSchema, fd);
  const ids = Array.from(new Set(input.ids.filter((s) => /^[0-9a-f-]{36}$/i.test(s)))).slice(0, 100);
  const base = `/admin/queues/${input.caseType}${input.state ? `?state=${input.state}` : ""}`;
  await act(base, async () => {
    if (ids.length === 0) throw new Error("Select at least one case");
    if (input.op === "reject" && (!input.reason || input.reason.length < 3)) throw new Error("A reason is required to reject");
    const outcomes: { id: string; ok: boolean; message: string }[] = [];
    for (const id of ids) {
      try {
        if (input.op === "assign_me") {
          await assignCase(v, id, v.userId);
          outcomes.push({ id, ok: true, message: "Assigned to you" });
        } else {
          const msg = await decideCase(v, { caseId: id, decision: "rejected", reason: input.reason! });
          outcomes.push({ id, ok: true, message: msg });
        }
      } catch (err) {
        outcomes.push({ id, ok: false, message: messageOf(err) });
      }
    }
    revalidatePath("/admin", "layout");
    const okCount = outcomes.filter((o) => o.ok).length;
    const result = Buffer.from(JSON.stringify(outcomes), "utf8").toString("base64url");
    return { path: `${base}${base.includes("?") ? "&" : "?"}result=${result}`, notice: `${okCount} of ${outcomes.length} succeeded` };
  });
}

/** Staff-created case on any subject (ADM-02, ADM-07). */
const createCaseSchema = z.object({
  caseType: z.enum(CASE_TYPES as [string, ...string[]]),
  subjectType: z.string().trim().min(1).max(40),
  subjectId: zUuid,
  practitionerId: zOpt(40),
  priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
  summary: zOpt(1000),
  returnTo: zOpt(300),
});

export async function createCaseAction(fd: FormData) {
  const v = await requireStaff();
  const input = parseForm(createCaseSchema, fd);
  const back = input.returnTo?.startsWith("/admin") ? input.returnTo : "/admin";
  await act(back, async () => {
    const { id, created } = await withTransaction((_c, tx) =>
      openCase(tx, {
        caseType: input.caseType,
        subjectType: input.subjectType,
        subjectId: input.subjectId,
        practitionerId: input.practitionerId || null,
        submittedByUserId: v.userId,
        priority: input.caseType === "credential_fraud" ? "urgent" : input.priority,
        evidence: input.summary ? { summary: input.summary } : {},
      }),
    );
    revalidatePath("/admin", "layout");
    return { path: `/admin/cases/${id}`, notice: created ? "Case opened" : "An open case already exists for this subject" };
  });
}
