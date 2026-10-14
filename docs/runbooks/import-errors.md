# Bulk import errors (ADM-06)

Imports are staged: upload → validate (row errors, duplicate candidates) → publish → (if needed) **revert**. Imported records are never verified or claimed automatically.

## A batch published bad data
1. Admin → Imports → open the batch. Note the batch ID and how many practitioners/clinics/branches it created.
2. If the batch is wrong as a whole: **Revert** with a reason. Reverting archives the batch's **unclaimed** practitioners, closes their open verification cases, and archives branches and clinics the batch created once nothing live uses them. Records that existed before, and profiles someone has since claimed, are left alone.
3. Check nothing from the batch was claimed or booked in the meantime:
   ```sql
   SELECT p.id, p.display_name, p.claim_state, (SELECT count(*) FROM bookings b WHERE b.practitioner_id = p.id) AS bookings
   FROM practitioners p WHERE p.import_batch_id = '<batch id>' AND (p.claim_state <> 'unclaimed' OR EXISTS (SELECT 1 FROM bookings b WHERE b.practitioner_id = p.id));
   ```
   Claimed or booked profiles must be fixed individually (Admin → Practitioners), not reverted.
4. If only some rows are wrong: fix them individually, or merge duplicates through Admin → Review queues → Duplicates (merges keep aliases, sources and booking history).

## Duplicates created
Use the duplicates queue. Never delete a practitioner with bookings; merge into the record that keeps the bookings.

## Scraped or third-party sources
Imports need source and permission metadata (ADM-06). Data scraped without the practitioner's consent should be used for invite-to-claim outreach, not published as listings (DIR-14).

## Verify and record
Directory pages for the affected cities show the expected count; the batch shows *reverted* or corrected. Record the batch, cause and rows affected.
