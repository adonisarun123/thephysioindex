# Messaging: not sending, sending twice, or failing (MSG-01, MSG-02)

How it works: booking and verification changes write an `outbox_events` row in the same transaction. The dispatcher turns each event into `notification_deliveries` (one per recipient, channel and template version, deduplicated by `dedupe_key`), then sends them. It runs right after the request and every 5 minutes via the scheduler. Temporary failures retry at 1, 5, 15, 60 and 180 minutes; permanent failures become **dead** and show in **Admin → Notifications**.

## Messages not arriving
1. Admin → Notifications → **dead** and **failed** tabs. Read *Last error*:
   - `no DLT template id set` → the SMS template has no registered DLT id. Add it on the template (Admin → Policies and templates), then **Retry now**.
   - `msg91 … 401/403` or `resend failed: 401` → the provider key is wrong or revoked. Fix the env var, redeploy, retry.
   - `template variable "x" has no value` → a template uses a placeholder the event cannot fill. Correct the template; retry.
   - `recipient has no verified contact…` (cancelled, not dead) → expected: the person has no verified mobile/email or opted out.
2. Nothing in those tabs but people still see nothing → is the scheduler running?
   ```sql
   SELECT state, count(*), min(scheduled_for) FROM notification_deliveries WHERE scheduled_for < now() - interval '10 minutes' AND state IN ('queued','failed') GROUP BY state;
   ```
   Rows here mean the tick is not being called: check cron-job.org history (expect HTTP 200 every 5 minutes; 403 = wrong `CRON_SECRET`).
3. Providers on `console` (`SMS_PROVIDER=console`, `EMAIL_PROVIDER=console`) only print to Vercel logs. That is the default until real keys are set.

## Same message twice
Deduplication is per event, recipient, channel and template version, so true duplicates should not be queued.
```sql
SELECT dedupe_key, count(*) FROM notification_deliveries GROUP BY 1 HAVING count(*) > 1;  -- must return nothing (unique index)
SELECT d.booking_id, d.channel, count(*) FROM notification_deliveries d JOIN notification_templates t ON t.id = d.template_id
WHERE t.event_type = 'booking.confirmed' AND d.state = 'sent' AND d.created_at > now() - interval '1 day' GROUP BY 1, 2 HAVING count(*) > 1;
```
Possible causes:
- **A template was edited into a new version** between two dispatch runs. Avoid editing live templates; add a version instead.
- **A send succeeded at the provider but the status update failed**, so the 5-minute lease expired and it was sent again. This is at-least-once delivery by design. Look for a `provider_ref` on both rows.
- **Two different events** (e.g. a reschedule then a cancel) correctly produce two messages.

## Reminders for an old time
Reminders are rechecked against the booking's current version and status just before sending and cancelled if stale (`last_error` starts with `stale`). If one went out wrong, check `bookings.version` was incremented by the change.

## Backlog after an outage
Events older than `notifications.max_event_age_hours` (platform config, default 24) are consumed **without** sending, to avoid late confirmations. After a longer outage, tell affected clinics instead.
