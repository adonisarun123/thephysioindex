import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { applyStructuredContent, identityOf, monthToDate, toCode, type StructuredContent } from "@/lib/admin/profile-content";

/**
 * Approval copies the workspace draft into the public tables (PRO-08, PRO-10).
 * The draft shape is the one `DraftSchema` writes: specialties as
 * `{ specialtyId, isPrimary }` and experience months as `YYYY-MM`.
 */
const dialect = new PgDialect();
function recordingTx(currentSlug = "dr-sruthi-l") {
  const calls: { sql: string; params: unknown[] }[] = [];
  const tx = {
    execute: async (q: SQL) => {
      const call = dialect.sqlToQuery(q);
      calls.push(call);
      return { rows: call.sql.includes("SELECT slug FROM practitioners") ? [{ slug: currentSlug }] : [] };
    },
  } as unknown as Db;
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

  it("applies headline and gender from the draft's identity block and leaves the address alone", async () => {
    const { tx, calls } = recordingTx();
    const draft: StructuredContent = { identity: { displayName: "Dr Sruthi L", designation: "Physiotherapist", headline: "", gender: "female" } };
    const applied = await applyStructuredContent(tx, PRACTITIONER, draft);
    const update = calls.find((c) => c.sql.startsWith("UPDATE practitioners"));
    expect(applied).toEqual(["identity"]);
    expect(update?.sql).toContain("gender =");
    expect(update?.sql).not.toContain("slug =");
    expect(update?.params).toEqual(["Dr Sruthi L", "Physiotherapist", null, "female", PRACTITIONER]);
    expect(calls.some((c) => c.sql.includes("practitioner_slug_history"))).toBe(false);
  });

  it("moves the address with an approved name change and keeps the old one", async () => {
    const { tx, calls } = recordingTx("mani");
    await applyStructuredContent(tx, PRACTITIONER, { identity: { displayName: "Dr Mani Kumar", gender: "unset" } });
    const history = calls.find((c) => c.sql.includes("INSERT INTO practitioner_slug_history"));
    const update = calls.find((c) => c.sql.startsWith("UPDATE practitioners"));
    expect(history?.params).toEqual([PRACTITIONER, "mani"]);
    expect(update?.sql).toContain("slug =");
    expect(update?.params).toEqual(["Dr Mani Kumar", "dr-mani-kumar", "unset", PRACTITIONER]);
  });

  it("reads identity from either shape, top level first, and ignores a blank name", () => {
    expect(identityOf({ displayName: "A B", identity: { displayName: "C D", headline: "x" } })).toEqual({ displayName: "A B", designation: undefined, headline: "x", gender: undefined });
    expect(identityOf({ identity: { displayName: "  " } }).displayName).toBeUndefined();
    expect(identityOf({ about: "only about" })).toEqual({ displayName: undefined, designation: undefined, headline: undefined, gender: undefined });
  });
});
