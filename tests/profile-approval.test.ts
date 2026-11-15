import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { applyStructuredContent, monthToDate, toCode, type StructuredContent } from "@/lib/admin/profile-content";

/**
 * Approval copies the workspace draft into the public tables (PRO-08, PRO-10).
 * The draft shape is the one `DraftSchema` writes: specialties as
 * `{ specialtyId, isPrimary }` and experience months as `YYYY-MM`.
 */
const dialect = new PgDialect();
function recordingTx() {
  const calls: { sql: string; params: unknown[] }[] = [];
  const tx = { execute: async (q: SQL) => (calls.push(dialect.sqlToQuery(q)), { rows: [] }) } as unknown as Db;
  return { tx, calls };
}

const PRACTITIONER = "5f322e25-f8ff-4a6f-8fb8-43babdb0141b";
const MSK = "9379e300-b9b6-42eb-80d4-04869cf49e18";
const NEURO = "d1e1215a-2309-4812-be1c-5ca607df20d5";

describe("approval applies the workspace draft shape", () => {
  it("keeps the main area of practice a physiotherapist chose", async () => {
    const { tx, calls } = recordingTx();
    const draft = { specialties: [{ specialtyId: NEURO, isPrimary: false }, { specialtyId: MSK, isPrimary: true }] } as StructuredContent;
    const applied = await applyStructuredContent(tx, PRACTITIONER, draft);
    const inserts = calls.filter((c) => c.sql.includes("INSERT INTO practitioner_specialties"));
    expect(applied).toEqual(["specialties"]);
    expect(inserts).toHaveLength(2);
    expect(inserts[0].params).toEqual([PRACTITIONER, false, NEURO]);
    expect(inserts[1].params).toEqual([PRACTITIONER, true, MSK]);
  });

  it("still accepts codes and ids", () => {
    expect(toCode("musculoskeletal")).toBe("musculoskeletal");
    expect(toCode({ code: "neuro" })).toBe("neuro");
    expect(toCode({ id: MSK })).toBe(MSK);
    expect(toCode({ specialtyId: MSK })).toBe(MSK);
  });

  it("stores experience months as real dates", async () => {
    const { tx, calls } = recordingTx();
    const draft: StructuredContent = {
      experiences: [
        { role: "Physiotherapist", organisationName: "Sri Sapthagiri Physiotherapy Clinic", startMonth: "2018-07", endMonth: "2020-08", description: "" },
        { role: "Physiotherapist", organisationName: "Home visits", startMonth: "2020-09", endMonth: null },
      ],
    };
    await applyStructuredContent(tx, PRACTITIONER, draft);
    const inserts = calls.filter((c) => c.sql.includes("INSERT INTO experiences"));
    expect(inserts).toHaveLength(2);
    expect(inserts[0].params).toEqual([PRACTITIONER, "Physiotherapist", "Sri Sapthagiri Physiotherapy Clinic", "2018-07-01", "2020-08-01", null, 0]);
    expect(inserts[1].params).toEqual([PRACTITIONER, "Physiotherapist", "Home visits", "2020-09-01", null, null, 1]);
  });

  it("leaves full dates alone", () => {
    expect(monthToDate("2018-07")).toBe("2018-07-01");
    expect(monthToDate("2018-07-15")).toBe("2018-07-15");
  });
});
