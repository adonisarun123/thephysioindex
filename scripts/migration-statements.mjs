#!/usr/bin/env node
/**
 * Prints the statements of one drizzle migration as a JSON array, plus the
 * bookkeeping INSERT that drizzle-kit's migrator expects, so a migration can be
 * applied through an external SQL channel (e.g. the Neon MCP connector) when
 * the build machine cannot open a Postgres connection.
 *
 *   node scripts/migration-statements.mjs drizzle/0000_init_schema.sql [--chunk N] [--part I]
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { basename } from "node:path";

const args = process.argv.slice(2);
const file = args[0];
if (!file) {
  console.error("usage: migration-statements.mjs <migration.sql> [--chunk N] [--part I] [--journal]");
  process.exit(1);
}
const chunk = Number(args[args.indexOf("--chunk") + 1] || 0);
const part = Number(args[args.indexOf("--part") + 1] || 0);
const journalOnly = args.includes("--journal");

const sql = readFileSync(file, "utf8");
const statements = sql
  .split("--> statement-breakpoint")
  .map((s) => s.trim())
  .filter(Boolean);

const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8"));
const tag = basename(file).replace(/\.sql$/, "");
const entry = journal.entries.find((e) => e.tag === tag);
if (!entry) throw new Error(`no journal entry for ${tag}`);
const hash = createHash("sha256").update(sql).digest("hex");
const bookkeeping = [
  `CREATE SCHEMA IF NOT EXISTS "drizzle"`,
  `CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint)`,
  `INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at") VALUES ('${hash}', ${entry.when})`,
];

if (journalOnly) {
  console.log(JSON.stringify(bookkeeping, null, 0));
  process.exit(0);
}

if (chunk > 0) {
  const slice = statements.slice(part * chunk, (part + 1) * chunk);
  console.error(`part ${part}: statements ${part * chunk}..${part * chunk + slice.length - 1} of ${statements.length}`);
  console.log(JSON.stringify(slice));
} else {
  console.error(`${statements.length} statements`);
  console.log(JSON.stringify(statements));
}
