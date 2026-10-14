import { config as loadEnv } from "dotenv";
loadEnv({ path: [".env.local", ".env"] });
import { defineConfig } from "drizzle-kit";

// Migrations are plain SQL under ./drizzle. drizzle-kit generate diffs the
// TypeScript schema; hand-written SQL (extensions, exclusion constraints,
// triggers) lives in numbered custom migrations in the same folder.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema/index.ts",
  out: "./drizzle",
  schemaFilter: ["public", "analytics", "auth"],
  dbCredentials: {
    // Direct (non-pooled) endpoint for migrations (DAT-05).
    url: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? "",
  },
  strict: true,
  verbose: true,
});
