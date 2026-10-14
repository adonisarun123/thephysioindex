"use server";

import { revalidatePath } from "next/cache";
import { sql } from "drizzle-orm";
import { customAlphabet } from "nanoid";
import { z } from "zod";
import { withTransaction } from "@/db/client";
import { ApiError } from "@/lib/api";
import { audit } from "@/lib/audit";
import { requireStaff } from "@/lib/auth/session";
import { act, parseForm, zOpt, zReq, zUuid } from "@/lib/admin/forms";
import { SUPPORT_CATEGORIES } from "@/lib/admin/ops";
import { actorRole } from "@/lib/admin/practitioner-ops";

const ref = customAlphabet("23456789ABCDEFGHJKMNPQRSTUVWXYZ", 6);

/** Enquiries are not bookings (Section 2); status moves new → forwarded → contacted → closed. */
export async function enquiryStatusAction(fd: FormData) {
  const v = await requireStaff("support_agent");
  const { enquiryId, status, returnTo } = parseForm(z.object({ enquiryId: zUuid, status: z.enum(["new", "forwarded", "contacted", "closed"]), returnTo: zOpt(300) }), fd);
  await act(returnTo?.startsWith("/admin") ? returnTo : "/admin/enquiries", async () => {
    await withTransaction(async (_c, tx) => {
      const before = await tx.execute<{ status: string }>(sql`SELECT status FROM enquiries WHERE id = ${enquiryId} FOR UPDATE`);
      if (!before.rows[0]) throw new ApiError("NOT_FOUND", "Enquiry not found");
      await tx.execute(sql`UPDATE enquiries SET status = ${status}, forwarded_at = CASE WHEN ${status} = 'forwarded' THEN coalesce(forwarded_at, now()) ELSE forwarded_at END, closed_at = CASE WHEN ${status} = 'closed' THEN now() ELSE NULL END WHERE id = ${enquiryId}`);
      await audit({ actorUserId: v.userId, actorRole: actorRole(v), action: "enquiry.status", objectType: "enquiry", objectId: enquiryId, changedFields: { from: before.rows[0].status, to: status } }, tx);
    });
    revalidatePath("/admin", "layout");
    return { notice: `Enquiry marked ${status}` };
  });
}

/** Sign-up lead status (paid landing page). Notes are internal to operations. */
export async function signupStatusAction(fd: FormData) {
  const v = await requireStaff("support_agent");
  const { signupId, status, notes, returnTo } = parseForm(
    z.object({ signupId: zUuid, status: z.enum(["new", "contacted", "onboarding", "onboarded", "not_eligible", "closed"]), notes: zOpt(1000), returnTo: zOpt(300) }),
    fd,
  );
  await act(returnTo?.startsWith("/admin") ? returnTo : "/admin/signups", async () => {
    await withTransaction(async (_c, tx) => {
      const before = await tx.execute<{ status: string }>(sql`SELECT status FROM practitioner_signups WHERE id = ${signupId} FOR UPDATE`);
      if (!before.rows[0]) throw new ApiError("NOT_FOUND", "Sign-up not found");
      await tx.execute(sql`UPDATE practitioner_signups SET status = ${status}, notes = coalesce(${notes ?? null}, notes) WHERE id = ${signupId}`);
      await audit({ actorUserId: v.userId, actorRole: actorRole(v), action: "practitioner_signup.status", objectType: "practitioner_signup", objectId: signupId, changedFields: { from: before.rows[0].status, to: status } }, tx);
    });
    revalidatePath("/admin", "layout");
    return { notice: `Sign-up marked ${status.replace("_", " ")}` };
  });
}

const createSupportSchema = z.object({
  category: z.enum(SUPPORT_CATEGORIES as [string, ...string[]]),
  priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
  requesterContact: zOpt(200),
  linkedType: z.enum(["", "practitioner", "booking", "review", "clinic"]).optional(),
  linkedId: zOpt(40),
  description: zReq(5000, 5),
});

/** ADM-07: support cases link to a listing, booking, review or clinic and track ownership. */
export async function createSupportAction(fd: FormData) {
  const v = await requireStaff("support_agent");
  const i = parseForm(createSupportSchema, fd);
  await act("/admin/support/new", async () => {
    if (i.linkedType && !i.linkedId) throw new ApiError("INVALID_INPUT", "Linked record id is required");
    const id = await withTransaction(async (_c, tx) => {
      const reference = `SUP-${ref()}`;
      const r = await tx.execute<{ id: string }>(sql`INSERT INTO support_cases (reference, requester_contact, category, linked_type, linked_id, priority, state, assignee_user_id, description)
        VALUES (${reference}, ${i.requesterContact ?? null}, ${i.category}, ${i.linkedType || null}, ${i.linkedType && i.linkedId ? i.linkedId : null}::uuid, ${i.priority}::priority, 'open', ${v.userId}, ${i.description}) RETURNING id`);
      await tx.execute(sql`INSERT INTO support_case_events (case_id, actor_user_id, event_type, payload) VALUES (${r.rows[0].id}, ${v.userId}, 'opened', ${JSON.stringify({ reference, category: i.category })}::jsonb)`);
      await audit({ actorUserId: v.userId, actorRole: actorRole(v), action: "support.create", objectType: "support_case", objectId: r.rows[0].id, changedFields: { reference, category: i.category } }, tx);
      return r.rows[0].id;
    });
    revalidatePath("/admin", "layout");
    return { path: `/admin/support/${id}`, notice: "Support case created" };
  });
}

const updateSupportSchema = z.object({
  caseId: zUuid,
  op: z.enum(["assign_me", "assign", "unassign", "state", "category", "priority", "note", "resolve"]),
  assigneeUserId: zOpt(40),
  state: z.enum(["open", "in_progress", "waiting_on_requester", "resolved", "closed"]).optional(),
  category: zOpt(40),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
  note: zOpt(4000),
  resolution: zOpt(4000),
});

export async function updateSupportAction(fd: FormData) {
  const v = await requireStaff("support_agent");
  const i = parseForm(updateSupportSchema, fd);
  await act(`/admin/support/${i.caseId}`, async () => {
    const notice = await withTransaction(async (_c, tx) => {
      const cur = await tx.execute<{ state: string; assignee_user_id: string | null }>(sql`SELECT state, assignee_user_id FROM support_cases WHERE id = ${i.caseId} FOR UPDATE`);
      if (!cur.rows[0]) throw new ApiError("NOT_FOUND", "Case not found");
      const ev = async (type: string, payload: Record<string, unknown>) => tx.execute(sql`INSERT INTO support_case_events (case_id, actor_user_id, event_type, payload) VALUES (${i.caseId}, ${v.userId}, ${type}, ${JSON.stringify(payload)}::jsonb)`);
      let msg = "Updated";
      switch (i.op) {
        case "assign_me":
        case "assign": {
          const to = i.op === "assign_me" ? v.userId : i.assigneeUserId || null;
          await tx.execute(sql`UPDATE support_cases SET assignee_user_id = ${to}, state = CASE WHEN state = 'open' AND ${to}::uuid IS NOT NULL THEN 'in_progress'::support_state ELSE state END WHERE id = ${i.caseId}`);
          await ev("assigned", { to });
          msg = "Assigned";
          break;
        }
        case "unassign":
          await tx.execute(sql`UPDATE support_cases SET assignee_user_id = NULL WHERE id = ${i.caseId}`);
          await ev("unassigned", {});
          msg = "Unassigned";
          break;
        case "state":
          if (!i.state) throw new ApiError("INVALID_INPUT", "State required");
          await tx.execute(sql`UPDATE support_cases SET state = ${i.state}::support_state, resolved_at = CASE WHEN ${i.state} IN ('resolved','closed') THEN coalesce(resolved_at, now()) ELSE NULL END WHERE id = ${i.caseId}`);
          await ev("state", { from: cur.rows[0].state, to: i.state });
          msg = `State set to ${i.state.replace(/_/g, " ")}`;
          break;
        case "category":
          if (!i.category || !SUPPORT_CATEGORIES.includes(i.category)) throw new ApiError("INVALID_INPUT", "Unknown category");
          await tx.execute(sql`UPDATE support_cases SET category = ${i.category} WHERE id = ${i.caseId}`);
          await ev("category", { to: i.category });
          msg = "Category updated";
          break;
        case "priority":
          if (!i.priority) throw new ApiError("INVALID_INPUT", "Priority required");
          await tx.execute(sql`UPDATE support_cases SET priority = ${i.priority}::priority WHERE id = ${i.caseId}`);
          await ev("priority", { to: i.priority });
          msg = "Priority updated";
          break;
        case "note":
          if (!i.note) throw new ApiError("INVALID_INPUT", "Note is empty");
          await ev("note", { note: i.note });
          msg = "Note added";
          break;
        case "resolve":
          if (!i.resolution || i.resolution.length < 3) throw new ApiError("INVALID_INPUT", "Describe the resolution");
          await tx.execute(sql`UPDATE support_cases SET state = 'resolved', resolution = ${i.resolution}, resolved_at = now() WHERE id = ${i.caseId}`);
          await ev("resolved", { resolution: i.resolution });
          msg = "Resolved. The requester keeps an appeal path through a new case (ADM-07).";
          break;
      }
      await audit({ actorUserId: v.userId, actorRole: actorRole(v), action: `support.${i.op}`, objectType: "support_case", objectId: i.caseId, changedFields: { state: i.state, category: i.category, priority: i.priority, assigneeUserId: i.assigneeUserId } }, tx);
      return msg;
    });
    revalidatePath("/admin", "layout");
    return { notice };
  });
}

const privacySchema = z.object({ requestId: zUuid, op: z.enum(["verify", "assign_me", "assign", "start", "resolve", "reject"]), assigneeUserId: zOpt(40), resolution: zOpt(4000), reason: zOpt(2000) });

/** Section 26: privacy requests are verified, assigned and resolved with a written outcome. */
export async function privacyAction(fd: FormData) {
  const v = await requireStaff("support_agent");
  const i = parseForm(privacySchema, fd);
  await act(`/admin/privacy/${i.requestId}`, async () => {
    const notice = await withTransaction(async (_c, tx) => {
      const cur = await tx.execute<{ state: string }>(sql`SELECT state FROM privacy_requests WHERE id = ${i.requestId} FOR UPDATE`);
      if (!cur.rows[0]) throw new ApiError("NOT_FOUND", "Request not found");
      if (["completed", "rejected"].includes(cur.rows[0].state) && i.op !== "assign" && i.op !== "assign_me") throw new ApiError("CONFLICT", `Request already ${cur.rows[0].state}`);
      let msg = "Updated";
      switch (i.op) {
        case "verify":
          await tx.execute(sql`UPDATE privacy_requests SET verified_at = now(), state = CASE WHEN state = 'received' THEN 'verified'::privacy_request_state ELSE state END WHERE id = ${i.requestId}`);
          msg = "Requester identity recorded as verified";
          break;
        case "assign_me":
        case "assign":
          await tx.execute(sql`UPDATE privacy_requests SET assignee_user_id = ${i.op === "assign_me" ? v.userId : i.assigneeUserId || null} WHERE id = ${i.requestId}`);
          msg = "Assigned";
          break;
        case "start":
          await tx.execute(sql`UPDATE privacy_requests SET state = 'in_progress' WHERE id = ${i.requestId}`);
          msg = "In progress";
          break;
        case "resolve":
          if (!i.resolution || i.resolution.length < 3) throw new ApiError("INVALID_INPUT", "Describe the resolution");
          await tx.execute(sql`UPDATE privacy_requests SET state = 'completed', resolution = ${i.resolution}, resolved_at = now() WHERE id = ${i.requestId}`);
          msg = "Completed";
          break;
        case "reject":
          if (!i.reason || i.reason.length < 3) throw new ApiError("INVALID_INPUT", "A reason is required");
          await tx.execute(sql`UPDATE privacy_requests SET state = 'rejected', resolution = ${i.reason}, resolved_at = now() WHERE id = ${i.requestId}`);
          msg = "Rejected with reason";
          break;
      }
      await audit({ actorUserId: v.userId, actorRole: actorRole(v), action: `privacy.${i.op}`, objectType: "privacy_request", objectId: i.requestId, reason: i.reason ?? i.resolution ?? null, changedFields: { from: cur.rows[0].state } }, tx);
      return msg;
    });
    revalidatePath("/admin", "layout");
    return { notice };
  });
}
