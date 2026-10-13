/**
 * Applies pending drizzle migrations over a DIRECT (non-pooled) connection
 * using the schema-owner role (DAT-05, DAT-11). Run from CI/build or a
 * developer machine; the runtime role never runs this.
 *
 *   npm run db:migrate
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: [".env.local", ".env"] });
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

async function main() {
  const url = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL_UNPOOLED;
  if (!url) {
    throw new Error("MIGRATION_DATABASE_URL (or DATABASE_URL_UNPOOLED) is required for migrations");
  }
  if (url.includes("-pooler.")) {
    throw new Error("Refusing to run migrations through the pooled endpoint; use the direct connection string");
  }
  const pool = new Pool({ connectionString: url, max: 1, application_name: "thephysioindex-migrate" });
  const db = drizzle(pool);
  const started = Date.now();
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log(`[migrate] up to date in ${Date.now() - started} ms`);
  await pool.end();
}

main().catch((err) => {
  console.error("[migrate] failed", err);
  process.exit(1);
});
