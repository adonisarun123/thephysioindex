# Credential compromise or security incident (OPS-06)

**Examples:** a leaked `DATABASE_URL`, `BETTER_AUTH_SECRET`, `CRON_SECRET`, Resend/MSG91 key; a staff account used by someone else; a lost laptop with sessions; suspicious admin actions in the audit log.

Security incidents need **containment, evidence preservation, impact assessment and notification**. Notification deadlines depend on the incident type and current law (for example CERT-In directions and the DPDP Act); **confirm with counsel at the time** rather than relying on a fixed number here.

## 1. Contain (first 30 minutes)
Rotate the affected secret, newest-first, and redeploy so the old value stops working:

| Secret | Where to rotate | Side effects |
|---|---|---|
| Neon role password (`tpi_runtime`, `neondb_owner`) | Neon → Roles → Reset password; update `DATABASE_URL` / `MIGRATION_DATABASE_URL` in Vercel (production and preview are different) | Redeploy required; brief errors until it finishes |
| `BETTER_AUTH_SECRET` | Generate 32+ random bytes; update in Vercel | **Signs everyone out**; that is usually what you want |
| `CRON_SECRET` | Vercel env var + cron-job.org header | Scheduler fails until both match |
| `RESEND_API_KEY`, `MSG91_AUTH_KEY` | Provider dashboard → revoke + new key; update Vercel | Messages fail until redeploy; they retry automatically |
| A staff account | Admin → Staff and roles: revoke roles; reset the user's authenticator | — |

If a database credential leaked, also check Neon → Settings → IP allow list and consider restricting it.

## 2. Preserve evidence
Do not delete anything. Export, before rotating where possible:
```sql
SELECT occurred_at, actor_user_id, actor_role, action, object_type, object_id, reason
FROM audit_events WHERE occurred_at > now() - interval '7 days' ORDER BY occurred_at;
SELECT occurred_at, actor_user_id, purpose, object_type, object_id FROM record_access_log WHERE occurred_at > now() - interval '7 days' ORDER BY occurred_at;
```
Save Vercel logs for the window (Logs → export) and Neon query logs if available. `audit_events` and `record_access_log` are append-only (database trigger), so they cannot be altered by the app.

## 3. Assess impact
- Which data classes could the credential reach? Database credentials = everything, including patient contact details and appointment reasons.
- Which records were actually read or changed in the window (from step 2)?
- Count affected patients and practitioners. Do not copy their details into chat or tickets.

## 4. Notify
Decide with counsel which authorities and which individuals must be told, and by when. Keep a dated record of every notification sent.

## 5. Recover and record
Confirm rotated secrets work (health check, a sign-in, a test booking on preview). Record timeline, entry point, data affected, notifications and the fix that prevents a repeat.
