import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api";
import { closeFixtures, configureTestDatabase, makePractitioner, q, TEST_DB, type Fixture } from "./helpers/booking-fixture";

/** Patient records (addendum EMR-01..07): terms gate, consent, scoping, rights, edit window, timeline, audit of reads. */

configureTestDatabase();
process.env.BETTER_AUTH_SECRET ??= "test-secret-for-vitest-only-0123456789";
const emr = await import("@/lib/practice/patients");
const hep = await import("@/lib/practice/exercise-plans");
const pkg = await import("@/lib/practice/packages");

const code = (e: unknown) => (e instanceof ApiError ? e.code : `UNEXPECTED: ${(e as Error)?.message}`);
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
type G = { role: string; scopeType: string; scopeId: string | null; permissions: string[] };
const v = (grants: G[]) => ({ grants }) as unknown as Parameters<typeof emr.patientRights>[0];

describe("rights (pure, EMR-06)", () => {
  const pid = "0b8f6c7e-2d3a-4f1b-9c5d-6e7f8a9b0c1d";
  it("owner reads and writes; coordinators need explicit permissions; staff get nothing", () => {
    expect(emr.patientRights(v([]), pid, true)).toEqual({ canRead: true, canWrite: true });
    expect(emr.patientRights(v([{ role: "clinic_coordinator", scopeType: "practitioner", scopeId: pid, permissions: ["appointments.read"] }]), pid, false)).toEqual({ canRead: false, canWrite: false });
    expect(emr.patientRights(v([{ role: "clinic_coordinator", scopeType: "practitioner", scopeId: pid, permissions: ["patients.read"] }]), pid, false)).toEqual({ canRead: true, canWrite: false });
    expect(emr.patientRights(v([{ role: "clinic_coordinator", scopeType: "practitioner", scopeId: pid, permissions: ["patients.manage"] }]), pid, false)).toEqual({ canRead: true, canWrite: true });
    expect(emr.patientRights(v([{ role: "clinic_coordinator", scopeType: "practitioner", scopeId: "other", permissions: ["patients.manage"] }]), pid, false).canRead).toBe(false);
    expect(emr.patientRights(v([{ role: "super_admin", scopeType: "global", scopeId: null, permissions: [] }]), pid, false).canRead).toBe(false);
  });
});

describe.skipIf(!TEST_DB)("patient records on PostgreSQL", () => {
  let a: Fixture;
  let b: Fixture;
  let owner: string;
  let other: string;

  beforeAll(async () => {
    a = await makePractitioner();
    b = await makePractitioner();
    const users = await q<{ id: string }>(`INSERT INTO users (auth_subject, display_name, is_test_account) VALUES ('test-emr-a-' || gen_random_uuid(), 'TEST Owner', true), ('test-emr-b-' || gen_random_uuid(), 'TEST Colleague', true) RETURNING id`);
    owner = users[0].id;
    other = users[1].id;
  });
  afterAll(async () => {
    await closeFixtures();
  });

  it("requires accepted terms and recorded consent (EMR-01, EMR-02)", async () => {
    expect(code(await emr.createPatient(a.practitionerId, owner, emr.PatientSchema.parse({ fullName: "Priya Sharma" }), true).catch((e) => e))).toBe("CONFLICT");
    await emr.acceptRecordsTerms(a.practitionerId, owner);
    expect(await emr.recordsTermsAccepted(a.practitionerId)).toBe(true);
    expect(code(await emr.createPatient(a.practitionerId, owner, emr.PatientSchema.parse({ fullName: "Priya Sharma" }), false).catch((e) => e))).toBe("INVALID_INPUT");
    const id = await emr.createPatient(a.practitionerId, owner, emr.PatientSchema.parse({ fullName: "Priya Sharma", mobile: "98765 43210", birthYear: 1980 }), true);
    const [row] = await q<{ ref_no: string; mobile: string }>(`SELECT ref_no, mobile FROM practice_patients WHERE id = $1`, [id]);
    expect(row.ref_no).toMatch(/^P-\d{5}$/);
    expect(row.mobile).toBe("+919876543210");
  });

  it("keeps practices apart and logs every read (EMR-02, EMR-06)", async () => {
    const id = await emr.createPatient(a.practitionerId, owner, emr.PatientSchema.parse({ fullName: "Rahul Verma" }), true);
    expect(await emr.getPatient(b.practitionerId, other, id)).toBeNull();
    expect((await emr.listPatients(b.practitionerId)).some((x) => x.id === id)).toBe(false);
    expect(await emr.getPatient(a.practitionerId, owner, id)).not.toBeNull();
    const [{ n }] = await q<{ n: number }>(`SELECT count(*)::int AS n FROM audit_events WHERE action = 'patient.view' AND object_id = $1`, [id]);
    expect(n).toBe(1);
    expect((await emr.listPatients(a.practitionerId, { q: "rahul" })).map((x) => x.id)).toContain(id);
    await emr.setPatientArchived(a.practitionerId, owner, id, true);
    expect((await emr.listPatients(a.practitionerId)).some((x) => x.id === id)).toBe(false);
    expect((await emr.listPatients(a.practitionerId, { archived: true })).some((x) => x.id === id)).toBe(true);
  });

  it("notes: author-only edits within 24 h, then locked (EMR-03)", async () => {
    const pid = await emr.createPatient(a.practitionerId, owner, emr.PatientSchema.parse({ fullName: "Meena S" }), true);
    const input = emr.VisitSchema.parse({ visitOn: today(), kind: "assessment", chiefComplaint: "Knee pain on stairs", painScore: 6, nextVisitOn: today() });
    const vid = await emr.addVisit(a.practitionerId, owner, pid, input);
    await emr.updateVisit(a.practitionerId, owner, vid, { ...input, diagnosis: "Patellofemoral pain" });
    expect(code(await emr.updateVisit(a.practitionerId, other, vid, input).catch((e) => e))).toBe("CONFLICT");
    await q(`UPDATE patient_visits SET created_at = now() - interval '25 hours' WHERE id = $1`, [vid]);
    expect(code(await emr.updateVisit(a.practitionerId, owner, vid, input).catch((e) => e))).toBe("CONFLICT");
    expect(code(await emr.addVisit(b.practitionerId, other, pid, input).catch((e) => e))).toBe("CONFLICT"); // b has no terms yet
    expect(() => emr.VisitSchema.parse({ visitOn: today(), kind: "follow_up" })).toThrow(/at least one part/);
    const visits = await emr.listVisits(a.practitionerId, owner, pid);
    expect(visits[0].diagnosis).toBe("Patellofemoral pain");
    expect(visits[0].editable).toBe(false);
  });

  it("links plans and packages to the timeline, only within the practice (EMR-04, EMR-05)", async () => {
    const pid = await emr.createPatient(a.practitionerId, owner, emr.PatientSchema.parse({ fullName: "Kiran Rao" }), true);
    const [ex] = await q<{ id: string }>(`SELECT id FROM exercises WHERE code = 'knee-quad-set'`);
    const { token } = await hep.createPlan(a.practitionerId, owner, { patientLabel: "Kiran", practicePatientId: pid, title: "Knee week 1", items: [{ exerciseId: ex.id }] });
    await hep.recordCheckin(token, 3);
    const t = await pkg.createTemplate(a.practitionerId, owner, { name: "Knee — 5", sessions: 5, pricePaise: 500_000, validityDays: 30 });
    const sale = await pkg.sellPackage(a.practitionerId, owner, { templateId: t, patientLabel: "Kiran", practicePatientId: pid, paidPaise: 200_000, paymentMode: "upi", startsOn: today() });
    await pkg.recordSessionUse(a.practitionerId, owner, sale, today());
    await emr.addVisit(a.practitionerId, owner, pid, emr.VisitSchema.parse({ visitOn: today(), kind: "follow_up", treatmentGiven: "Quads strengthening" }));
    const kinds = (await emr.patientTimeline(a.practitionerId, pid)).map((e) => e.kind).sort();
    expect(kinds).toEqual(["package", "payment", "plan", "session", "session", "visit"]);
    expect(code(await hep.createPlan(b.practitionerId, other, { patientLabel: "X", practicePatientId: pid, title: "Cross practice", items: [{ exerciseId: ex.id }] }).catch((e) => e))).toBe("INVALID_INPUT");
    expect(await emr.patientFirstName(a.practitionerId, pid)).toBe("Kiran");
    expect(await emr.patientFirstName(b.practitionerId, pid)).toBeNull();
  });
});
