# Restore and recovery (DAT-12, NFR-08, SEC-09)

**Targets:** RPO ≤ 15 minutes, RTO ≤ 4 hours (NFR-08).

## What exists today
- Neon point-in-time restore on the `production` branch with **24 hours of history** (`history_retention_seconds = 86400`, Launch plan). This meets the RPO **only** for problems noticed within 24 hours.
- **No independent backup.** A Neon account or project loss, or corruption found after 24 hours, is unrecoverable today.

**Decision needed (owner: Arun):** either raise history retention (higher plan) and/or add a nightly encrypted logical export (`pg_dump` of the production branch to storage outside Neon, kept 30 days per SEC-09). Until then the RPO/RTO claim is not demonstrable.

## Restore drill (do quarterly, and before launch)
1. Neon → `production` branch → **Branches → Create branch** from a point in time 1 hour ago, named `restore-drill-YYYYMMDD`. This is isolated; production is untouched.
2. Connect with `neondb_owner` and spot-check: latest bookings, a practitioner's published profile, recent audit events.
3. Time the steps. RTO evidence = time from decision to a verified branch.
4. Delete the drill branch. Record date, restore point, duration and anything that surprised you.

## Real restore (data loss or corruption)
1. **Stop writes if the damage is still growing.** There is no platform-wide booking switch yet. The blunt option is to reset the `tpi_runtime` password in Neon, which takes the whole site offline (reads and writes) until you put the new password in Vercel and redeploy. If the damage is contained, skip this and keep the site up. Note the exact time of the bad change (from `audit_events` or `booking_events`).
2. Create a branch from **just before** the bad change, as in the drill. Verify it.
3. Choose one:
   - **Targeted repair (preferred):** copy the damaged rows from the restore branch into production with a reviewed SQL script. Keeps every booking made since.
   - **Full rollback:** Neon → restore `production` to the point in time. **Loses everything written after that point**, including real appointments; only when targeted repair is impossible. Export bookings created after the restore point first so clinics can be told.
4. **Before reopening:** reapply deletions that happened after the restore point (privacy erasures, withdrawn reviews, revoked roles) so deleted data is not resurrected (SEC-09). Check `privacy_requests` completed after the restore point and `audit_events` for deletes.
5. Rotate `CRON_SECRET` only if the incident involved credentials; otherwise leave it.
6. Run the health check and a test booking on the preview first, then production.

## Record
Restore point, data lost (counts), clinics/patients notified, and whether retention or backups changed.
