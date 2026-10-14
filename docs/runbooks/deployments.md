# Releases, failed deployments and rollback (OPS-02, OPS-07, DAT-11)

## How a release works
Feature branch → Vercel preview (database branch `dev`) → verify → merge to `main` → Vercel production build runs `npm run build:vercel`:
`db:migrate` (as `neondb_owner`) → `db:seed` (master data, idempotent) → `db:seed:dev` (no-op in production) → `db:seed:content` → `sql:lint` (EXPLAINs every query; fails the build on a broken query) → `next build`.

Migrations therefore run **before** the new code is live, while the old code still serves traffic. Every migration must work with both the old and new application versions.

## Before merging
1. The preview build is green and you have clicked through the changed screens.
2. Tests pass locally (`npm test` with `TEST_DATABASE_URL`), plus `npm run typecheck` and `npm run lint`.
3. If the change has a migration: read the generated SQL. No column drops or renames in the same release as the code that stops using them; drop in a later release.
4. Establish a restore point: note the time (Neon point-in-time restore covers 24 hours), or create a Neon branch from `production` named `pre-release-YYYYMMDD`.

## Build failed
Production keeps serving the previous deployment; nothing to roll back. Read the build log:
- **`sql:lint` failure:** a query references a column or table that does not exist on the production schema. Usually a missing migration. Fix forward.
- **Migration failure:** the migration did not commit. Fix the SQL in a **new** migration (never edit an applied one) and redeploy.
- **Seed failure:** usually a constraint violation from changed master data. Fix the seed data.

## Deployed but broken
1. **Roll back the code:** Vercel → Deployments → the previous production deployment → **Promote to production** (instant). Fine when the release had no migration, or only additive ones.
2. **If a migration changed data or dropped something:** do **not** restore the database to before the release unless there is no alternative; that loses appointments booked since (OPS-07). Fix forward with a new migration or a reviewed repair script. Use restore-and-recovery.md only for genuine data loss.
3. Run the health check (README.md) and a test booking on the preview.

## Record
What broke, how long, how it was detected, and the check that would have caught it before release.
