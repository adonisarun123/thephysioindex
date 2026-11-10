import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api";
import { closeFixtures, configureTestDatabase, makePractitioner, q, TEST_DB, type Fixture } from "./helpers/booking-fixture";

/** Session packages (addendum PKG-01..04): snapshots, session ledger under concurrency, payments, expiry, scoping. */

configureTestDatabase();
const pkg = await import("@/lib/practice/packages");

const code = (e: unknown) => (e instanceof ApiError ? e.code : `UNEXPECTED: ${(e as Error)?.message}`);
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

describe("pure", () => {
  it("per-session price rounds down to whole rupees", () => {
    expect(pkg.perSessionPaise(500_000, 3)).toBe(166_600);
    expect(pkg.perSessionPaise(0, 5)).toBe(0);
  });
});

describe.skipIf(!TEST_DB)("session packages on PostgreSQL", () => {
  let a: Fixture;
  let b: Fixture;
  let actor: string;
  let templateId: string;

  beforeAll(async () => {
    a = await makePractitioner();
    b = await makePractitioner();
    const [u] = await q<{ id: string }>(`INSERT INTO users (auth_subject, display_name, is_test_account) VALUES ('test-pkg-' || gen_random_uuid(), 'TEST PKG', true) RETURNING id`);
    actor = u.id;
    templateId = await pkg.createTemplate(a.practitionerId, actor, { name: "Knee rehab — 3 sessions", sessions: 3, pricePaise: 300_000, validityDays: 30 });
  });
  afterAll(async () => {
    await closeFixtures();
  });

  it("sells with snapshots; later template changes do not alter the sale (PKG-02)", async () => {
    const id = await pkg.sellPackage(a.practitionerId, actor, { templateId, patientLabel: "Meena", paidPaise: 100_000, paymentMode: "upi", startsOn: today() });
    await q(`UPDATE package_templates SET price_paise = 999_00, sessions = 9 WHERE id = $1`, [templateId]);
    const [sold] = (await pkg.listSold(a.practitionerId, "active")).filter((x) => x.id === id);
    expect(sold.sessionsTotal).toBe(3);
    expect(sold.pricePaise).toBe(300_000);
    expect(sold.paidPaise).toBe(100_000);
    await q(`UPDATE package_templates SET price_paise = 300000, sessions = 3 WHERE id = $1`, [templateId]);
    expect(code(await pkg.sellPackage(b.practitionerId, actor, { templateId, patientLabel: "X", paidPaise: 0, startsOn: today() }).catch((e) => e))).toBe("INVALID_INPUT");
    expect(code(await pkg.sellPackage(a.practitionerId, actor, { templateId, patientLabel: "X", paidPaise: 300_001, startsOn: today() }).catch((e) => e))).toBe("INVALID_INPUT");
  });

  it("never over-uses sessions under concurrent clicks; undo works (PKG-03)", async () => {
    const id = await pkg.sellPackage(a.practitionerId, actor, { templateId, patientLabel: "Ravi", paidPaise: 0, startsOn: today() });
    const results = await Promise.allSettled(Array.from({ length: 6 }, () => pkg.recordSessionUse(a.practitionerId, actor, id, today())));
    expect(results.filter((r) => r.status === "fulfilled").length).toBe(3);
    expect(results.filter((r) => r.status === "rejected").every((r) => code((r as PromiseRejectedResult).reason) === "CONFLICT")).toBe(true);
    const [{ n }] = await q<{ n: number }>(`SELECT count(*)::int AS n FROM package_session_uses WHERE package_id = $1`, [id]);
    expect(n).toBe(3);
    await pkg.undoLastSession(a.practitionerId, actor, id);
    expect((await pkg.recordSessionUse(a.practitionerId, actor, id, today())).remaining).toBe(0);
    expect(code(await pkg.recordSessionUse(b.practitionerId, actor, id, today()).catch((e) => e))).toBe("NOT_FOUND");
  });

  it("payments cannot exceed the price; expired packages block use until extended; close/reopen (PKG-02, PKG-04)", async () => {
    const id = await pkg.sellPackage(a.practitionerId, actor, { templateId, patientLabel: "S", paidPaise: 0, startsOn: today() });
    await pkg.recordPayment(a.practitionerId, actor, id, 200_000, "cash");
    expect(code(await pkg.recordPayment(a.practitionerId, actor, id, 100_001).catch((e) => e))).toBe("INVALID_INPUT");
    await pkg.recordPayment(a.practitionerId, actor, id, 100_000);

    await q(`UPDATE patient_packages SET starts_on = (now() AT TIME ZONE 'Asia/Kolkata')::date - 40, expires_on = (now() AT TIME ZONE 'Asia/Kolkata')::date - 1 WHERE id = $1`, [id]);
    expect(code(await pkg.recordSessionUse(a.practitionerId, actor, id, today()).catch((e) => e))).toBe("CONFLICT");
    expect((await pkg.listSold(a.practitionerId, "active")).find((x) => x.id === id)?.expired).toBe(true);
    await pkg.extendPackage(a.practitionerId, actor, id, 14);
    expect((await pkg.recordSessionUse(a.practitionerId, actor, id, today())).remaining).toBe(2);

    await pkg.setPackageClosed(a.practitionerId, actor, id, true);
    expect(code(await pkg.recordSessionUse(a.practitionerId, actor, id, today()).catch((e) => e))).toBe("CONFLICT");
    expect((await pkg.listSold(a.practitionerId, "closed")).some((x) => x.id === id)).toBe(true);
    await pkg.setPackageClosed(a.practitionerId, actor, id, false);
    expect((await pkg.listSold(a.practitionerId, "active")).find((x) => x.id === id)?.paidPaise).toBe(300_000);
  });

  it("retired templates cannot be sold but keep their sales", async () => {
    const t2 = await pkg.createTemplate(a.practitionerId, actor, { name: "Old offer", sessions: 5, pricePaise: 400_000, validityDays: 60 });
    const sale = await pkg.sellPackage(a.practitionerId, actor, { templateId: t2, patientLabel: "K", paidPaise: 0, startsOn: today() });
    await pkg.retireTemplate(a.practitionerId, actor, t2);
    expect((await pkg.listTemplates(a.practitionerId)).some((t) => t.id === t2)).toBe(false);
    expect(code(await pkg.sellPackage(a.practitionerId, actor, { templateId: t2, patientLabel: "K", paidPaise: 0, startsOn: today() }).catch((e) => e))).toBe("INVALID_INPUT");
    expect((await pkg.listSold(a.practitionerId, "active")).some((x) => x.id === sale)).toBe(true);
  });
});
