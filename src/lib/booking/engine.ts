import { createHash, randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";
import { withTransaction, type Db } from "@/db/client";
import type { LineItem } from "@/db/schema/scheduling";
import { ApiError } from "@/lib/api";
import { audit } from "@/lib/audit";
import { getConfigMap } from "@/lib/config";
import { assertPatientAuthority } from "./patients";
import { loadOffers, priceLines, selectOffer, type OfferTerms, type Quote } from "./quote";
import { buildSlots, loadOfferingContext, loadScheduleInputs, occupiedInterval, unbookableReason, UNBOOKABLE_MESSAGES, type OfferingContext, type Slot } from "./slots";
import { addDays, BOOKING_TZ, localDateOf, localToUtcMs } from "./time";

/**
 * Booking engine (Sections 11 and 12).
 *
 * Every capacity mutation runs in ONE transaction on one pinned connection:
 *   idempotency claim → lock calendar_resources (practitioner) → lock
 *   patient_calendars (patient) → lock offer_versions (only if an offer
 *   applies) → expire elapsed holds → revalidate → write → outbox event.
 * The lock order above is fixed for every path to prevent deadlocks (BKG-07).
 * The exclusion constraints on reservations are the final overlap guard
 * (BKG-08). No network call happens inside these transactions (BKG-12); the
 * outbox is dispatched after commit.
 */

export type Actor = { userId: string; role?: string | null };

const MIN = 60_000;
const SHOW_TEST = () => process.env.SHOW_TEST_ACCOUNTS === "1";

// ---------------------------------------------------------------------------
// Infrastructure: retries, error mapping, idempotency
// ---------------------------------------------------------------------------

const RETRYABLE = new Set(["40P01", "40001", "55P03"]); // deadlock, serialization, lock timeout

/** Bounded retries for deadlocks and lock timeouts, safe because each attempt reuses the same idempotency key (BKG-12). */
async function inTransaction<T>(fn: (tx: Db) => Promise<T>): Promise<T> {
  let attempt = 0;
  for (;;) {
    try {
      return await withTransaction((_c, tx) => fn(tx), { lockTimeoutMs: 3000, statementTimeoutMs: 10_000 });
    } catch (err) {
      const code = (err as { code?: string }).code ?? (err as { cause?: { code?: string } }).cause?.code;
      if (code && RETRYABLE.has(code) && attempt < 3) {
        attempt++;
        await new Promise((r) => setTimeout(r, 25 * attempt + Math.floor(Math.random() * 50)));
        continue;
      }
      throw mapDbError(err);
    }
  }
}

function mapDbError(err: unknown): unknown {
  const e = (err as { code?: string; constraint?: string; cause?: { code?: string; constraint?: string } });
  const code = e.code ?? e.cause?.code;
  const constraint = e.constraint ?? e.cause?.constraint;
  if (code === "23P01" && constraint === "reservations_no_overlap") return new ApiError("SLOT_UNAVAILABLE", "That time was just taken. Please choose another slot.");
  if (code === "23P01" && constraint === "reservations_patient_no_overlap") return new ApiError("CONFLICT", "This patient already has an appointment at that time.");
  if (code === "55P03" || code === "40P01") return new ApiError("DEPENDENCY_UNAVAILABLE", "The calendar is busy. Please try again.");
  return err;
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function requestHash(body: unknown): string {
  return createHash("sha256").update(JSON.stringify(body)).digest("hex");
}

type Claim<T> = { replay: T } | { id: string };

/**
 * Idempotency inside the booking transaction (BKG-10). A concurrent request
 * with the same key waits on the unique index until the first commits, then
 * replays its stored result. A rolled-back attempt leaves no record, so the
 * client can retry safely with the same key.
 */
async function claimIdempotency<T>(tx: Db, actorId: string, route: string, key: string, body: unknown): Promise<Claim<T>> {
  if (!key || key.length < 8 || key.length > 200) throw new ApiError("INVALID_INPUT", "A valid Idempotency-Key is required");
  const keyHash = hashToken(key);
  const reqHash = requestHash(body);
  const ins = await tx.execute<{ id: string }>(sql`
    INSERT INTO idempotency_records (actor_id, route, key_hash, request_hash, state, expires_at)
    VALUES (${actorId}, ${route}, ${keyHash}, ${reqHash}, 'in_progress',
            now() + make_interval(hours => coalesce((SELECT (value #>> '{}')::int FROM platform_config WHERE key = 'booking.idempotency_retention_hours'), 24)))
    ON CONFLICT (actor_id, route, key_hash) DO NOTHING
    RETURNING id`);
  if (ins.rows[0]) return { id: ins.rows[0].id };
  const ex = await tx.execute<{ id: string; request_hash: string; state: string; response_body: T; expired: boolean }>(sql`
    SELECT id, request_hash, state::text AS state, response_body, (expires_at <= now()) AS expired
    FROM idempotency_records WHERE actor_id = ${actorId} AND route = ${route} AND key_hash = ${keyHash} FOR UPDATE`);
  const row = ex.rows[0];
  if (row.expired) {
    await tx.execute(sql`UPDATE idempotency_records SET request_hash = ${reqHash}, state = 'in_progress', response_body = NULL, status_code = NULL,
      expires_at = now() + interval '24 hours' WHERE id = ${row.id}`);
    return { id: row.id };
  }
  if (row.request_hash !== reqHash) throw new ApiError("CONFLICT", "This idempotency key was already used for a different request.");
  if (row.state === "completed") return { replay: row.response_body };
  throw new ApiError("CONFLICT", "This request is still being processed. Retry with the same key.");
}

async function completeIdempotency(tx: Db, id: string, result: unknown) {
  await tx.execute(sql`UPDATE idempotency_records SET state = 'completed', status_code = 200, response_body = ${JSON.stringify(result)}::jsonb WHERE id = ${id}`);
}

/** Runs `fn` once per (actor, route, key); replays the stored result on retries. */
async function idempotent<T>(actor: Actor, route: string, key: string, body: unknown, fn: (tx: Db) => Promise<T>): Promise<T> {
  return inTransaction(async (tx) => {
    const claim = await claimIdempotency<T>(tx, actor.userId, route, key, body);
    if ("replay" in claim) return claim.replay;
    const result = await fn(tx);
    await completeIdempotency(tx, claim.id, result);
    return result;
  });
}

// ---------------------------------------------------------------------------
// Locks (stable order: practitioner calendar → patient calendar → offer version)
// ---------------------------------------------------------------------------

async function lockCalendar(tx: Db, resourceId: string): Promise<{ scheduleVersion: number; nowMs: number }> {
  const res = await tx.execute<{ schedule_version: string | number; now_ms: string | number }>(sql`
    SELECT schedule_version, (extract(epoch FROM now()) * 1000)::bigint AS now_ms FROM calendar_resources WHERE id = ${resourceId} FOR UPDATE`);
  if (!res.rows[0]) throw new ApiError("NOT_FOUND", "Calendar not found");
  await tx.execute(sql`SELECT expire_elapsed_holds(${resourceId}::uuid)`);
  // Free offer entitlements reserved by holds that just expired on this calendar (OFR-05).
  const red = await tx.execute<{ id: string; offer_version_id: string }>(sql`
    UPDATE offer_redemptions rd SET state = 'released' FROM reservations r
    WHERE rd.reservation_id = r.id AND rd.state = 'reserved' AND r.resource_id = ${resourceId} AND r.state = 'expired'
    RETURNING rd.id, rd.offer_version_id`);
  for (const x of red.rows) {
    await tx.execute(sql`INSERT INTO offer_counter_events (offer_version_id, redemption_id, delta, reason) VALUES (${x.offer_version_id}, ${x.id}, -1, 'hold_expired')`);
  }
  return { scheduleVersion: Number(res.rows[0].schedule_version), nowMs: Number(res.rows[0].now_ms) };
}

async function lockPatient(tx: Db, patientId: string) {
  await tx.execute(sql`INSERT INTO patient_calendars (patient_id) VALUES (${patientId}) ON CONFLICT (patient_id) DO NOTHING`);
  await tx.execute(sql`SELECT id FROM patient_calendars WHERE patient_id = ${patientId} FOR UPDATE`);
  // Elapsed holds on other calendars must not block this patient (BKG-09).
  // SKIP LOCKED: a row another calendar's transaction is touching is left to that transaction, avoiding a lock cycle.
  await tx.execute(sql`UPDATE reservations SET state = 'expired', released_reason = 'hold_expired'
    WHERE id IN (SELECT id FROM reservations WHERE patient_id = ${patientId} AND state = 'held' AND expires_at <= now() FOR UPDATE SKIP LOCKED)`);
}

async function resourceForOffering(tx: Db, offeringId: string): Promise<string> {
  const res = await tx.execute<{ id: string }>(sql`
    SELECT cr.id FROM offerings o JOIN calendar_resources cr ON cr.practitioner_id = o.practitioner_id WHERE o.id = ${offeringId}`);
  if (!res.rows[0]) throw new ApiError("PROFILE_NOT_BOOKABLE", UNBOOKABLE_MESSAGES.no_calendar);
  return res.rows[0].id;
}

async function bookableContext(tx: Db, offeringId: string): Promise<OfferingContext> {
  const ctx = await loadOfferingContext(tx, offeringId);
  if (!ctx) throw new ApiError("NOT_FOUND", "Service not found");
  const reason = unbookableReason(ctx, { showTestAccounts: SHOW_TEST() });
  if (reason === "hidden") throw new ApiError("NOT_FOUND", "Service not found");
  if (reason) throw new ApiError("PROFILE_NOT_BOOKABLE", UNBOOKABLE_MESSAGES[reason]);
  return ctx;
}

/** Recomputes slots under the lock for the start's local date and checks the start is one of them (BKG-07 step 3). */
async function validateStart(tx: Db, ctx: OfferingContext, startsAt: number, nowMs: number): Promise<Slot> {
  const date = localDateOf(startsAt);
  const inputs = await loadScheduleInputs(tx, ctx.resourceId!, localToUtcMs(date, "00:00") - 1440 * MIN, localToUtcMs(addDays(date, 2), "00:00"));
  const slots = buildSlots({ offeringId: ctx.offeringId, branchId: ctx.branchId, terms: ctx.terms, ...inputs, now: nowMs, fromDate: date, toDate: date });
  const slot = slots.find((s) => s.startsAt === startsAt);
  if (!slot) {
    const alternatives = slots.filter((s) => s.startsAt > nowMs).slice(0, 6).map((s) => ({ startsAt: new Date(s.startsAt).toISOString(), localTime: s.localTime }));
    throw new ApiError("SLOT_UNAVAILABLE", "That time is no longer available. Please choose another slot.", { alternatives });
  }
  return slot;
}

function parseInstant(iso: string): number {
  const ms = Date.parse(iso);
  if (!/^\d{4}-\d{2}-\d{2}T/.test(iso) || Number.isNaN(ms)) throw new ApiError("INVALID_INPUT", "Invalid appointment time");
  return ms;
}

async function insertOutbox(tx: Db, e: { aggregateType: string; aggregateId: string; version: number; type: string; payload: Record<string, unknown>; correlationId?: string | null }) {
  await tx.execute(sql`
    INSERT INTO outbox_events (aggregate_type, aggregate_id, aggregate_version, event_type, payload, correlation_id)
    VALUES (${e.aggregateType}, ${e.aggregateId}::uuid, ${e.version}, ${e.type}, ${JSON.stringify(e.payload)}::jsonb, ${e.correlationId ?? null})`);
}

async function bookingEvent(tx: Db, e: { bookingId: string; type: string; actor: Actor; from?: string | null; to?: string | null; reason?: string | null; payload?: Record<string, unknown> }) {
  await tx.execute(sql`
    INSERT INTO booking_events (booking_id, event_type, actor_user_id, actor_role, from_state, to_state, reason, payload)
    VALUES (${e.bookingId}, ${e.type}, ${e.actor.userId}, ${e.actor.role ?? null}, ${e.from ?? null}, ${e.to ?? null}, ${e.reason ?? null}, ${e.payload ? JSON.stringify(e.payload) : null}::jsonb)`);
}

async function insertSnapshot(tx: Db, q: Quote, link: { reservationId?: string | null; bookingId?: string | null; revisionNo?: number }): Promise<string> {
  const res = await tx.execute<{ id: string }>(sql`
    INSERT INTO booking_price_snapshots (booking_id, reservation_id, revision_no, base_paise, discount_paise, tax_paise, extra_paise, total_paise,
      offer_version_id, offer_explanation, policy_version, offering_version_id, line_items)
    VALUES (${link.bookingId ?? null}, ${link.reservationId ?? null}, ${link.revisionNo ?? 0}, ${q.basePaise}, ${q.discountPaise}, ${q.taxPaise}, ${q.extraPaise}, ${q.totalPaise},
      ${q.offer?.offerVersionId ?? null}, ${q.offer?.explanation ?? null}, ${q.policyVersion}, ${q.offeringVersionId}, ${JSON.stringify(q.lineItems)}::jsonb)
    RETURNING id`);
  return res.rows[0].id;
}

function quoteFor(ctx: OfferingContext, offer: OfferTerms | null): Quote {
  return priceLines(
    { offeringVersionId: ctx.terms.offeringVersionId, offeringName: ctx.offeringName, basePaise: ctx.basePricePaise, taxPaise: ctx.taxPaise, extraPaise: ctx.extraChargesPaise, policyVersion: ctx.policyVersion },
    offer,
  );
}

async function reserveRedemption(tx: Db, q: Quote, patientId: string, reservationId: string) {
  if (!q.offer) return;
  const r = await tx.execute<{ id: string }>(sql`
    INSERT INTO offer_redemptions (offer_version_id, offer_id, patient_id, reservation_id, state, amount_paise)
    VALUES (${q.offer.offerVersionId}, ${q.offer.offerId}, ${patientId}, ${reservationId}, 'reserved', ${q.discountPaise}) RETURNING id`);
  await tx.execute(sql`INSERT INTO offer_counter_events (offer_version_id, redemption_id, delta, reason) VALUES (${q.offer.offerVersionId}, ${r.rows[0].id}, 1, 'reserved_on_hold')`);
}

async function newReference(tx: Db): Promise<string> {
  for (let i = 0; i < 6; i++) {
    const res = await tx.execute<{ r: string }>(sql`SELECT r FROM (SELECT generate_booking_reference() AS r) x WHERE NOT EXISTS (SELECT 1 FROM bookings WHERE reference = x.r)`);
    if (res.rows[0]) return res.rows[0].r;
  }
  throw new Error("could not allocate a booking reference");
}

// ---------------------------------------------------------------------------
// 1. Hold (BKG-07 steps 1–3)
// ---------------------------------------------------------------------------

export type HoldInput = { offeringId: string; startsAt: string; patientId: string; offerCode?: string | null; idempotencyKey: string };
export type HoldResult = {
  reservationId: string;
  holdToken: string;
  expiresAt: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
  offeringId: string;
  quote: Quote;
};

export async function createHold(actor: Actor, input: HoldInput): Promise<HoldResult> {
  const startsAt = parseInstant(input.startsAt);
  const body = { offeringId: input.offeringId, startsAt: new Date(startsAt).toISOString(), patientId: input.patientId, offerCode: input.offerCode ?? null };
  return idempotent(actor, "POST /holds", input.idempotencyKey, body, async (tx) => {
    await assertPatientAuthority(tx, actor.userId, input.patientId);
    const resourceId = await resourceForOffering(tx, input.offeringId);
    const { scheduleVersion, nowMs } = await lockCalendar(tx, resourceId);
    await lockPatient(tx, input.patientId);
    const ctx = await bookableContext(tx, input.offeringId);

    const cfg = await getConfigMap(["booking.hold_ttl_seconds", "booking.max_open_holds_per_account"]);
    const ttl = Number(cfg["booking.hold_ttl_seconds"] ?? 300);
    const maxHolds = Number(cfg["booking.max_open_holds_per_account"] ?? 3);
    const open = await tx.execute<{ n: string | number }>(sql`SELECT count(*) AS n FROM reservations WHERE held_by_user_id = ${actor.userId} AND state = 'held' AND expires_at > now()`);
    if (Number(open.rows[0].n) >= maxHolds) throw new ApiError("RATE_LIMITED", "You already have several times on hold. Complete or let one expire first.");

    const slot = await validateStart(tx, ctx, startsAt, nowMs);
    const offers = await loadOffers(tx, { practitionerId: ctx.practitionerId, clinicId: ctx.clinicId, offeringId: ctx.offeringId, patientId: input.patientId, code: input.offerCode, lock: true });
    const quote = quoteFor(ctx, selectOffer(ctx.basePricePaise, offers, input.offerCode));

    const token = randomBytes(32).toString("base64url");
    const occ = slot.occupied;
    const res = await tx.execute<{ id: string; expires_at: string }>(sql`
      INSERT INTO reservations (resource_id, practitioner_id, patient_id, offering_id, offering_version_id, branch_id, starts_at, ends_at, occupied_range,
        state, held_by_user_id, hold_token_hash, expires_at, schedule_version)
      VALUES (${resourceId}, ${ctx.practitionerId}, ${input.patientId}, ${ctx.offeringId}, ${ctx.terms.offeringVersionId}, ${ctx.branchId},
        ${new Date(slot.startsAt).toISOString()}::timestamptz, ${new Date(slot.endsAt).toISOString()}::timestamptz,
        tstzrange(${new Date(occ.start).toISOString()}::timestamptz, ${new Date(occ.end).toISOString()}::timestamptz, '[)'),
        'held', ${actor.userId}, ${hashToken(token)}, now() + make_interval(secs => ${ttl}), ${scheduleVersion})
      RETURNING id, expires_at::text AS expires_at`);
    const reservationId = res.rows[0].id;
    await insertSnapshot(tx, quote, { reservationId });
    await reserveRedemption(tx, quote, input.patientId, reservationId);
    return {
      reservationId,
      holdToken: token,
      expiresAt: new Date(res.rows[0].expires_at).toISOString(),
      startsAt: new Date(slot.startsAt).toISOString(),
      endsAt: new Date(slot.endsAt).toISOString(),
      timezone: BOOKING_TZ,
      offeringId: ctx.offeringId,
      quote,
    };
  });
}

// ---------------------------------------------------------------------------
// 2. Confirm (BKG-02, BKG-07 step 4)
// ---------------------------------------------------------------------------

export type ConfirmInput = { holdToken: string; expectedTotalPaise: number; expectedPolicyVersion: string; appointmentReason?: string | null; idempotencyKey: string };
export type ConfirmResult = { bookingId: string; reference: string; status: "confirmed"; startsAt: string; endsAt: string; timezone: string; totalPaise: number };

export async function confirmBooking(actor: Actor, input: ConfirmInput): Promise<ConfirmResult> {
  const reason = input.appointmentReason?.trim() ? input.appointmentReason.trim().slice(0, 500) : null; // private, ≤ 500 chars (BKG-14)
  const body = { hold: hashToken(input.holdToken), expectedTotalPaise: input.expectedTotalPaise, expectedPolicyVersion: input.expectedPolicyVersion, reason };
  return idempotent(actor, "POST /bookings", input.idempotencyKey, body, async (tx) => {
    const found = await tx.execute<{ id: string; resource_id: string; patient_id: string }>(sql`
      SELECT id, resource_id, patient_id FROM reservations WHERE hold_token_hash = ${hashToken(input.holdToken)}`);
    const pre = found.rows[0];
    if (!pre) throw new ApiError("HOLD_EXPIRED", "This time is no longer held. Please choose a slot again.");
    await lockCalendar(tx, pre.resource_id);
    await lockPatient(tx, pre.patient_id);

    const r = (await tx.execute<{ id: string; state: string; held_by_user_id: string | null; offering_id: string; offering_version_id: string; patient_id: string;
      practitioner_id: string; branch_id: string; starts_at: string; ends_at: string }>(sql`
      SELECT id, state::text AS state, held_by_user_id, offering_id, offering_version_id, patient_id, practitioner_id, branch_id,
             starts_at::text AS starts_at, ends_at::text AS ends_at
      FROM reservations WHERE id = ${pre.id} FOR UPDATE`)).rows[0];
    if (r.held_by_user_id !== actor.userId) throw new ApiError("UNAUTHORISED", "This hold belongs to another session");
    if (r.state !== "held") throw new ApiError("HOLD_EXPIRED", "Your hold expired. Please choose a slot again.");
    await assertPatientAuthority(tx, actor.userId, r.patient_id);

    const ctx = await bookableContext(tx, r.offering_id);
    if (ctx.terms.offeringVersionId !== r.offering_version_id) throw new ApiError("PRICE_CHANGED", "The service terms changed while you were booking. Please review the new price.");
    const snap = (await tx.execute<{ id: string; total_paise: string | number; policy_version: string; offer_version_id: string | null }>(sql`
      SELECT id, total_paise, policy_version, offer_version_id FROM booking_price_snapshots WHERE reservation_id = ${r.id} AND booking_id IS NULL ORDER BY created_at DESC LIMIT 1`)).rows[0];
    if (!snap) throw new ApiError("HOLD_EXPIRED", "This hold has no quote. Please choose a slot again.");
    if (Number(snap.total_paise) !== input.expectedTotalPaise) throw new ApiError("PRICE_CHANGED", "The price changed. Please review it before confirming.", { totalPaise: Number(snap.total_paise) });
    if (snap.policy_version !== input.expectedPolicyVersion || snap.policy_version !== ctx.policyVersion) {
      throw new ApiError("PRICE_CHANGED", "The cancellation policy changed. Please review it before confirming.", { policyVersion: ctx.policyVersion });
    }
    if (snap.offer_version_id) {
      const live = await tx.execute<{ ok: boolean }>(sql`
        SELECT (o.state IN ('approved', 'active') AND v.moderation_state = 'approved' AND v.starts_at <= now() AND v.ends_at > now()) AS ok
        FROM offer_versions v JOIN offers o ON o.id = v.offer_id WHERE v.id = ${snap.offer_version_id} FOR UPDATE OF v`);
      if (!live.rows[0]?.ok) throw new ApiError("PRICE_CHANGED", "The offer is no longer available. Please review the price.");
    }

    await tx.execute(sql`UPDATE reservations SET state = 'committed', hold_token_hash = NULL, expires_at = NULL WHERE id = ${r.id}`);
    const reference = await newReference(tx);
    const b = await tx.execute<{ id: string }>(sql`
      INSERT INTO bookings (reference, reservation_id, patient_id, booked_by_user_id, practitioner_id, branch_id, offering_id, offering_version_id,
        status, source, starts_at, ends_at, timezone, appointment_reason, price_snapshot_id, policy_version, confirmed_at)
      VALUES (${reference}, ${r.id}, ${r.patient_id}, ${actor.userId}, ${r.practitioner_id}, ${r.branch_id}, ${r.offering_id}, ${r.offering_version_id},
        'confirmed', 'platform', ${r.starts_at}::timestamptz, ${r.ends_at}::timestamptz, ${BOOKING_TZ}, ${reason}, ${snap.id}, ${snap.policy_version}, now())
      RETURNING id`);
    const bookingId = b.rows[0].id;
    await tx.execute(sql`UPDATE booking_price_snapshots SET booking_id = ${bookingId} WHERE id = ${snap.id}`);
    const red = await tx.execute<{ id: string; offer_version_id: string }>(sql`
      UPDATE offer_redemptions SET state = 'consumed', booking_id = ${bookingId} WHERE reservation_id = ${r.id} AND state = 'reserved' RETURNING id, offer_version_id`);
    for (const x of red.rows) {
      await tx.execute(sql`INSERT INTO offer_counter_events (offer_version_id, redemption_id, delta, reason) VALUES (${x.offer_version_id}, ${x.id}, 0, 'consumed_on_confirmation')`);
    }
    await bookingEvent(tx, { bookingId, type: "booking.confirmed", actor, to: "confirmed" });
    await insertOutbox(tx, { aggregateType: "booking", aggregateId: bookingId, version: 1, type: "booking.confirmed", payload: { bookingId, reference, source: "platform" } });
    await audit({ actorUserId: actor.userId, actorRole: actor.role ?? "patient", action: "booking.confirm", objectType: "booking", objectId: bookingId }, tx);
    return {
      bookingId,
      reference,
      status: "confirmed" as const,
      startsAt: new Date(r.starts_at).toISOString(),
      endsAt: new Date(r.ends_at).toISOString(),
      timezone: BOOKING_TZ,
      totalPaise: Number(snap.total_paise),
    };
  });
}

/** Patient abandons a hold before confirming; frees capacity and any reserved offer (OFR-05). */
export async function releaseHold(actor: Actor, holdToken: string): Promise<void> {
  await inTransaction(async (tx) => {
    const pre = (await tx.execute<{ id: string; resource_id: string; patient_id: string }>(sql`
      SELECT id, resource_id, patient_id FROM reservations WHERE hold_token_hash = ${hashToken(holdToken)} AND held_by_user_id = ${actor.userId}`)).rows[0];
    if (!pre) return;
    await lockCalendar(tx, pre.resource_id);
    await lockPatient(tx, pre.patient_id);
    const upd = await tx.execute<{ id: string }>(sql`
      UPDATE reservations SET state = 'released', released_reason = 'released_by_patient', hold_token_hash = NULL WHERE id = ${pre.id} AND state = 'held' RETURNING id`);
    if (upd.rows[0]) await releaseRedemptions(tx, pre.id, "released");
  });
}

async function releaseRedemptions(tx: Db, reservationId: string, to: "released" | "restored") {
  const from = to === "released" ? sql`('reserved')` : sql`('consumed', 'reserved')`;
  const rows = await tx.execute<{ id: string; offer_version_id: string }>(sql`
    UPDATE offer_redemptions SET state = ${to}::redemption_state WHERE reservation_id = ${reservationId} AND state IN ${from} RETURNING id, offer_version_id`);
  for (const x of rows.rows) {
    await tx.execute(sql`INSERT INTO offer_counter_events (offer_version_id, redemption_id, delta, reason) VALUES (${x.offer_version_id}, ${x.id}, -1, ${to === "released" ? "hold_released" : "booking_cancelled"})`);
  }
}

/** Expiry worker (BKG-09): releases elapsed holds everywhere and frees their offer reservations. */
export async function expireElapsedHolds(): Promise<number> {
  return inTransaction(async (tx) => {
    const rows = await tx.execute<{ id: string }>(sql`
      UPDATE reservations SET state = 'expired', released_reason = 'hold_expired', hold_token_hash = NULL
      WHERE state = 'held' AND expires_at <= now() RETURNING id`);
    // Holds expired inside booking transactions keep their token hash; release offer reservations for all expired holds.
    await tx.execute(sql`UPDATE reservations SET hold_token_hash = NULL WHERE state = 'expired' AND hold_token_hash IS NOT NULL`);
    const red = await tx.execute<{ id: string; offer_version_id: string }>(sql`
      UPDATE offer_redemptions rd SET state = 'released' FROM reservations r
      WHERE rd.reservation_id = r.id AND rd.state = 'reserved' AND r.state IN ('expired', 'released') RETURNING rd.id, rd.offer_version_id`);
    for (const x of red.rows) {
      await tx.execute(sql`INSERT INTO offer_counter_events (offer_version_id, redemption_id, delta, reason) VALUES (${x.offer_version_id}, ${x.id}, -1, 'hold_expired')`);
    }
    await tx.execute(sql`DELETE FROM idempotency_records WHERE expires_at < now() - interval '1 day'`);
    return rows.rows.length;
  });
}

// ---------------------------------------------------------------------------
// 3. Cancellation (BKG-15) and provider cancellation
// ---------------------------------------------------------------------------

type BookingRow = {
  id: string; reference: string; status: string; version: number; patient_id: string; practitioner_id: string; reservation_id: string; resource_id: string;
  offering_id: string; branch_id: string; starts_at: string; ends_at: string; policy_version: string; price_snapshot_id: string | null; cutoff_hours: number | null;
};

async function lockBooking(tx: Db, bookingId: string): Promise<BookingRow> {
  const pre = (await tx.execute<{ resource_id: string; patient_id: string }>(sql`
    SELECT r.resource_id, b.patient_id FROM bookings b JOIN reservations r ON r.id = b.reservation_id WHERE b.id = ${bookingId}`)).rows[0];
  if (!pre) throw new ApiError("NOT_FOUND", "Appointment not found");
  await lockCalendar(tx, pre.resource_id);
  await lockPatient(tx, pre.patient_id);
  const res = await tx.execute<BookingRow>(sql`
    SELECT b.id, b.reference, b.status::text AS status, b.version, b.patient_id, b.practitioner_id, b.reservation_id, r.resource_id, b.offering_id, b.branch_id,
           b.starts_at::text AS starts_at, b.ends_at::text AS ends_at, b.policy_version, b.price_snapshot_id,
           coalesce((SELECT (content ->> 'selfServiceCutoffHours')::int FROM policies WHERE type = 'cancellation' AND version = b.policy_version LIMIT 1),
                    (SELECT (value #>> '{}')::int FROM platform_config WHERE key = 'booking.self_service_cutoff_hours')) AS cutoff_hours
    FROM bookings b JOIN reservations r ON r.id = b.reservation_id WHERE b.id = ${bookingId} FOR UPDATE OF b`);
  return res.rows[0];
}

function assertVersion(b: BookingRow, expected: number) {
  if (Number(b.version) !== expected) throw new ApiError("VERSION_CONFLICT", "This appointment changed since you opened it. Refresh and try again.");
}

async function dbNow(tx: Db): Promise<number> {
  const r = await tx.execute<{ ms: string | number }>(sql`SELECT (extract(epoch FROM now()) * 1000)::bigint AS ms`);
  return Number(r.rows[0].ms);
}

export type CancelResult = { bookingId: string; reference: string; status: string; requested?: boolean; version: number };

/** Patient cancellation: direct before the cutoff, otherwise a request to the clinic (BKG-15). */
export async function cancelByPatient(actor: Actor, input: { bookingId: string; expectedVersion: number; reason?: string | null; idempotencyKey: string }): Promise<CancelResult> {
  const reason = input.reason?.trim().slice(0, 500) || null;
  return idempotent(actor, `POST /bookings/${input.bookingId}/cancel`, input.idempotencyKey, { ...input, idempotencyKey: undefined, reason }, async (tx) => {
    const b = await lockBooking(tx, input.bookingId);
    await assertPatientAuthority(tx, actor.userId, b.patient_id);
    if (b.status !== "confirmed") throw new ApiError("CONFLICT", "Only confirmed appointments can be cancelled.");
    assertVersion(b, input.expectedVersion);
    const now = await dbNow(tx);
    const startsAt = Date.parse(b.starts_at);
    if (startsAt <= now) throw new ApiError("POLICY_CUTOFF_PASSED", "This appointment has already started.");
    if (startsAt - now < Number(b.cutoff_hours ?? 12) * 60 * MIN) {
      const existing = await tx.execute(sql`SELECT 1 FROM resolution_tasks WHERE booking_id = ${b.id} AND kind = 'cancellation_request_after_cutoff' AND state IN ('open', 'in_progress')`);
      if (!existing.rows.length) {
        await tx.execute(sql`
          INSERT INTO resolution_tasks (kind, booking_id, practitioner_id, branch_id, due_at, details)
          VALUES ('cancellation_request_after_cutoff', ${b.id}, ${b.practitioner_id}, ${b.branch_id}, ${b.starts_at}::timestamptz, ${JSON.stringify({ reason, requestedBy: actor.userId })}::jsonb)`);
        await bookingEvent(tx, { bookingId: b.id, type: "booking.cancellation_requested", actor, from: b.status, to: b.status, reason });
        await insertOutbox(tx, { aggregateType: "booking", aggregateId: b.id, version: Number(b.version), type: "booking.cancellation_requested", payload: { bookingId: b.id, reference: b.reference } });
      }
      return { bookingId: b.id, reference: b.reference, status: b.status, requested: true, version: Number(b.version) };
    }
    return applyCancellation(tx, b, actor, "patient_cancelled", reason);
  });
}

/** Provider or admin cancellation: always possible with a reason; the patient is notified (Section 11 table). */
export async function cancelByProvider(actor: Actor, input: { bookingId: string; practitionerId: string; expectedVersion: number; reason: string; idempotencyKey: string }): Promise<CancelResult> {
  const reason = input.reason.trim().slice(0, 500);
  if (reason.length < 3) throw new ApiError("INVALID_INPUT", "Give a reason for the cancellation");
  return idempotent(actor, `POST /bookings/${input.bookingId}/provider-cancel`, input.idempotencyKey, { ...input, idempotencyKey: undefined, reason }, async (tx) => {
    const b = await lockBooking(tx, input.bookingId);
    if (b.practitioner_id !== input.practitionerId) throw new ApiError("NOT_FOUND", "Appointment not found");
    if (b.status !== "confirmed") throw new ApiError("CONFLICT", "Only confirmed appointments can be cancelled.");
    assertVersion(b, input.expectedVersion);
    await tx.execute(sql`UPDATE resolution_tasks SET state = 'resolved', resolution = 'cancelled_by_provider', resolved_at = now(), resolved_by_user_id = ${actor.userId}
      WHERE booking_id = ${b.id} AND kind = 'cancellation_request_after_cutoff' AND state IN ('open', 'in_progress')`);
    return applyCancellation(tx, b, actor, "provider_cancelled", reason);
  });
}

async function applyCancellation(tx: Db, b: BookingRow, actor: Actor, to: "patient_cancelled" | "provider_cancelled", reason: string | null): Promise<CancelResult> {
  const nextVersion = Number(b.version) + 1;
  await tx.execute(sql`
    UPDATE bookings SET status = ${to}::booking_status, cancelled_at = now(), cancelled_by_user_id = ${actor.userId}, cancellation_reason = ${reason}, version = ${nextVersion}
    WHERE id = ${b.id} AND version = ${b.version}`);
  await tx.execute(sql`UPDATE reservations SET state = 'released', released_reason = ${to} WHERE id = ${b.reservation_id} AND state = 'committed'`);
  await releaseRedemptions(tx, b.reservation_id, "restored"); // entitlement restored for cancellations (OFR-05)
  await bookingEvent(tx, { bookingId: b.id, type: "booking.cancelled", actor, from: b.status, to, reason });
  await insertOutbox(tx, { aggregateType: "booking", aggregateId: b.id, version: nextVersion, type: "booking.cancelled", payload: { bookingId: b.id, reference: b.reference, by: to === "patient_cancelled" ? "patient" : "provider" } });
  await audit({ actorUserId: actor.userId, actorRole: actor.role ?? null, action: `booking.${to}`, objectType: "booking", objectId: b.id, reason }, tx);
  return { bookingId: b.id, reference: b.reference, status: to, version: nextVersion };
}

// ---------------------------------------------------------------------------
// 4. Reschedule (BKG-03, BKG-11)
// ---------------------------------------------------------------------------

export type RescheduleResult = { bookingId: string; reference: string; startsAt: string; endsAt: string; totalPaise: number; version: number };

export async function rescheduleByPatient(
  actor: Actor,
  input: { bookingId: string; expectedVersion: number; newStartsAt: string; acceptedTotalPaise?: number | null; idempotencyKey: string },
): Promise<RescheduleResult> {
  const newStart = parseInstant(input.newStartsAt);
  const body = { bookingId: input.bookingId, expectedVersion: input.expectedVersion, newStartsAt: new Date(newStart).toISOString(), acceptedTotalPaise: input.acceptedTotalPaise ?? null };
  return idempotent(actor, `POST /bookings/${input.bookingId}/reschedule`, input.idempotencyKey, body, async (tx) => {
    const b = await lockBooking(tx, input.bookingId);
    await assertPatientAuthority(tx, actor.userId, b.patient_id);
    if (b.status !== "confirmed") throw new ApiError("CONFLICT", "Only confirmed appointments can be rescheduled.");
    assertVersion(b, input.expectedVersion);
    const now = await dbNow(tx);
    if (Date.parse(b.starts_at) - now < Number(b.cutoff_hours ?? 12) * 60 * MIN) {
      throw new ApiError("POLICY_CUTOFF_PASSED", "It is too close to the appointment to reschedule online. Contact the clinic.");
    }
    const ctx = await bookableContext(tx, b.offering_id);

    // Release the old interval and insert the replacement in the same transaction; any failure rolls back both (BKG-11).
    await tx.execute(sql`UPDATE reservations SET state = 'released', released_reason = 'rescheduled' WHERE id = ${b.reservation_id}`);
    const slot = await validateStart(tx, ctx, newStart, now);

    const old = (await tx.execute<{ id: string; revision_no: number; total_paise: string | number; offer_version_id: string | null; line_items: LineItem[]; base_paise: string | number;
      discount_paise: string | number; tax_paise: string | number; extra_paise: string | number; policy_version: string; offering_version_id: string | null }>(sql`
      SELECT id, revision_no, total_paise, offer_version_id, line_items, base_paise, discount_paise, tax_paise, extra_paise, policy_version, offering_version_id
      FROM booking_price_snapshots WHERE id = ${b.price_snapshot_id}`)).rows[0];
    // The consumed entitlement stays with the booking: reapply the same offer terms without re-checking caps.
    let offer: OfferTerms | null = null;
    if (old?.offer_version_id) {
      const ov = (await tx.execute<{ offer_id: string; title: string; type: "fixed" | "percentage"; value: number; max_discount_paise: string | number | null; min_spend_paise: string | number; first_visit_only: boolean; ends_at: string }>(sql`
        SELECT v.offer_id, o.title, v.type::text AS type, v.value, v.max_discount_paise, v.min_spend_paise, v.first_visit_only, v.ends_at::text AS ends_at
        FROM offer_versions v JOIN offers o ON o.id = v.offer_id WHERE v.id = ${old.offer_version_id}`)).rows[0];
      if (ov) {
        offer = {
          offerId: ov.offer_id, offerVersionId: old.offer_version_id, title: ov.title, type: ov.type, value: Number(ov.value),
          maxDiscountPaise: ov.max_discount_paise === null ? null : Number(ov.max_discount_paise), minSpendPaise: Number(ov.min_spend_paise),
          totalCap: null, perPatientCap: 1, firstVisitOnly: ov.first_visit_only, automatic: true, code: null, endsAt: ov.ends_at,
        };
      }
    }
    const quote = quoteFor(ctx, offer);
    if (old && quote.totalPaise !== Number(old.total_paise) && input.acceptedTotalPaise !== quote.totalPaise) {
      throw new ApiError("PRICE_CHANGED", "The fee for the new time differs. Review and accept the new price to continue.", { totalPaise: quote.totalPaise, previousTotalPaise: Number(old.total_paise) });
    }

    const occ = occupiedInterval(slot.startsAt, ctx.terms);
    const res = await tx.execute<{ id: string }>(sql`
      INSERT INTO reservations (resource_id, practitioner_id, patient_id, offering_id, offering_version_id, branch_id, starts_at, ends_at, occupied_range,
        state, held_by_user_id, schedule_version)
      VALUES (${b.resource_id}, ${b.practitioner_id}, ${b.patient_id}, ${ctx.offeringId}, ${ctx.terms.offeringVersionId}, ${ctx.branchId},
        ${new Date(slot.startsAt).toISOString()}::timestamptz, ${new Date(slot.endsAt).toISOString()}::timestamptz,
        tstzrange(${new Date(occ.start).toISOString()}::timestamptz, ${new Date(occ.end).toISOString()}::timestamptz, '[)'),
        'committed', ${actor.userId}, ${ctx.scheduleVersion})
      RETURNING id`);
    const newReservationId = res.rows[0].id;
    const revisionNo = Number(old?.revision_no ?? 0) + 1;
    const snapshotId = await insertSnapshot(tx, quote, { bookingId: b.id, reservationId: newReservationId, revisionNo });
    const nextVersion = Number(b.version) + 1;
    await tx.execute(sql`
      UPDATE bookings SET reservation_id = ${newReservationId}, offering_version_id = ${ctx.terms.offeringVersionId}, branch_id = ${ctx.branchId},
        starts_at = ${new Date(slot.startsAt).toISOString()}::timestamptz, ends_at = ${new Date(slot.endsAt).toISOString()}::timestamptz,
        price_snapshot_id = ${snapshotId}, policy_version = ${quote.policyVersion}, version = ${nextVersion}
      WHERE id = ${b.id} AND version = ${b.version}`);
    await tx.execute(sql`
      INSERT INTO booking_revisions (booking_id, revision_no, actor_user_id, previous_snapshot, new_snapshot, reason)
      VALUES (${b.id}, ${revisionNo}, ${actor.userId},
        ${JSON.stringify({ startsAt: b.starts_at, endsAt: b.ends_at, branchId: b.branch_id, offeringId: b.offering_id, offeringVersionId: old?.offering_version_id ?? null, totalPaise: Number(old?.total_paise ?? 0), policyVersion: b.policy_version, reservationId: b.reservation_id })}::jsonb,
        ${JSON.stringify({ startsAt: new Date(slot.startsAt).toISOString(), endsAt: new Date(slot.endsAt).toISOString(), branchId: ctx.branchId, offeringId: ctx.offeringId, offeringVersionId: ctx.terms.offeringVersionId, totalPaise: quote.totalPaise, policyVersion: quote.policyVersion, reservationId: newReservationId })}::jsonb,
        'patient_reschedule')`);
    await bookingEvent(tx, { bookingId: b.id, type: "booking.rescheduled", actor, from: "confirmed", to: "confirmed", payload: { revisionNo } });
    await insertOutbox(tx, { aggregateType: "booking", aggregateId: b.id, version: nextVersion, type: "booking.rescheduled", payload: { bookingId: b.id, reference: b.reference, revisionNo } });
    await audit({ actorUserId: actor.userId, actorRole: actor.role ?? "patient", action: "booking.reschedule", objectType: "booking", objectId: b.id, changedFields: { revisionNo } }, tx);
    return { bookingId: b.id, reference: b.reference, startsAt: new Date(slot.startsAt).toISOString(), endsAt: new Date(slot.endsAt).toISOString(), totalPaise: quote.totalPaise, version: nextVersion };
  });
}

// ---------------------------------------------------------------------------
// 5. Outcomes recorded by the provider (Section 11 table, BKG-04, BKG-05, PAY-01)
// ---------------------------------------------------------------------------

export async function recordOutcome(
  actor: Actor,
  input: { bookingId: string; practitionerId: string; expectedVersion: number; outcome: "completed" | "no_show"; idempotencyKey: string },
): Promise<CancelResult> {
  return idempotent(actor, `POST /bookings/${input.bookingId}/outcome`, input.idempotencyKey, { ...input, idempotencyKey: undefined }, async (tx) => {
    const b = await lockBooking(tx, input.bookingId);
    if (b.practitioner_id !== input.practitionerId) throw new ApiError("NOT_FOUND", "Appointment not found");
    if (b.status !== "confirmed") throw new ApiError("CONFLICT", "Only confirmed appointments can be marked completed or no-show.");
    assertVersion(b, input.expectedVersion);
    const now = await dbNow(tx);
    if (input.outcome === "completed" && now < Date.parse(b.ends_at)) throw new ApiError("CONFLICT", "An appointment can be marked completed only after it ends.");
    if (input.outcome === "no_show") {
      const grace = Number((await getConfigMap(["booking.no_show_grace_minutes"]))["booking.no_show_grace_minutes"] ?? 15);
      if (now < Date.parse(b.starts_at) + grace * MIN) throw new ApiError("CONFLICT", `A no-show can be recorded ${grace} minutes after the start time.`);
    }
    const nextVersion = Number(b.version) + 1;
    await tx.execute(sql`
      UPDATE bookings SET status = ${input.outcome}::booking_status, version = ${nextVersion},
        completed_at = ${input.outcome === "completed" ? sql`now()` : sql`completed_at`},
        no_show_recorded_at = ${input.outcome === "no_show" ? sql`now()` : sql`no_show_recorded_at`}
      WHERE id = ${b.id} AND version = ${b.version}`);
    await bookingEvent(tx, { bookingId: b.id, type: `booking.${input.outcome}`, actor, from: "confirmed", to: input.outcome });
    await insertOutbox(tx, { aggregateType: "booking", aggregateId: b.id, version: nextVersion, type: `booking.${input.outcome}`, payload: { bookingId: b.id, reference: b.reference } });
    await audit({ actorUserId: actor.userId, actorRole: actor.role ?? null, action: `booking.${input.outcome}`, objectType: "booking", objectId: b.id }, tx);
    return { bookingId: b.id, reference: b.reference, status: input.outcome, version: nextVersion };
  });
}

/** Self-reported payment (PAY-01). Not platform-collected revenue; financial status is separate from the booking state (BKG-05). */
export async function reportPaymentReceived(actor: Actor, input: { bookingId: string; practitionerId: string }): Promise<void> {
  await inTransaction(async (tx) => {
    const res = await tx.execute<{ id: string }>(sql`
      UPDATE bookings SET payment_reported = 'reported_received', payment_reported_at = now()
      WHERE id = ${input.bookingId} AND practitioner_id = ${input.practitionerId} AND status IN ('confirmed', 'completed') AND payment_reported = 'not_reported'
      RETURNING id`);
    if (!res.rows[0]) throw new ApiError("CONFLICT", "Payment cannot be recorded for this appointment.");
    await bookingEvent(tx, { bookingId: input.bookingId, type: "booking.payment_reported", actor });
    await audit({ actorUserId: actor.userId, actorRole: actor.role ?? null, action: "booking.payment_reported", objectType: "booking", objectId: input.bookingId }, tx);
  });
}

// ---------------------------------------------------------------------------
// 6. Manual entry: walk-in or phone booking by the practice (PRO-13, BKG-07)
// ---------------------------------------------------------------------------

export async function createManualBooking(
  actor: Actor,
  input: { practitionerId: string; offeringId: string; startsAt: string; patientName: string; patientMobile?: string | null; source: "walk_in" | "phone"; idempotencyKey: string },
): Promise<ConfirmResult> {
  const startsAt = parseInstant(input.startsAt);
  const body = { ...input, idempotencyKey: undefined, startsAt: new Date(startsAt).toISOString() };
  return idempotent(actor, "POST /workspace/bookings", input.idempotencyKey, body, async (tx) => {
    const resourceId = await resourceForOffering(tx, input.offeringId);
    await lockCalendar(tx, resourceId);
    const ctx = await loadOfferingContext(tx, input.offeringId);
    if (!ctx || ctx.practitionerId !== input.practitionerId) throw new ApiError("NOT_FOUND", "Service not found");
    if (!ctx.offeringActive || ctx.associationState !== "approved" || ctx.associationEnded) throw new ApiError("CONFLICT", "This service is not active at that location.");
    const name = input.patientName.trim().slice(0, 80);
    if (name.length < 2) throw new ApiError("INVALID_INPUT", "Enter the patient's name");
    // Walk-ins avoid obvious duplicates: reuse a practice-created record with the same mobile.
    let patientId: string | null = null;
    if (input.patientMobile) {
      const dup = await tx.execute<{ id: string }>(sql`SELECT id FROM patients WHERE mobile = ${input.patientMobile} AND status = 'active' ORDER BY account_user_id IS NOT NULL DESC, created_at LIMIT 1`);
      patientId = dup.rows[0]?.id ?? null;
    }
    if (!patientId) {
      const p = await tx.execute<{ id: string }>(sql`
        INSERT INTO patients (display_name, mobile, age_band, created_by_user_id) VALUES (${name}, ${input.patientMobile ?? null}, NULL, ${actor.userId}) RETURNING id`);
      patientId = p.rows[0].id;
    }
    await lockPatient(tx, patientId);
    // Same conflict rules as online booking: the exclusion constraints decide (manual entry skips notice and published hours).
    const occ = occupiedInterval(startsAt, ctx.terms);
    const endsAt = startsAt + ctx.terms.durationMin * MIN;
    const res = await tx.execute<{ id: string }>(sql`
      INSERT INTO reservations (resource_id, practitioner_id, patient_id, offering_id, offering_version_id, branch_id, starts_at, ends_at, occupied_range,
        state, held_by_user_id, schedule_version)
      VALUES (${resourceId}, ${ctx.practitionerId}, ${patientId}, ${ctx.offeringId}, ${ctx.terms.offeringVersionId}, ${ctx.branchId},
        ${new Date(startsAt).toISOString()}::timestamptz, ${new Date(endsAt).toISOString()}::timestamptz,
        tstzrange(${new Date(occ.start).toISOString()}::timestamptz, ${new Date(occ.end).toISOString()}::timestamptz, '[)'),
        'committed', ${actor.userId}, ${ctx.scheduleVersion})
      RETURNING id`);
    const quote = quoteFor(ctx, null);
    const reference = await newReference(tx);
    const b = await tx.execute<{ id: string }>(sql`
      INSERT INTO bookings (reference, reservation_id, patient_id, booked_by_user_id, practitioner_id, branch_id, offering_id, offering_version_id,
        status, source, starts_at, ends_at, timezone, policy_version, notify_patient, confirmed_at)
      VALUES (${reference}, ${res.rows[0].id}, ${patientId}, ${actor.userId}, ${ctx.practitionerId}, ${ctx.branchId}, ${ctx.offeringId}, ${ctx.terms.offeringVersionId},
        'confirmed', ${input.source}::booking_source, ${new Date(startsAt).toISOString()}::timestamptz, ${new Date(endsAt).toISOString()}::timestamptz, ${BOOKING_TZ},
        ${quote.policyVersion}, ${Boolean(input.patientMobile) && input.source === "phone"}, now())
      RETURNING id`);
    const bookingId = b.rows[0].id;
    const snapshotId = await insertSnapshot(tx, quote, { bookingId, reservationId: res.rows[0].id });
    await tx.execute(sql`UPDATE bookings SET price_snapshot_id = ${snapshotId} WHERE id = ${bookingId}`);
    await bookingEvent(tx, { bookingId, type: "booking.confirmed", actor, to: "confirmed", payload: { source: input.source } });
    await insertOutbox(tx, { aggregateType: "booking", aggregateId: bookingId, version: 1, type: "booking.confirmed", payload: { bookingId, reference, source: input.source } });
    await audit({ actorUserId: actor.userId, actorRole: actor.role ?? "practitioner", action: "booking.manual_entry", objectType: "booking", objectId: bookingId, changedFields: { source: input.source } }, tx);
    return { bookingId, reference, status: "confirmed" as const, startsAt: new Date(startsAt).toISOString(), endsAt: new Date(endsAt).toISOString(), timezone: BOOKING_TZ, totalPaise: quote.totalPaise };
  });
}
