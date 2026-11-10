# Addendum: free practice tools for listed physiotherapists (Nov 2026)

Scope added on top of SRS v1.0 after reviewing practice-management products (physioapp.in). Decision by Arun, 10 Nov 2026: build the practitioner-facing tools that help recruitment and retention; do **not** build clinic ERP features (EMR/IPD, beds, inventory, HRMS, GPS attendance, white-label). None of these tools affects ranking, booking capacity or public listing data.

## HEP — Home exercise plans

- **HEP-01 Library.** A text-only starter library (`src/db/seed/exercises.ts`, editorial team) plus each practitioner's own exercises. Own exercises are visible only in that practitioner's workspace. Retiring an exercise hides it from the picker; plans that use it keep it.
- **HEP-02 Plans.** A plan belongs to one practitioner and names the patient by first name or initials only (no phone, diagnosis or patient record). Up to 20 ordered exercises, each with sets, reps, hold, frequency and a note. Editing keeps the same patient link.
- **HEP-03 Adherence.** The patient marks a day "done" (one row per plan per IST day) with an optional 0–10 pain score. The practitioner sees the last 14 days, done-in-last-7 and the last pain score. Ended plans accept no check-ins.
- **HEP-04 Private link.** `/plan/<token>`; token = plan id + HMAC(server secret, plan id, link version). No token is stored. "Make a new link" bumps the version and revokes the old link; archiving makes the link inactive. Invalid, stale and archived links show the same message. The page is `noindex`, `no-referrer`, disallowed in robots, and never loads the Google Ads tag.
- **HEP-05 Sharing.** "Send on WhatsApp" opens WhatsApp click-to-chat (`wa.me/?text=`) with the link pre-filled; no provider and no stored phone number.

## Planned in this addendum (separate PRs)

- **WAP** — WhatsApp as a notification channel (provider adapter; console until a provider and approved templates exist; behind the `messaging.whatsapp` flag).
- **ENQ** — practitioner enquiry inbox with follow-up dates.
- **PKG** — session packages (prepaid bundles) on top of offerings.
