import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api";
import { closeFixtures, configureTestDatabase, makePractitioner, q, TEST_DB, type Fixture } from "./helpers/booking-fixture";

/**
 * Home exercise plans (addendum HEP-01..05): practitioner scoping, link
 * tokens (no stored secret, rotation revokes), archive, daily check-ins and
 * the form parser.
 */

configureTestDatabase();
process.env.BETTER_AUTH_SECRET ??= "test-secret-for-vitest-only-0123456789";
const hep = await import("@/lib/practice/exercise-plans");
const { parsePlanForm } = await import("@/lib/practice/plan-form");

const code = (e: unknown) => (e instanceof ApiError ? e.code : `UNEXPECTED: ${(e as Error)?.message}`);

describe("plan tokens (pure)", () => {
  const id = "0b8f6c7e-2d3a-4f1b-9c5d-6e7f8a9b0c1d";
  it("round-trips the plan id and changes with the link version", () => {
    const t1 = hep.planToken(id, 1);
    const t2 = hep.planToken(id, 2);
    expect(t1).not.toEqual(t2);
    expect(hep.parsePlanToken(t1)?.planId).toBe(id);
    expect(t1).toMatch(/^[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{24}$/);
  });
  it("rejects malformed tokens", () => {
    expect(hep.parsePlanToken("nope")).toBeNull();
    expect(hep.parsePlanToken(`${"a".repeat(22)}.${"b".repeat(23)}`)).toBeNull();
  });
  it("formats dose lines", () => {
    expect(hep.doseLine({ sets: 2, reps: 10, holdSeconds: 5, frequency: "Twice a day" })).toBe("2 × 10 · hold 5 s · twice a day");
    expect(hep.doseLine({ sets: null, reps: null, holdSeconds: null, frequency: null })).toBe("");
  });
});

describe("plan form parser (pure)", () => {
  const ex = "0b8f6c7e-2d3a-4f1b-9c5d-6e7f8a9b0c1d";
  function fd(entries: [string, string][]) {
    const f = new FormData();
    for (const [k, v] of entries) f.append(k, v);
    return f;
  }
  it("parses ordered rows and blanks", () => {
    const out = parsePlanForm(fd([["patientLabel", "Ravi K"], ["title", "Knee week 1"], ["items[0].exerciseId", ex], ["items[0].sets", "2"], ["items[0].reps", ""], ["items[0].frequency", "Daily"]]));
    expect(out.items).toEqual([{ exerciseId: ex, sets: 2, reps: undefined, holdSeconds: undefined, frequency: "Daily", note: undefined }]);
  });
  it("rejects non-numeric doses and empty plans", () => {
    expect(() => parsePlanForm(fd([["patientLabel", "R"], ["title", "Plan"], ["items[0].exerciseId", ex], ["items[0].sets", "two"]]))).toThrow(/whole number/);
    expect(() => parsePlanForm(fd([["patientLabel", "R"], ["title", "Plan"]]))).toThrow(/at least one exercise/);
  });
});

describe.skipIf(!TEST_DB)("exercise plans on PostgreSQL", () => {
  let a: Fixture;
  let b: Fixture;
  let actor: string;
  let library: string[];

  beforeAll(async () => {
    a = await makePractitioner();
    b = await makePractitioner();
    const [u] = await q<{ id: string }>(`INSERT INTO users (auth_subject, display_name, is_test_account) VALUES ('test-hep-' || gen_random_uuid(), 'TEST HEP', true) RETURNING id`);
    actor = u.id;
    library = (await q<{ id: string }>(`SELECT id FROM exercises WHERE practitioner_id IS NULL ORDER BY code LIMIT 3`)).map((r) => r.id);
    expect(library.length).toBe(3);
  });
  afterAll(async () => {
    await closeFixtures();
  });

  it("scopes own exercises to their practitioner (HEP-01)", async () => {
    const mine = await hep.createCustomExercise(a.practitionerId, actor, { name: "TEST band row", bodyRegion: "shoulder", instructions: "Pull the band towards you, squeezing the shoulder blades." });
    expect((await hep.listExercises(a.practitionerId)).some((e) => e.id === mine && e.custom)).toBe(true);
    expect((await hep.listExercises(b.practitionerId)).some((e) => e.id === mine)).toBe(false);
    const err = await hep.createPlan(b.practitionerId, actor, { patientLabel: "X", title: "Other's exercise", items: [{ exerciseId: mine }] }).catch((e) => e);
    expect(code(err)).toBe("INVALID_INPUT");
    // Retired own exercise: hidden from the picker, kept in existing plans.
    const { planId } = await hep.createPlan(a.practitionerId, actor, { patientLabel: "R", title: "Uses own", items: [{ exerciseId: mine }] });
    await hep.retireCustomExercise(a.practitionerId, actor, mine);
    expect((await hep.listExercises(a.practitionerId)).some((e) => e.id === mine)).toBe(false);
    await hep.updatePlan(a.practitionerId, actor, planId, { patientLabel: "R", title: "Uses own, edited", items: [{ exerciseId: mine, sets: 3 }] });
    expect((await hep.getPlan(a.practitionerId, planId))?.items[0].sets).toBe(3);
    const err2 = await hep.createPlan(a.practitionerId, actor, { patientLabel: "R", title: "New with retired", items: [{ exerciseId: mine }] }).catch((e) => e);
    expect(code(err2)).toBe("INVALID_INPUT");
  });

  it("creates, reads by token, rotates and archives (HEP-02, HEP-04)", async () => {
    const { planId, token } = await hep.createPlan(a.practitionerId, actor, {
      patientLabel: "Ravi",
      title: "Knee week 1",
      items: [{ exerciseId: library[0], sets: 2, reps: 10 }, { exerciseId: library[1] }],
    });
    const view = await hep.getPlanByToken(token);
    expect(view?.id).toBe(planId);
    expect(view?.items.map((i) => i.exerciseId)).toEqual([library[0], library[1]]);
    expect(await hep.getPlan(b.practitionerId, planId)).toBeNull();
    expect(code(await hep.rotatePlanLink(b.practitionerId, actor, planId).catch((e) => e))).toBe("NOT_FOUND");

    // No token material is stored.
    const [row] = await q<Record<string, unknown>>(`SELECT * FROM exercise_plans WHERE id = $1`, [planId]);
    expect(JSON.stringify(row)).not.toContain(token.split(".")[1]);

    // Forged tag for a real plan id fails.
    const forged = `${token.split(".")[0]}.${"A".repeat(24)}`;
    expect(await hep.getPlanByToken(forged)).toBeNull();

    const fresh = await hep.rotatePlanLink(a.practitionerId, actor, planId);
    expect(await hep.getPlanByToken(token)).toBeNull();
    expect((await hep.getPlanByToken(fresh))?.id).toBe(planId);
    expect(await hep.currentPlanToken(a.practitionerId, planId)).toBe(fresh);

    await hep.setPlanArchived(a.practitionerId, actor, planId, true);
    expect(await hep.getPlanByToken(fresh)).toBeNull();
    await hep.setPlanArchived(a.practitionerId, actor, planId, false);
    expect((await hep.getPlanByToken(fresh))?.id).toBe(planId);
  });

  it("records one check-in per IST day and reports adherence (HEP-03)", async () => {
    const { planId, token } = await hep.createPlan(a.practitionerId, actor, { patientLabel: "S", title: "Back", items: [{ exerciseId: library[2] }] });
    await hep.recordCheckin(token, null);
    await hep.recordCheckin(token, 4);
    await hep.recordCheckin(token, null); // keeps the earlier pain score
    const rows = await q<{ pain_score: number | null }>(`SELECT pain_score FROM exercise_plan_checkins WHERE plan_id = $1`, [planId]);
    expect(rows).toEqual([{ pain_score: 4 }]);
    expect(code(await hep.recordCheckin(token, 11).catch((e) => e))).toBe("INVALID_INPUT");
    const summary = (await hep.listPlans(a.practitionerId)).find((p) => p.id === planId);
    expect(summary?.doneLast7).toBe(1);
    expect(summary?.lastPain).toBe(4);
    expect((await hep.getPlanByToken(token))?.doneToday).toBe(true);

    await q(`UPDATE exercise_plans SET ends_on = (now() AT TIME ZONE 'Asia/Kolkata')::date - 1 WHERE id = $1`, [planId]);
    expect((await hep.getPlanByToken(token))?.ended).toBe(true);
    expect(code(await hep.recordCheckin(token, null).catch((e) => e))).toBe("CONFLICT");
  });

  it("rejects bad plan ids without querying (HEP-02)", async () => {
    expect(await hep.getPlan(a.practitionerId, "not-a-uuid")).toBeNull();
  });
});
