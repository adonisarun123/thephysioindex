# Addendum: free practice tools for listed physiotherapists (Nov 2026)

Scope added on top of SRS v1.0 after reviewing practice-management products (physioapp.in). Decision by Arun, 10 Nov 2026: build the practitioner-facing tools that help recruitment and retention; do **not** build clinic ERP features (EMR/IPD, beds, inventory, HRMS, GPS attendance, white-label). None of these tools affects ranking, booking capacity or public listing data.

## HEP — Home exercise plans

- **HEP-01 Library.** A text-only starter library (`src/db/seed/exercises.ts`, editorial team) plus each practitioner's own exercises. Own exercises are visible only in that practitioner's workspace. Retiring an exercise hides it from the picker; plans that use it keep it.
- **HEP-02 Plans.** A plan belongs to one practitioner and names the patient by first name or initials only (no phone, diagnosis or patient record). Up to 20 ordered exercises, each with sets, reps, hold, frequency and a note. Editing keeps the same patient link.
- **HEP-03 Adherence.** The patient marks a day "done" (one row per plan per IST day) with an optional 0–10 pain score. The practitioner sees the last 14 days, done-in-last-7 and the last pain score. Ended plans accept no check-ins.
- **HEP-04 Private link.** `/plan/<token>`; token = plan id + HMAC(server secret, plan id, link version). No token is stored. "Make a new link" bumps the version and revokes the old link; archiving makes the link inactive. Invalid, stale and archived links show the same message. The page is `noindex`, `no-referrer`, disallowed in robots, and never loads the Google Ads tag.
- **HEP-05 Sharing.** "Send on WhatsApp" opens WhatsApp click-to-chat (`wa.me/?text=`) with the link pre-filled; no provider and no stored phone number.

## WAP — WhatsApp notifications

- **WAP-01** Provider adapter (`src/lib/messaging/whatsapp.ts`): console by default; Meta WhatsApp Cloud API when configured. Approved template name in `provider_template_id`; values positional in placeholder order.
- **WAP-02** A user gets WhatsApp only with the `messaging.whatsapp` flag on, a verified mobile and an explicit opt-in; it then replaces SMS for that user. Dependants stay on SMS.
- **WAP-03** A WhatsApp twin of every SMS template. Setup: `docs/runbooks/whatsapp.md`.

## ENQ — Enquiry inbox

- **ENQ-01** `/workspace/enquiries` lists the practitioner's own enquiries (open, follow-ups due, closed, all).
- **ENQ-02** Contacted, follow-up date, private note, close with outcome (booked / not interested / no response / other), reopen.
- **ENQ-03** Nav badge = unanswered + follow-ups due.
- **ENQ-04** New enquiry → `enquiry.created` → the profile owner is notified with the requester's first name only; mobile and message stay in the workspace. Unclaimed profiles still go to admin.

## PKG — Session packages

- **PKG-01** Package catalogue per practitioner (name, sessions, price in paise, validity days). Not public; online booking prices unchanged.
- **PKG-02** Sale copies sessions, price and validity (snapshots); patient by first name/initials; payments recorded up to the price, never above.
- **PKG-03** One ledger row per session used; the package row is locked, so concurrent clicks cannot over-use it; undo removes the latest row.
- **PKG-04** Expired packages block use until extended; close/reopen; list shows sessions left, balance due and expiry.

## RCP — Prints, receipts and reminders (from physiosoftware.in, 10 Nov 2026)

- **RCP-01** Payment ledger: every package payment is a row with a receipt number unique per practitioner (`R-00001`…), allocated from `practice_counters` under the row lock. Migration 0016 creates one opening receipt for packages already paid.
- **RCP-02** Printable payment receipt (letterhead, receipt no., amount in words, mode, paid to date, balance). Not a tax invoice.
- **RCP-03** Printable home-exercise prescription on the letterhead (name, degrees, first registration number with authority, first clinic's name/address/phone; no address for home-visit-only physios). Patients can print their plan page too.
- **RCP-04** Balance-due reminder via WhatsApp click-to-chat from the package card.
