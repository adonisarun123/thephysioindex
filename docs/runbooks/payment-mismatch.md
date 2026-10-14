# Payment mismatch

**Today (launch):** patients pay at the clinic. The platform collects no money. A booking's payment status is **self-reported** by the practice (`payment_reported`), and *booking value* in reports is not revenue (PAY-01).

## A patient or clinic disputes what was paid
1. Find the booking by reference and read the agreed fee snapshot; this is what the patient was shown and agreed:
   ```sql
   SELECT b.reference, b.status, b.payment_reported, s.base_paise, s.discount_paise, s.tax_paise, s.total_paise, s.offer_explanation, s.line_items
   FROM bookings b LEFT JOIN booking_price_snapshots s ON s.id = b.price_snapshot_id WHERE b.reference = 'TPI-XXXXXX';
   ```
   Amounts are paise (₹1 = 100 paise). Snapshots are immutable (OFR-02).
2. If the clinic charged more than the agreed total, that is a complaint against the listing: open a `complaint` case linked to the booking (ADM-07). Offers must be honoured as shown.
3. The platform does not refund or collect; it records the outcome and, if repeated, applies listing consequences.

## When online payments are introduced
They are behind a feature flag (OPS-03) and not built. This runbook must then be extended for provider reconciliation (provider reference vs booking), refunds, and settlement mismatches before the flag is turned on.
