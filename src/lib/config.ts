import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { textArray } from "./sql";

/** Runtime read of platform_config (proposed SRS defaults are rows, not constants). */
export async function getConfig<T>(key: string, fallback: T): Promise<T> {
  const res = await db().execute<{ value: T }>(sql`SELECT value FROM platform_config WHERE key = ${key}`);
  return res.rows[0]?.value ?? fallback;
}

export async function getConfigMap(keys: string[]): Promise<Record<string, unknown>> {
  if (keys.length === 0) return {};
  const res = await db().execute<{ key: string; value: unknown }>(sql`SELECT key, value FROM platform_config WHERE key = ANY(${textArray(keys)})`);
  return Object.fromEntries(res.rows.map((r) => [r.key, r.value]));
}

export async function featureEnabled(key: string): Promise<boolean> {
  const res = await db().execute<{ enabled: boolean }>(sql`SELECT enabled FROM feature_flags WHERE key = ${key}`);
  return Boolean(res.rows[0]?.enabled);
}
