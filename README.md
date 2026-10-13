# The Physio Index

India-wide physiotherapist directory and appointment platform. Built from the
Software Requirements Specification v1.0 (13 October 2026); requirement IDs
(DIR-, PRO-, BKG-, …) are referenced throughout the code.

## Stack

| Layer | Choice | Why |
| --- | --- | --- |
| Web + API | Next.js 16 (App Router, Cache Components), TypeScript | SSR for SEO (SEO-01), one deployable |
| Database | Neon PostgreSQL 18, Singapore (`ap-southeast-1`) | System of record (DAT-01); nearest Neon region to India |
| ORM / migrations | Drizzle ORM + drizzle-kit SQL migrations | Typed schema; hand-written SQL for exclusion constraints and triggers |
| Driver | `pg` (node-postgres) over the pooled endpoint; `@vercel/functions` pool attach | Multi-statement transactions with row locks on one connection (DAT-10) |
| Auth | Better Auth (phone OTP, TOTP for admins) — milestone 3 | Tables in Neon, no per-user fee |
| Hosting | Vercel, region `sin1` | Same region as the database |

## Repository layout

```
drizzle/                 SQL migrations (0000 generated, 0001 hand-written constraints/triggers)
scripts/migrate.ts       Applies migrations over the DIRECT endpoint (build/CI only)
scripts/seed.ts          Idempotent master data: geography, taxonomies, config, policies
src/db/schema/*.ts       Drizzle schema by domain (identity, geography, practitioners, clinics, scheduling, operations)
src/db/client.ts         Pool + withTransaction (SET LOCAL lock_timeout, pinned client)
src/db/seed/*.ts         Seed data (36 states/UTs, ~150 cities, metro localities, specialties, config defaults)
src/lib/                 API helpers (error catalogue), geography queries, slug utilities
src/app/                 Routes: /, /physiotherapists/{state}/{city}/{locality}, /api/v1/*, policies, help
```

## Environments

| Variable | Used by | Notes |
| --- | --- | --- |
| `DATABASE_URL` | app runtime | Pooled endpoint (`-pooler`). Transaction pooling: no session state. |
| `MIGRATION_DATABASE_URL` | `db:migrate`, `db:seed` | Direct endpoint, schema-owner role. Build/CI only (DAT-05, DAT-11). |
| `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` | auth | milestone 3 |
| `SMS_PROVIDER`, `MSG91_*` | OTP delivery | `console` in development |

Copy `.env.example` to `.env.local`. On Vercel the build command is
`npm run build:vercel` (migrate → seed → build), configured in `vercel.json`.

## Commands

```
npm run dev          # local dev server
npm run typecheck    # next typegen + tsc
npm run lint
npm run db:generate  # drizzle-kit generate after editing src/db/schema
npm run db:migrate   # apply pending migrations (direct endpoint)
npm run db:seed      # idempotent master-data seed
npm run build
```

## Database invariants worth knowing

- `reservations_no_overlap`: GiST exclusion on `(resource_id, occupied_range)` for `held`/`committed` rows — the final overlap guard (BKG-08).
- `reservations_patient_no_overlap`: a patient cannot hold two overlapping appointments (DAT-22).
- Holds carry an explicit `expires_at`; `expire_elapsed_holds(resource_id)` runs inside the booking transaction after the calendar row lock (BKG-09).
- Event/audit tables are append-only (trigger); confirmed/completed bookings cannot be hard-deleted.
- Money is integer paise; price snapshots must reconcile (`total = base - discount + tax + extra`).
- Proposed SRS defaults live in `platform_config`, not in code.

## Delivery milestones

1. **Foundation (this commit):** scaffold, full schema + migrations, geography and master-data seed, SSR directory skeleton, `/api/v1/{health,locations,specialties}`.
2. Public directory: practitioner cards, profile pages, JSON-LD, sitemaps.
3. Auth (phone OTP), practitioner onboarding/claims, admin review queues.
4. Booking engine: holds, idempotency, reschedule, outbox, AT-06 concurrency test.
5. Notifications, reviews, analytics, operations runbooks.
