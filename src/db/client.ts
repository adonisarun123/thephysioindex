import { attachDatabasePool } from "@vercel/functions";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool, type PoolClient } from "pg";
import * as schema from "./schema";

/**
 * Application database access (DAT-05, DAT-10).
 *
 * - Uses node-postgres over Neon's pooled endpoint (transaction pooling), so
 *   the code never relies on session state or session advisory locks.
 * - Booking transactions use `withTransaction`, which pins one PoolClient for
 *   the whole multi-statement transaction so row locks and writes share one
 *   connection (DAT-10).
 * - On Vercel Fluid compute the pool is attached to the function lifecycle so
 *   idle connections are closed before the instance suspends.
 */

declare global {
  var __tpiPool: Pool | undefined;
}

function createPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }
  const pool = new Pool({
    connectionString,
    max: Number(process.env.DB_POOL_MAX ?? 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    // Bounded lock waits are set per transaction (BKG-12); statement timeout here
    // is a backstop for runaway public queries.
    statement_timeout: Number(process.env.DB_STATEMENT_TIMEOUT_MS ?? 15_000),
    application_name: "thephysioindex-web",
  });
  pool.on("error", (err) => {
    console.error("[db] idle client error", err.message);
  });
  if (process.env.VERCEL) {
    attachDatabasePool(pool);
  }
  return pool;
}

export function getPool(): Pool {
  if (!globalThis.__tpiPool) {
    globalThis.__tpiPool = createPool();
  }
  return globalThis.__tpiPool;
}

export type Db = NodePgDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

let _db: Db | undefined;
export function db(): Db {
  if (!_db) {
    _db = drizzle(getPool(), { schema });
  }
  return _db;
}

export interface TransactionOptions {
  /** Lock wait bound in milliseconds (BKG-12). Default 3000. */
  lockTimeoutMs?: number;
  /** Statement timeout for the transaction. Default 10000. */
  statementTimeoutMs?: number;
  isolation?: "read committed" | "repeatable read" | "serializable";
}

/**
 * Runs `fn` inside one transaction on one pinned client. Settings are applied
 * with SET LOCAL so they never leak through the pooler (DAT-05).
 */
export async function withTransaction<T>(
  fn: (client: PoolClient, tx: Db) => Promise<T>,
  opts: TransactionOptions = {},
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN" + (opts.isolation ? ` ISOLATION LEVEL ${opts.isolation.toUpperCase()}` : ""));
    await client.query(`SET LOCAL lock_timeout = '${Math.max(100, opts.lockTimeoutMs ?? 3000)}ms'`);
    await client.query(`SET LOCAL statement_timeout = '${Math.max(1000, opts.statementTimeoutMs ?? 10_000)}ms'`);
    const tx = drizzle(client, { schema });
    const result = await fn(client, tx);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore rollback failure; the client is released below
    }
    throw err;
  } finally {
    client.release();
  }
}
