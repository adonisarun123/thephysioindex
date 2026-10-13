import { connection } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { handler, ok } from "@/lib/api";

/** Liveness + database readiness. Used by synthetic checks (NFR-01). */
export const GET = handler(async (_req, rid) => {
  await connection();
  const started = Date.now();
  const res = await db().execute<{ now: string; version: string; migrations: number; states: number; localities: number }>(sql`
    select now()::text as now,
           current_setting('server_version') as version,
           (select count(*)::int from drizzle.__drizzle_migrations) as migrations,
           (select count(*)::int from states where status = 'active') as states,
           (select count(*)::int from localities where status = 'active') as localities
  `);
  const row = res.rows[0];
  return ok(
    {
      status: "ok",
      service: "thephysioindex",
      region: process.env.VERCEL_REGION ?? "local",
      database: {
        reachable: true,
        latencyMs: Date.now() - started,
        serverVersion: row.version,
        serverTime: row.now,
        migrationsApplied: row.migrations,
        activeStates: row.states,
        activeLocalities: row.localities,
      },
    },
    { requestId: rid },
  );
});
