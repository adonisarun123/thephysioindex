import { describe, expect, it } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { enumArray, textArray, uuidArray } from "@/lib/sql";

describe("array parameters", () => {
  const d = new PgDialect();
  it("keeps arrays as a single parameter rather than a tuple", () => {
    const q = d.sqlToQuery(sql`SELECT ${textArray(["a", "b"])}, ${uuidArray([])}, ${enumArray(["claim"], "case_type")}`);
    expect(q.sql).toBe("SELECT $1::text[], $2::uuid[], $3::case_type[]");
    expect(q.params).toEqual([["a", "b"], [], ["claim"]]);
  });
});
