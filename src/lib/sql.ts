import { sql, type SQL } from "drizzle-orm";

/**
 * Postgres array parameter. Drizzle expands a bare JS array inside sql`` into a
 * tuple "($1, $2)", which cannot be cast to text[]; sql.param keeps it as one
 * parameter that node-postgres serialises as an array literal.
 */
export function textArray(values: readonly string[] | null | undefined): SQL {
  return sql`${sql.param(values ?? [])}::text[]`;
}

export function jsonb(value: unknown): SQL {
  return sql`${value == null ? null : JSON.stringify(value)}::jsonb`;
}

export function uuidArray(values: readonly string[] | null | undefined): SQL {
  return sql`${sql.param(values ?? [])}::uuid[]`;
}

/** Array of a Postgres enum type, e.g. enumArray(["claim"], "case_type"). The type name is a trusted literal. */
export function enumArray(values: readonly string[] | null | undefined, typeName: string): SQL {
  return sql`${sql.param(values ?? [])}::${sql.raw(typeName)}[]`;
}
