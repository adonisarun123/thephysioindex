# The Physio Index — working conventions

Source of truth for requirements: `docs/srs/The_Physio_Index_SRS.md` (SRS v1.0). Cite requirement IDs in code comments and commits.

## Non-negotiables from the SRS
- Neon PostgreSQL is authoritative. Caches and search projections never authorise a booking (DIR-13, BKG-12).
- Booking capacity is protected by the `reservations_no_overlap` exclusion constraint. Never bypass it; never model capacity as a numeric field (Section 8).
- Every capacity mutation: `withTransaction` → `SELECT … FOR UPDATE` on `calendar_resources` (and `patient_calendars`) in a stable order (practitioner first, then patient) → `expire_elapsed_holds()` → validate → write → outbox event, all in one transaction (BKG-07, DAT-03).
- No network calls (SMS, email, maps) while locks are held (BKG-12).
- Money is integer paise. No floats. Snapshots are immutable (OFR-02).
- Authorisation is server-side, deny by default, scoped by role + record (IAM-01). Hiding a button is not authorisation.
- Public read models expose approved fields only. Drafts and evidence never leave the server (PRO-10, DAT-02).
- Proposed defaults (hold TTL, cutoffs, horizons) are rows in `platform_config`, read at runtime.

## Code conventions
- Next.js 16 App Router with Cache Components. Dynamic data access (`params`, `searchParams`, DB) goes inside `<Suspense>`; call `await connection()` before DB reads in request-time components and route handlers. Do not use `"use cache"` around DB reads in milestone 1 (build machines may not reach the DB).
- Route handlers: wrap with `handler()` from `src/lib/api.ts`; throw `ApiError` with a catalogue code (API-04, API-06). Validate input with zod.
- Schema changes: edit `src/db/schema/*.ts` → `npm run db:generate` → review SQL → hand-written SQL goes in a `--custom` migration. Never edit an applied migration.
- Migrations run only via `scripts/migrate.ts` on the direct endpoint. The runtime uses the pooled endpoint.
- Timestamps are `timestamptz` in UTC; display in `Asia/Kolkata`.
- Tests: vitest. Booking engine gets AT-06 (50 concurrent attempts → exactly one confirmed).
- Commit messages: imperative, reference SRS IDs; end with the attribution lines the session supplies.

## Environment facts
- Neon project `mute-dream-63602116`, region `aws-ap-southeast-1`, PG 18. Extensions enabled: `pg_trgm`, `btree_gist`.
  - Branch `production` (br-broad-meadow-azdls973): Vercel production. Runtime role `tpi_runtime` (Neon-managed, member of `tpi_app`, no DDL); migrations as `neondb_owner`.
  - Branch `dev` (br-square-haze-azgd43x3): Vercel preview deployments. `SEED_DEV_DATA=1` and `SHOW_TEST_ACCOUNTS=1` there only; `scripts/seed-dev.ts` refuses the production endpoint.
- Vercel project `thephysioindex`, team `arun-mahendrans-projects`, functions in `sin1`, build command `npm run build:vercel` (migrate → seed → seed-dev → build). Builds run in iad1, so seeds must be bulk statements.
- `*.vercel.app` hosts carry `x-robots-tag: noindex` from Vercel; indexing starts only once www.thephysioindex.com is attached.
- Git flow: feature branch → preview deploy on the dev branch → verify → fast-forward `main`.
- Cloud agent sessions cannot reach `*.neon.tech`; apply SQL through the Neon connector or let the Vercel build run migrations.
