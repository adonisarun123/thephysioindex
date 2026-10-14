import { sql } from "drizzle-orm";
import { db, withTransaction, type Db } from "@/db/client";
import { getConfigMap } from "@/lib/config";
import { formatPaise } from "@/lib/money";
import { classify, dedupeKey, localDateTime, nextStateAfterFailure, placeholders, reminderKey, reminderTimes, render, SendError } from "./core";
import { email } from "./email";
import { sms } from "./sms";

/**
 * Notification delivery (Section 13, MSG-01, MSG-02).
 *
 * Two stages, both safe to run concurrently from several instances:
 *  1. Fan-out: committed outbox events → `notification_deliveries` rows, one per
 *     recipient, channel and template version (dedupe key). Reminders are
 *     scheduled here. Consumption is recorded in `processed_events` (API-09).
 *  2. Send: due deliveries are leased (attempts + 1, scheduled_for pushed out)
 *     in a short transaction, then sent with no database locks held (BKG-12).
 *     Temporary failures back off; permanent ones go to the operations queue
 *     (state `dead`, admin → Notifications).
 */

const CONSUMER = "notifications";
const LEASE_MINUTES = 5;
export const NOTIFIED_EVENTS = ["booking.confirmed", "booking.rescheduled", "booking.cancelled", "booking.cancellation_requested", "booking.completed", "verification.decided"];

type Channel = "sms" | "email";
type Recipient = { type: "user" | "patient"; id: string };

type OutboxRow = {
  id: string;
  event_id: string;
  aggregate_id: string;
  aggregate_version: string | number;
  event_type: string;
  payload: Record<string, unknown>;
  occurred_at: Date;
};

type BookingRow = {
  id: string;
  status: string;
  version: number;
  starts_at: Date;
  completed_at: Date | null;
  source: string;
  notify_patient: boolean;
  booked_by_user_id: string | null;
  patient_id: string;
  practitioner_user_id: string | null;
};

function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "https://www.thephysioindex.com").replace(/\/$/, "");
}

// ---------------------------------------------------------------- fan-out

/** Fan out one batch of outbox events. Returns how many events were consumed. */
export async function fanOutBatch(limit = 50): Promise<number> {
  const cfg = await getConfigMap(["reminders.offsets_minutes", "notifications.max_event_age_hours", "reviews.invite_delay_minutes"]);
  const offsets = Array.isArray(cfg["reminders.offsets_minutes"]) ? (cfg["reminders.offsets_minutes"] as number[]).map(Number) : [1440, 120];
  const inviteDelay = Number(cfg["reviews.invite_delay_minutes"] ?? 120);
  const maxAgeHours = Number(cfg["notifications.max_event_age_hours"] ?? 24);

  return withTransaction(async (_c, tx) => {
    const res = await tx.execute<OutboxRow>(sql`
      SELECT o.id, o.event_id, o.aggregate_id, o.aggregate_version, o.event_type, o.payload, o.occurred_at
      FROM outbox_events o
      WHERE o.state IN ('pending', 'failed') AND o.available_at <= now()
        AND o.event_type IN (${sql.join(NOTIFIED_EVENTS.map((e) => sql`${e}`), sql`, `)})
        AND NOT EXISTS (SELECT 1 FROM processed_events pe WHERE pe.consumer = ${CONSUMER} AND pe.event_id = o.event_id)
      ORDER BY o.occurred_at, o.id
      LIMIT ${limit}
      FOR UPDATE OF o SKIP LOCKED`);
    for (const ev of res.rows) {
      const ageHours = (Date.now() - new Date(ev.occurred_at).getTime()) / 3_600_000;
      // Old events (worker outage, first deploy) are consumed silently rather than sent late.
      if (ageHours <= maxAgeHours) await planEvent(tx, ev, offsets, inviteDelay);
      await tx.execute(sql`INSERT INTO processed_events (consumer, event_id) VALUES (${CONSUMER}, ${ev.event_id}) ON CONFLICT DO NOTHING`);
    }
    return res.rows.length;
  });
}

async function planEvent(tx: Db, ev: OutboxRow, offsets: number[], inviteDelayMinutes: number) {
  if (ev.event_type === "verification.decided") {
    const userId = typeof ev.payload.recipientUserId === "string" ? ev.payload.recipientUserId : null;
    if (userId) await queueFor(tx, ev, { type: "user", id: userId }, "verification.decided", { bookingId: null });
    return;
  }

  const b = (
    await tx.execute<BookingRow>(sql`
      SELECT b.id, b.status, b.version, b.starts_at, b.completed_at, b.source, b.notify_patient, b.booked_by_user_id, b.patient_id, p.owner_user_id AS practitioner_user_id
      FROM bookings b JOIN practitioners p ON p.id = b.practitioner_id
      WHERE b.id = ${ev.aggregate_id}`)
  ).rows[0];
  if (!b) return;

  // Platform bookings reach the account that booked (guardians included); walk-ins and phone entries reach the patient record's mobile.
  const patient: Recipient | null = !b.notify_patient ? null : b.source === "platform" && b.booked_by_user_id ? { type: "user", id: b.booked_by_user_id } : { type: "patient", id: b.patient_id };
  const practitioner: Recipient | null = b.practitioner_user_id ? { type: "user", id: b.practitioner_user_id } : null;
  const version = Number(ev.aggregate_version);
  const by = ev.payload.by;

  switch (ev.event_type) {
    case "booking.confirmed":
      if (patient) await queueFor(tx, ev, patient, "booking.confirmed", { bookingId: b.id });
      // A walk-in or phone booking was entered by the practice itself.
      if (practitioner && b.source === "platform") await queueFor(tx, ev, practitioner, "booking.confirmed.practitioner", { bookingId: b.id });
      if (patient) await queueReminders(tx, ev, patient, b, version, offsets);
      break;
    case "booking.rescheduled":
      await cancelPendingReminders(tx, b.id);
      if (patient) await queueFor(tx, ev, patient, "booking.rescheduled", { bookingId: b.id });
      if (practitioner) await queueFor(tx, ev, practitioner, "booking.rescheduled.practitioner", { bookingId: b.id });
      if (patient) await queueReminders(tx, ev, patient, b, version, offsets);
      break;
    case "booking.cancelled":
      await cancelPendingReminders(tx, b.id);
      if (patient) await queueFor(tx, ev, patient, "booking.cancelled", { bookingId: b.id });
      if (practitioner && by !== "provider") await queueFor(tx, ev, practitioner, "booking.cancelled.practitioner", { bookingId: b.id });
      break;
    case "booking.completed":
      // Review invitation (Section 13): patient only, a fixed delay after the visit was marked completed.
      if (patient && b.completed_at) {
        const at = new Date(new Date(b.completed_at).getTime() + inviteDelayMinutes * 60_000);
        await queueFor(tx, ev, patient, "review.invitation", { bookingId: b.id, scheduledFor: at, keyFor: (ch) => `review-invite:${b.id}:${ch}` });
      }
      break;
    case "booking.cancellation_requested":
      if (patient) await queueFor(tx, ev, patient, "booking.cancellation_requested", { bookingId: b.id });
      if (practitioner) await queueFor(tx, ev, practitioner, "booking.cancellation_requested.practitioner", { bookingId: b.id });
      break;
  }
}

/** MSG-02: a reschedule or cancellation retires reminders scheduled for the old time. */
async function cancelPendingReminders(tx: Db, bookingId: string) {
  await tx.execute(sql`
    UPDATE notification_deliveries SET state = 'cancelled', last_error = 'superseded by a booking change', updated_at = now()
    WHERE booking_id = ${bookingId} AND state IN ('queued', 'failed') AND dedupe_key LIKE 'reminder:%'`);
}

async function queueReminders(tx: Db, ev: OutboxRow, r: Recipient, b: BookingRow, version: number, offsets: number[]) {
  const times = reminderTimes(new Date(b.starts_at), offsets, new Date());
  for (const t of times) {
    await queueFor(tx, ev, r, "booking.reminder", { bookingId: b.id, scheduledFor: t.at, aggregateVersion: version, keyFor: (ch) => reminderKey(b.id, version, t.offset, ch) });
  }
}

type QueueOpts = { bookingId: string | null; scheduledFor?: Date; aggregateVersion?: number; keyFor?: (channel: Channel) => string };

/** One delivery per channel the recipient can and agrees to receive, if a template exists for it. */
async function queueFor(tx: Db, ev: OutboxRow, r: Recipient, templateEvent: string, o: QueueOpts) {
  const contact = await loadContact(tx, r);
  if (!contact) return;
  for (const channel of contact.channels) {
    const t = await pickTemplate(tx, templateEvent, channel, contact.language);
    if (!t) continue;
    const key = o.keyFor ? o.keyFor(channel) : dedupeKey({ eventId: ev.event_id, recipientType: r.type, recipientId: r.id, channel, templateVersion: t.version });
    await tx.execute(sql`
      INSERT INTO notification_deliveries (event_id, booking_id, recipient_type, recipient_id, channel, template_id, dedupe_key, scheduled_for, aggregate_version)
      VALUES (${ev.event_id}, ${o.bookingId}, ${r.type}, ${r.id}, ${channel}::channel, ${t.id}, ${key}, ${o.scheduledFor ? o.scheduledFor.toISOString() : sql`now()`}::timestamptz, ${o.aggregateVersion ?? null})
      ON CONFLICT (dedupe_key) DO NOTHING`);
  }
}

type Contact = { mobile: string | null; email: string | null; channels: Channel[]; language: string };

/** Verified contact details and transactional preferences, read when needed so later changes are honoured. */
async function loadContact(tx: Db, r: Recipient): Promise<Contact | null> {
  if (r.type === "patient") {
    const p = (await tx.execute<{ mobile: string | null }>(sql`SELECT mobile FROM patients WHERE id = ${r.id} AND status = 'active'`)).rows[0];
    if (!p?.mobile) return null;
    return { mobile: p.mobile, email: null, channels: ["sms"], language: "en" };
  }
  const u = (
    await tx.execute<{ mobile: string | null; email: string | null; sms_ok: boolean | null; email_ok: boolean | null; language: string | null }>(sql`
      SELECT CASE WHEN u.mobile_verified_at IS NOT NULL THEN u.mobile END AS mobile,
             CASE WHEN u.email_verified_at IS NOT NULL THEN u.email END AS email,
             np.transactional_sms AS sms_ok, np.transactional_email AS email_ok, np.preferred_language AS language
      FROM users u LEFT JOIN notification_preferences np ON np.user_id = u.id
      WHERE u.id = ${r.id} AND u.status = 'active'`)
  ).rows[0];
  if (!u) return null;
  const channels: Channel[] = [];
  if (u.mobile && u.sms_ok !== false) channels.push("sms");
  if (u.email && u.email_ok !== false) channels.push("email");
  return { mobile: u.mobile, email: u.email, channels, language: u.language ?? "en" };
}

async function pickTemplate(tx: Db, eventType: string, channel: Channel, language: string): Promise<{ id: string; version: number } | null> {
  const res = await tx.execute<{ id: string; version: number }>(sql`
    SELECT id, version FROM notification_templates
    WHERE event_type = ${eventType} AND channel = ${channel}::channel AND active AND language IN (${language}, 'en')
    ORDER BY (language = ${language}) DESC, version DESC LIMIT 1`);
  return res.rows[0] ?? null;
}

// ---------------------------------------------------------------- send

type Leased = {
  id: string;
  event_id: string;
  booking_id: string | null;
  recipient_type: "user" | "patient";
  recipient_id: string;
  channel: Channel;
  dedupe_key: string;
  aggregate_version: string | number | null;
  attempts: number;
  subject: string | null;
  body: string;
  provider_template_id: string | null;
  template_event: string;
};

/** Lease and send one batch of due deliveries. Returns how many were attempted. */
export async function sendBatch(limit = 25): Promise<number> {
  const leased = await withTransaction(async (_c, tx) => {
    const res = await tx.execute<Leased>(sql`
      WITH due AS (
        SELECT id FROM notification_deliveries
        WHERE state IN ('queued', 'failed') AND scheduled_for <= now()
        ORDER BY scheduled_for, id
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      )
      UPDATE notification_deliveries d
      SET attempts = d.attempts + 1, scheduled_for = now() + make_interval(mins => ${LEASE_MINUTES}), updated_at = now()
      FROM due, notification_templates t
      WHERE d.id = due.id AND t.id = d.template_id
      RETURNING d.id, d.event_id, d.booking_id, d.recipient_type, d.recipient_id, d.channel, d.dedupe_key, d.aggregate_version, d.attempts,
                t.subject, t.body, t.provider_template_id, t.event_type AS template_event`);
    return res.rows;
  });
  for (const d of leased) await deliver(d);
  return leased.length;
}

async function deliver(d: Leased): Promise<void> {
  const conn = db();
  try {
    const contact = await loadContact(conn, { type: d.recipient_type, id: d.recipient_id });
    const address = d.channel === "sms" ? contact?.mobile : contact?.email;
    if (!contact || !address || !contact.channels.includes(d.channel)) {
      await finish(d.id, "cancelled", "recipient has no verified contact for this channel or opted out");
      return;
    }

    const vars = d.template_event === "verification.decided" ? await verificationVars(d.event_id) : await bookingVars(d);
    if (vars === "stale") {
      await finish(d.id, "cancelled", "stale: booking changed, cancelled or already started");
      return;
    }

    const text = render(d.body, vars);
    if (d.channel === "sms") {
      const smsVars = Object.fromEntries(placeholders(d.body).map((k) => [k, String(vars[k])]));
      const r = await sms().sendNotification(address, { text, providerTemplateId: d.provider_template_id, vars: smsVars });
      await finish(d.id, "sent", null, r.providerRef);
    } else {
      const r = await email().send(address, render(d.subject ?? "The Physio Index", vars), text);
      await finish(d.id, "sent", null, r.providerRef);
    }
  } catch (err) {
    const e = classify(err);
    const next = nextStateAfterFailure(d.attempts, e.permanent);
    await conn.execute(sql`
      UPDATE notification_deliveries SET state = ${next.state}::delivery_state, last_error = ${e.message.slice(0, 500)}, updated_at = now(),
        scheduled_for = CASE WHEN ${next.retryInMinutes}::int IS NULL THEN scheduled_for ELSE now() + make_interval(mins => ${next.retryInMinutes}::int) END
      WHERE id = ${d.id}`);
    if (next.state === "dead") console.error(`[notify] delivery ${d.id} dead: ${e.message}`);
  }
}

async function finish(id: string, state: "sent" | "cancelled", error: string | null, providerRef?: string) {
  await db().execute(sql`
    UPDATE notification_deliveries SET state = ${state}::delivery_state, last_error = ${error}, provider_ref = ${providerRef ?? null},
      sent_at = CASE WHEN ${state} = 'sent' THEN now() ELSE sent_at END, updated_at = now()
    WHERE id = ${id}`);
}

type Vars = Record<string, string>;

async function bookingVars(d: Leased): Promise<Vars | "stale"> {
  if (!d.booking_id) throw new SendError("booking message without a booking", true);
  const b = (
    await db().execute<{
      id: string;
      reference: string;
      status: string;
      version: number;
      starts_at: Date;
      practitioner_name: string;
      practitioner_path: string;
      branch_name: string;
      clinic_name: string;
      locality: string;
      city: string;
      address_line1: string;
      address_line2: string | null;
      pin_code: string;
      total_paise: string | number | null;
      cutoff_hours: number | null;
      has_review: boolean;
    }>(sql`
      SELECT b.id, b.reference, b.status, b.version, b.starts_at,
             pr.display_name AS practitioner_name, pr.slug || '-' || pr.public_id AS practitioner_path,
             br.name AS branch_name, c.name AS clinic_name, l.name AS locality, ci.name AS city, br.address_line1, br.address_line2, br.pin_code,
             s.total_paise,
             (SELECT (value #>> '{}')::int FROM platform_config WHERE key = 'booking.self_service_cutoff_hours') AS cutoff_hours,
             EXISTS (SELECT 1 FROM reviews r WHERE r.booking_id = b.id) AS has_review
      FROM bookings b
      JOIN practitioners pr ON pr.id = b.practitioner_id
      JOIN branches br ON br.id = b.branch_id
      JOIN clinics c ON c.id = br.clinic_id
      JOIN localities l ON l.id = br.locality_id
      JOIN cities ci ON ci.id = br.city_id
      LEFT JOIN booking_price_snapshots s ON s.id = b.price_snapshot_id
      WHERE b.id = ${d.booking_id}`)
  ).rows[0];
  if (!b) throw new SendError("booking not found", true);

  // MSG-02: recheck the booking right before a reminder goes out.
  if (d.dedupe_key.startsWith("reminder:")) {
    const stale = b.status !== "confirmed" || Number(b.version) !== Number(d.aggregate_version) || new Date(b.starts_at).getTime() <= Date.now();
    if (stale) return "stale";
  }
  // A review invitation is pointless once the visit is no longer completed or already reviewed.
  if (d.template_event === "review.invitation" && (b.status !== "completed" || b.has_review)) return "stale";

  const base = appUrl();
  return {
    reference: b.reference,
    localDateTime: localDateTime(b.starts_at),
    practitionerName: b.practitioner_name,
    branchName: b.branch_name,
    clinicName: b.clinic_name,
    locality: b.locality,
    address: [b.address_line1, b.address_line2, b.locality, `${b.city} ${b.pin_code}`].filter(Boolean).join(", "),
    amount: b.total_paise === null ? "as quoted by the clinic" : formatPaise(Number(b.total_paise)),
    policySummary: `Free cancellation or rescheduling up to ${b.cutoff_hours ?? 12} hours before the appointment.`,
    // Opaque booking id; the page requires sign-in before any change (MSG-02).
    manageUrl: `${base}/account/bookings/${b.id}`,
    rebookUrl: `${base}/physiotherapist/${b.practitioner_path}`,
    reviewUrl: `${base}/account/bookings/${b.id}/review`,
    workspaceUrl: `${base}/workspace/appointments`,
  };
}

const DECISION_LABEL: Record<string, string> = { approved: "Approved", rejected: "Not approved", changes_requested: "Changes requested" };
const NEXT_ACTION: Record<string, string> = {
  approved: "No action needed.",
  rejected: "If you think this is wrong, reply through support in your workspace.",
  changes_requested: "Sign in, update your submission and resubmit it.",
};

async function verificationVars(eventId: string): Promise<Vars> {
  const ev = (await db().execute<{ payload: Record<string, unknown> }>(sql`SELECT payload FROM outbox_events WHERE event_id = ${eventId}`)).rows[0];
  if (!ev) throw new SendError("source event not found", true);
  const decision = String(ev.payload.decision ?? "");
  return {
    decision: DECISION_LABEL[decision] ?? decision.replace(/_/g, " "),
    reason: String(ev.payload.reason ?? "—"),
    nextAction: NEXT_ACTION[decision] ?? "Sign in to your workspace for details.",
    subject: String(ev.payload.subjectLabel ?? "your listing"),
    workspaceUrl: `${appUrl()}/workspace`,
  };
}

// ---------------------------------------------------------------- driver

export type DispatchResult = { fannedOut: number; attempted: number; elapsedMs: number };

/** Run both stages until there is no work left or the time budget is used. */
export async function runDispatch(opts: { budgetMs?: number } = {}): Promise<DispatchResult> {
  const started = Date.now();
  const budget = opts.budgetMs ?? 45_000;
  const left = () => budget - (Date.now() - started);
  let fannedOut = 0;
  let attempted = 0;
  while (left() > 0) {
    const n = await fanOutBatch();
    fannedOut += n;
    if (n === 0) break;
  }
  // Leave headroom for one provider timeout (8 s) per batch item in flight.
  while (left() > 10_000) {
    const n = await sendBatch();
    attempted += n;
    if (n === 0) break;
  }
  return { fannedOut, attempted, elapsedMs: Date.now() - started };
}
