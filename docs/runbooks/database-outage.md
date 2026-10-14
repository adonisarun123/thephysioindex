# Database outage or severe slowness

**Signals:** 5xx on search, profile or booking pages; `DEPENDENCY_UNAVAILABLE` from the API; Vercel logs with `connect ETIMEDOUT`, `too many connections`, `Connection terminated`, or statement timeouts.

## 1. Confirm scope (5 minutes)
1. Neon console → project `mute-dream-63602116` → **Monitoring**: is the `production` compute running? CPU near the 8 CU ceiling? Connections near the limit?
2. Neon status page: any regional incident for `aws-ap-southeast-1`?
3. Note the maintenance window: **Saturdays 21:00–22:00 UTC (Sunday 02:30–03:30 IST)**. Brief restarts there are expected.
4. Vercel → Logs for the last 15 minutes: one route, or everything?

## 2. Contain
- **Neon regional outage:** nothing to fix on our side. Put a notice on social/WhatsApp if bookings are affected for more than 15 minutes. Do not fail over to the `dev` branch: it holds test data.
- **Compute saturated:** raise the autoscaling max in Neon (Branch → Compute → Edit) temporarily, then find the query (step 3).
- **Connection exhaustion:** check `DB_POOL_MAX` (default 10 per instance) against Neon's pooled limit. Lower it in Vercel env vars and redeploy if instances × pool exceeds the limit.
- **Cold start latency:** the compute scales to zero when idle. If first requests after quiet periods time out, disable scale-to-zero on the `production` compute (DAT-13).

## 3. Find the cause
```sql
-- Long-running or stuck statements
SELECT pid, now() - query_start AS running, state, wait_event_type, left(query, 120)
FROM pg_stat_activity WHERE datname = current_database() AND state <> 'idle' ORDER BY running DESC LIMIT 20;

-- Lock waits (booking transactions should never wait more than ~3 s; BKG-12)
SELECT blocked.pid, blocking.pid AS blocking_pid, left(blocked.query, 80) AS blocked_query, left(blocking.query, 80) AS blocking_query
FROM pg_stat_activity blocked JOIN pg_stat_activity blocking ON blocking.pid = ANY(pg_blocking_pids(blocked.pid));
```
Cancel a runaway read with `SELECT pg_cancel_backend(<pid>);`. **Do not** terminate a session in the middle of a booking write unless it has been blocking for minutes; a cancelled booking transaction rolls back cleanly and the patient can retry with the same idempotency key.

## 4. Verify
- Public search, a profile page and the booking slot list load in under 2 seconds.
- Run the health check in README.md: holds are expiring and notifications are flowing again.
- Check for bookings that patients may have retried: `SELECT reference, created_at FROM bookings WHERE created_at > now() - interval '2 hours' ORDER BY created_at DESC;` Duplicate confirmed bookings for the same slot cannot exist (exclusion constraint); duplicate *patient* bookings at different times are possible and are handled by the clinic.

## 5. Record
Duration, routes affected, bookings failed (from Vercel logs, counted, no patient details), cause, and whether limits were changed.
