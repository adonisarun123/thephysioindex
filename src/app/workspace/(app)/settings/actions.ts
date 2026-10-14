"use server";

import { sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, withTransaction } from "@/db/client";
import { ApiError } from "@/lib/api";
import { audit } from "@/lib/audit";
import { requireManage, requireOwner } from "@/lib/workspace/context";
import { bool, done, failTo, opt, str } from "@/lib/workspace/forms";

const PAGE = "/workspace/settings";

export async function savePreferencesAction(formData: FormData) {
  try {
    const { viewer } = await requireManage();
    const lang = opt(formData, "preferredLanguage") ?? "en";
    if (!/^[a-z]{2}(-[A-Z]{2})?$/.test(lang)) throw new ApiError("INVALID_INPUT", "Choose a language");
    await db().execute(sql`
      INSERT INTO notification_preferences (user_id, transactional_sms, transactional_email, whatsapp_opt_in, marketing_opt_in, preferred_language)
      VALUES (${viewer.userId}, ${bool(formData, "transactionalSms")}, ${bool(formData, "transactionalEmail")}, ${bool(formData, "whatsappOptIn")}, ${bool(formData, "marketingOptIn")}, ${lang})
      ON CONFLICT (user_id) DO UPDATE SET transactional_sms = excluded.transactional_sms, transactional_email = excluded.transactional_email,
        whatsapp_opt_in = excluded.whatsapp_opt_in, marketing_opt_in = excluded.marketing_opt_in, preferred_language = excluded.preferred_language`);
    await audit({ actorUserId: viewer.userId, action: "notifications.preferences.save", objectType: "user", objectId: viewer.userId });
    revalidatePath(PAGE);
    done(PAGE, { ok: "Notification preferences saved" });
  } catch (err) {
    failTo(PAGE, err);
  }
}

/** PRO-18: pause new bookings without removing the directory profile. */
export async function setBookingPausedAction(formData: FormData) {
  try {
    const { viewer, practitioner } = await requireManage();
    const paused = str(formData, "paused") === "1";
    await withTransaction(async (_c, tx) => {
      await tx.execute(sql`UPDATE practitioners SET booking_paused = ${paused} WHERE id = ${practitioner.id}`);
      await tx.execute(sql`
        INSERT INTO outbox_events (aggregate_type, aggregate_id, event_type, payload)
        VALUES ('practitioner', ${practitioner.id}::uuid, ${paused ? "practitioner.booking_paused" : "practitioner.booking_resumed"}, ${JSON.stringify({ practitionerId: practitioner.id })}::jsonb)`);
      await audit({ actorUserId: viewer.userId, action: paused ? "booking.pause" : "booking.resume", objectType: "practitioner", objectId: practitioner.id }, tx);
    });
    revalidatePath(PAGE);
    revalidatePath("/workspace");
    revalidatePath(`/physiotherapist/${practitioner.slug}-${practitioner.publicId}`);
    done(PAGE, { ok: paused ? "New bookings paused. Your profile stays listed and says online booking is unavailable." : "New bookings resumed." });
  } catch (err) {
    failTo(PAGE, err);
  }
}

/** PRO-18 / SEC-07: closure is a privacy request; future bookings are resolved by support before anything is removed. */
export async function requestClosureAction(formData: FormData) {
  try {
    const { viewer, practitioner } = await requireOwner();
    if (!bool(formData, "confirm")) throw new ApiError("INVALID_INPUT", "Tick the confirmation to request closure");
    const note = opt(formData, "note") ?? "";
    await withTransaction(async (_c, tx) => {
      const open = await tx.execute<{ n: string | number }>(sql`SELECT count(*) AS n FROM privacy_requests WHERE request_type = 'erasure' AND subject_type = 'practitioner' AND subject_id = ${practitioner.id} AND state NOT IN ('completed', 'rejected')`);
      if (Number(open.rows[0]?.n) > 0) throw new ApiError("CONFLICT", "A closure request is already open");
      const future = await tx.execute<{ n: string | number }>(sql`SELECT count(*) AS n FROM bookings WHERE practitioner_id = ${practitioner.id} AND status = 'confirmed' AND starts_at > now()`);
      const pr = await tx.execute<{ id: string }>(sql`
        INSERT INTO privacy_requests (requester_user_id, requester_contact, request_type, subject_type, subject_id, due_at, details)
        VALUES (${viewer.userId}, ${viewer.mobile ?? viewer.email ?? null}, 'erasure', 'practitioner', ${practitioner.id}, now() + interval '30 days', ${`Practitioner account closure requested from workspace. Future confirmed bookings: ${Number(future.rows[0]?.n ?? 0)}. Note: ${note}`})
        RETURNING id`);
      const ref = `TPI-SUP-${pr.rows[0].id.slice(0, 8).toUpperCase()}`;
      await tx.execute(sql`
        INSERT INTO support_cases (reference, requester_user_id, requester_contact, category, linked_type, linked_id, priority, description)
        VALUES (${ref}, ${viewer.userId}, ${viewer.mobile ?? viewer.email ?? null}, 'account_closure', 'practitioner', ${practitioner.id}, 'high',
          ${`Account closure requested. Resolve ${Number(future.rows[0]?.n ?? 0)} future booking(s) and transfer operational obligations before erasure (PRO-18). Practitioner note: ${note || "none"}`})`);
      if (Number(future.rows[0]?.n) > 0) {
        await tx.execute(sql`INSERT INTO resolution_tasks (kind, practitioner_id, details) VALUES ('account_closure', ${practitioner.id}, ${JSON.stringify({ privacyRequestId: pr.rows[0].id, futureBookings: Number(future.rows[0]?.n) })}::jsonb)`);
      }
      await audit({ actorUserId: viewer.userId, action: "account.closure.request", objectType: "practitioner", objectId: practitioner.id, changedFields: { privacyRequestId: pr.rows[0].id } }, tx);
    });
    revalidatePath(PAGE);
    done(PAGE, { ok: "Closure requested. Support will resolve any future appointments with you before the profile is removed; historical records follow the retention policy." });
  } catch (err) {
    failTo(`${PAGE}#closure`, err);
  }
}

/** Withdraws publication consent; the listing is taken down for review rather than silently deleted (SEC-07). */
export async function withdrawPublicationAction(formData: FormData) {
  try {
    const { viewer, practitioner } = await requireOwner();
    if (!bool(formData, "confirm")) throw new ApiError("INVALID_INPUT", "Tick the confirmation to withdraw consent");
    await withTransaction(async (_c, tx) => {
      const v = await tx.execute<{ notice_version: string }>(sql`SELECT notice_version FROM consent_records WHERE subject_type = 'practitioner' AND subject_id = ${practitioner.id} AND purpose = 'profile_publication' ORDER BY captured_at DESC LIMIT 1`);
      await tx.execute(sql`
        INSERT INTO consent_records (subject_type, subject_id, purpose, notice_version, action, source, actor_user_id)
        VALUES ('practitioner', ${practitioner.id}, 'profile_publication', ${v.rows[0]?.notice_version ?? "unknown"}, 'withdrawn', 'web', ${viewer.userId})`);
      await tx.execute(sql`UPDATE practitioners SET booking_paused = true WHERE id = ${practitioner.id}`);
      await tx.execute(sql`
        INSERT INTO support_cases (reference, requester_user_id, category, linked_type, linked_id, priority, description)
        VALUES (${`TPI-SUP-${practitioner.publicId.toUpperCase()}-${Date.now().toString(36).toUpperCase()}`}, ${viewer.userId}, 'consent_withdrawn', 'practitioner', ${practitioner.id}, 'high', 'Publication consent withdrawn from workspace; unpublish the listing and confirm with the practitioner.')`);
      await audit({ actorUserId: viewer.userId, action: "consent.withdraw", objectType: "practitioner", objectId: practitioner.id, changedFields: { purpose: "profile_publication" } }, tx);
    });
    revalidatePath(PAGE);
    done(PAGE, { ok: "Publication consent withdrawn. New bookings are paused and support will unpublish your listing." });
  } catch (err) {
    failTo(PAGE, err);
  }
}
