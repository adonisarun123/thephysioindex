# Suspending a practitioner (VER-06, ADM-03)

Use when registration is in doubt, credential fraud is suspected, a serious complaint needs investigation, or the practitioner asks to stop.

## Do it
Admin → Practitioners → the profile → **Suspend**, with a reason (shown internally; keep it factual). Suspension needs the super-admin role and a recent sign-in, and in one transaction:
- hides the profile from search and marks it suspended,
- turns off online booking and releases any live slot holds,
- opens a **resolution task** for every future confirmed booking,
- records an audit event.

It does **not** cancel existing appointments automatically. Patients may still need care; each future booking needs a decision.

## Work the future bookings
```sql
SELECT t.id, b.reference, b.starts_at AT TIME ZONE 'Asia/Kolkata' AS starts_ist, t.state
FROM resolution_tasks t JOIN bookings b ON b.id = t.booking_id
WHERE t.practitioner_id = '<practitioner id>' AND t.kind = 'future_booking_after_suspension' AND t.state IN ('open','in_progress') ORDER BY b.starts_at;
```
For each: contact the clinic (not the patient directly unless the clinic cannot act). Either the clinic keeps the appointment with another physiotherapist, or the booking is cancelled by the provider with a reason, which notifies the patient. Close the task with the resolution.

## Credential fraud
Open an urgent `credential_fraud` case so the evidence and decision sit together (ADM-07). Preserve evidence; do not edit the profile to remove it.

## Reinstate
Admin → the profile → **Reinstate** with a reason. Booking eligibility is not switched back on automatically; re-run the eligibility checklist and enable it if all checks pass.

## Record
Reason, number of future bookings and how each was resolved.
