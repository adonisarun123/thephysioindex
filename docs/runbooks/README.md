# Runbooks

Operational procedures for The Physio Index (OPS-01, OPS-06, OPS-07, DAT-12). Each runbook is: **detect → contain → fix → verify → record**.

| Situation | Runbook |
|---|---|
| Site or API failing, database unreachable or slow | [database-outage.md](database-outage.md) |
| Data loss or corruption; restore drill | [restore-and-recovery.md](restore-and-recovery.md) |
| A secret, admin account or device may be compromised | [credential-compromise.md](credential-compromise.md) |
| SMS/email not arriving, arriving twice, or piling up dead | [messaging.md](messaging.md) |
| Bulk import produced bad or duplicate listings | [import-errors.md](import-errors.md) |
| Search or profiles show outdated data | [stale-search-data.md](stale-search-data.md) |
| A practitioner must be taken offline | [practitioner-suspension.md](practitioner-suspension.md) |
| A deploy failed or broke production; normal release steps | [deployments.md](deployments.md) |
| Payment status disagrees with the clinic | [payment-mismatch.md](payment-mismatch.md) |

## Where things are

- **App:** Vercel project `thephysioindex` (team `arun-mahendrans-projects`), functions in `sin1`. Production domain `www.thephysioindex.com`.
- **Database:** Neon project `mute-dream-63602116` (`aws-ap-southeast-1`, Postgres 18). Branch `production` = live; branch `dev` = previews. Runtime role `tpi_runtime` (no DDL); migrations run as `neondb_owner` at build.
- **Scheduler:** `GET /api/cron/notifications` with `Authorization: Bearer $CRON_SECRET`, every 5 minutes from cron-job.org; Vercel's daily cron is the backstop. Each run sends due notifications and expires holds.
- **Admin:** `/admin` (email code + authenticator). Notification failures: Admin → Notifications. Moderation and verification: Admin → Review queues. Open resolution tasks: Admin → Overview.
- **Logs:** Vercel → Logs (filter by `x-request-id` from the error page or API response). Neon → Monitoring for connections, CPU and storage.

## Health check (run on the production branch, read-only)

Use the Neon SQL editor or the Neon connector. Thresholds are the OPS-05 proposed alerts.

```sql
-- Oldest booking/verification event not yet turned into notifications (alert > 5 min)
SELECT now() - min(o.occurred_at) AS oldest_unprocessed
FROM outbox_events o
WHERE o.event_type IN ('booking.confirmed','booking.rescheduled','booking.cancelled','booking.cancellation_requested','booking.completed','verification.decided')
  AND NOT EXISTS (SELECT 1 FROM processed_events p WHERE p.consumer = 'notifications' AND p.event_id = o.event_id);

-- Notifications overdue or dead (alert on any dead, or due > 10 min ago)
SELECT state, count(*), min(scheduled_for) FROM notification_deliveries
WHERE state IN ('queued','failed','dead') GROUP BY state;

-- Hold expiry lag: holds past expiry still marked held (alert > 2 min)
SELECT count(*), now() - min(expires_at) AS worst_lag FROM reservations WHERE state = 'held' AND expires_at < now();

-- Review queue ageing (ADM-02 target: first response in 2 business days)
SELECT case_type, count(*), now() - min(submitted_at) AS oldest FROM verification_cases
WHERE state IN ('open','in_review','awaiting_evidence') GROUP BY case_type ORDER BY oldest DESC;

-- Open resolution tasks on future appointments
SELECT kind, count(*), min(due_at) FROM resolution_tasks WHERE state IN ('open','in_progress') GROUP BY kind;
```

## Known gaps (as of 14 Oct 2026)

- **Restore window is 24 hours** (`history_retention_seconds = 86400` on the Neon Launch plan). There is **no independent backup**; the SRS proposes a 30-day encrypted cycle (SEC-09). See restore-and-recovery.md.
- No automated alerting yet: the health check above is manual. OPS-05 alerts need a monitor (e.g. a scheduled job that runs these queries and messages on-call).
- No platform-wide switch to pause all bookings; the only global stop is taking the database credential away (see restore-and-recovery.md).
- No on-call rota or escalation route is defined (OPS-05). Until then: Arun is owner and escalation.

## After any incident

Write a short record in the build log or project docs: what happened, impact (bookings/patients affected, by count, no names), timeline, cause, fix, and the follow-up that prevents a repeat.
