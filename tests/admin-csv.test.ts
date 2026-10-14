import { describe, expect, it } from "vitest";
import { csvToRecords, parseCsv } from "../src/lib/admin/csv";
import { toCsv } from "../src/lib/admin/patients";
import { addBusinessDays, isOverdue, maskMobile } from "../src/lib/admin/format";

describe("RFC 4180 parser (ADM-06)", () => {
  it("handles quotes, escaped quotes, commas and CRLF", () => {
    const rows = parseCsv('﻿name,clinic\r\n"Rao, Ananya","Alpha ""Physio"" Clinic"\r\nRohan,Beta\n');
    expect(rows).toEqual([["name", "clinic"], ["Rao, Ananya", 'Alpha "Physio" Clinic'], ["Rohan", "Beta"]]);
  });
  it("normalises headers and skips blank lines", () => {
    const { headers, records } = csvToRecords("Name, Reg No ,PIN Code\nA,KA/1,560001\n\n");
    expect(headers).toEqual(["name", "reg_no", "pin_code"]);
    expect(records).toEqual([{ name: "A", reg_no: "KA/1", pin_code: "560001" }]);
  });
});

describe("CSV export (PRO-17)", () => {
  it("neutralises formula-leading cells and quotes separators", () => {
    const out = toCsv(["a", "b"], [["=SUM(1)", "x,y"], ["+1", '"q"'], ["@cmd", "-2"]]);
    expect(out.split("\r\n")[1]).toBe("'=SUM(1),\"x,y\"");
    expect(out.split("\r\n")[2]).toBe("'+1,\"\"\"q\"\"\"");
    expect(out.split("\r\n")[3]).toBe("'@cmd,'-2");
  });
});

describe("admin formatting (ADM-02, ADM-04)", () => {
  it("masks mobiles to the last three digits", () => {
    expect(maskMobile("+91 98458 60005")).toBe("+91 •••••005");
    expect(maskMobile("9845860005")).toBe("•••••005");
    expect(maskMobile(null)).toBe("—");
  });
  it("counts business days for first-response targets", () => {
    const fri = new Date("2026-10-16T09:00:00Z"); // Friday
    expect(addBusinessDays(fri, 2).toISOString()).toBe("2026-10-20T09:00:00.000Z"); // Tuesday
    expect(isOverdue(fri, null, 2, new Date("2026-10-20T10:00:00Z"))).toBe(true);
    expect(isOverdue(fri, null, 2, new Date("2026-10-19T10:00:00Z"))).toBe(false);
    expect(isOverdue(fri, new Date("2026-10-17T00:00:00Z"), 2, new Date("2026-11-01T00:00:00Z"))).toBe(false);
  });
});
