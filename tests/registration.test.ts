import { afterAll, describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api";
import { closeFixtures, configureTestDatabase, q, TEST_DB } from "./helpers/booking-fixture";

/**
 * One-screen registration (PRO-02, PRO-03; owner decision 7 Nov 2026):
 * verified email → draft profile with qualification, registration, location
 * and consents in one call → completion meter shows what is left → submission
 * stays blocked until 100%.
 */

configureTestDatabase();
process.env.BETTER_AUTH_SECRET ??= "test-secret-for-vitest-only-0123456789";
const { RegistrationSchema, registerPractitioner } = await import("@/lib/workspace/registration");
const onboarding = await import("@/lib/workspace/onboarding");
const draft = await import("@/lib/workspace/draft");
const { profileChecklist, completionPercent } = await import("@/lib/workspace/completion");
const { finishProfile } = await import("@/lib/workspace/finish");
const catalog = await import("@/lib/workspace/catalog");

const code = (e: unknown) => (e instanceof ApiError ? e.code : `UNEXPECTED: ${(e as Error)?.message}`);

async function account(label: string) {
  const email = `test-reg-${label}-${Date.now()}@example.com`;
  const [au] = await q<{ id: string }>(`INSERT INTO auth."user" (name, email, email_verified, kind) VALUES ('TEST Reg', $1, true, 'patient') RETURNING id`, [email]);
  const [u] = await q<{ id: string }>(`INSERT INTO users (auth_subject, display_name, email, is_test_account) VALUES ($1, 'TEST Reg', $2, true) RETURNING id`, [au.id, email]);
  return { userId: u.id, email };
}

async function place() {
  const [p] = await q<{ locality_id: string; city_id: string; state_id: string }>(`
    SELECT l.id AS locality_id, ci.id AS city_id, ci.state_id
    FROM localities l JOIN cities ci ON ci.id = l.city_id WHERE l.status = 'active' AND ci.status = 'active' ORDER BY ci.name, l.name LIMIT 1`);
  const [a] = await q<{ id: string }>(`SELECT id FROM credential_authorities WHERE active ORDER BY name LIMIT 1`);
  return { ...p, authorityId: a.id };
}

function input(p: Awaited<ReturnType<typeof place>>, over: Record<string, unknown> = {}) {
  return RegistrationSchema.parse({
    fullName: "TEST Registrant",
    mobile: `98${String(Date.now()).slice(-8)}`,
    degree: "BPT",
    institution: "TEST University",
    authorityId: p.authorityId,
    registrationNumber: `TEST-${Date.now()}`,
    practiceMode: "clinic_owner",
    clinicName: "TEST Spine Clinic",
    addressLine1: "12 Test Road",
    stateId: p.state_id,
    cityId: p.city_id,
    localityId: p.locality_id,
    pinCode: "560034",
    consentTerms: true,
    consentContact: true,
    ...over,
  });
}

describe("registration validation", () => {
  it("requires the registration number, clinic address for clinics, and both consents", () => {
    const base = { fullName: "A B", mobile: "9800000000", degree: "BPT", institution: "X Y", authorityId: "00000000-0000-4000-8000-000000000001", registrationNumber: "R1", practiceMode: "clinic_owner", stateId: "00000000-0000-4000-8000-000000000002", cityId: "00000000-0000-4000-8000-000000000003", localityId: "00000000-0000-4000-8000-000000000004", pinCode: "560034", consentTerms: true, consentContact: true };
    expect(RegistrationSchema.safeParse({ ...base, clinicName: "C", addressLine1: "Road" }).success).toBe(false); // clinic name too short
    expect(RegistrationSchema.safeParse({ ...base, clinicName: "Clinic", addressLine1: "12 Road" }).success).toBe(true);
    expect(RegistrationSchema.safeParse({ ...base, practiceMode: "home_visits" }).success).toBe(true);
    expect(RegistrationSchema.safeParse({ ...base, practiceMode: "home_visits", registrationNumber: "" }).success).toBe(false);
    expect(RegistrationSchema.safeParse({ ...base, practiceMode: "home_visits", consentTerms: false }).success).toBe(false);
    expect(RegistrationSchema.safeParse({ ...base, practiceMode: "home_visits", localityId: "__new" }).success).toBe(false);
    expect(RegistrationSchema.safeParse({ ...base, practiceMode: "home_visits", localityId: "__new", newLocalityName: "New Area" }).success).toBe(true);
  });
});

describe.skipIf(!TEST_DB)("registration on PostgreSQL", () => {
  afterAll(closeFixtures);

  it("creates a draft clinic profile at 44% and blocks submission until 100%", async () => {
    const who = await account("clinic");
    const p = await place();
    const { practitionerId, reference } = await registerPractitioner(who, input(p), { utm_source: "google" });
    await q(`UPDATE practitioners SET is_test_account = true WHERE id = $1`, [practitionerId]);

    const [pr] = await q<{ listing_status: string; display_name: string }>(`SELECT listing_status::text, display_name FROM practitioners WHERE id = $1`, [practitionerId]);
    expect(pr).toEqual({ listing_status: "draft", display_name: "TEST Registrant" });
    const [kind] = await q<{ kind: string }>(`SELECT kind FROM auth."user" au JOIN users u ON u.auth_subject = au.id::text WHERE u.id = $1`, [who.userId]);
    expect(kind.kind).toBe("practitioner");
    const [u] = await q<{ mobile: string | null; mobile_verified_at: Date | null }>(`SELECT mobile, mobile_verified_at FROM users WHERE id = $1`, [who.userId]);
    expect(u.mobile).toMatch(/^\+9198/);
    expect(u.mobile_verified_at).toBeNull();
    const [s] = await q<{ status: string; practice_type: string; attribution: Record<string, string> }>(`SELECT status, practice_type, attribution FROM practitioner_signups WHERE reference = $1`, [reference]);
    expect(s).toMatchObject({ status: "onboarding", practice_type: "clinic_owner", attribution: { utm_source: "google" } });

    const status = await onboarding.onboardingStatus(practitionerId);
    expect(status).toMatchObject({ credentialCount: 1, branchCount: 1, clinicCount: 1, consents: true });
    const items = profileChecklist(status.draft, status);
    expect(items.filter((i) => i.done).map((i) => i.key)).toEqual(["basics", "registration", "practice", "consent"]);
    expect(completionPercent(items)).toBe(44);
    expect(draft.validateForSubmission(status.draft, status)).toHaveLength(5);

    // A second registration from the same account is refused.
    expect(code(await registerPractitioner(who, input(p), {}).catch((e) => e))).toBe("CONFLICT");
  });

  it("registers a home-visit physio with a private service area and no hours requirement", async () => {
    const who = await account("hv");
    const p = await place();
    const { practitionerId } = await registerPractitioner(who, input(p, { practiceMode: "home_visits", clinicName: undefined, addressLine1: undefined }), {});
    await q(`UPDATE practitioners SET is_test_account = true WHERE id = $1`, [practitionerId]);
    const status = await onboarding.onboardingStatus(practitionerId);
    expect(status.clinicCount).toBe(0);
    expect(profileChecklist(status.draft, status).some((i) => i.key === "hours")).toBe(false);
    const [b] = await q<{ kind: string }>(`SELECT b.kind FROM practitioner_branches pb JOIN branches b ON b.id = pb.branch_id WHERE pb.practitioner_id = $1`, [practitionerId]);
    expect(b.kind).toBe("service_area");
  });

  it("creates nothing when the city is not in the chosen state", async () => {
    const who = await account("bad");
    const p = await place();
    const [other] = await q<{ id: string }>(`SELECT id FROM states WHERE id <> $1 LIMIT 1`, [p.state_id]);
    expect(code(await registerPractitioner(who, input(p, { stateId: other.id }), {}).catch((e) => e))).toBe("INVALID_INPUT");
    const rows = await q(`SELECT 1 FROM practitioners WHERE owner_user_id = $1`, [who.userId]);
    expect(rows).toHaveLength(0);
  });

  it("finishes a clinic profile on one screen: 44% → 100% → submitted for verification", async () => {
    const who = await account("finish");
    const p = await place();
    const { practitionerId } = await registerPractitioner(who, input(p), {});
    await q(`UPDATE practitioners SET is_test_account = true WHERE id = $1`, [practitionerId]);
    const [spec] = await catalog.listSpecialtyOptions();
    const langs = await catalog.listLanguageOptions();
    const [svc] = await catalog.listServiceOptions();

    const res = await finishProfile(practitionerId, who.userId, "draft", {
      about: "TEST physiotherapist at a neighbourhood clinic. I assess each patient carefully and build a clear treatment and home exercise plan.",
      primarySpecialtyId: spec.id,
      languageIds: [langs[0].id],
      service: { serviceId: svc.id, displayName: svc.label, feePaise: 60000 },
      hours: { weekdays: [1, 2, 3, 4, 5, 6], localStart: "10:00", localEnd: "19:00" },
      submit: true,
    });
    expect(res).toEqual({ percent: 100, submitted: true, gaps: [] });
    const [v] = await q<{ state: string }>(`SELECT state::text FROM profile_versions WHERE practitioner_id = $1 ORDER BY version DESC LIMIT 1`, [practitionerId]);
    expect(v.state).not.toBe("draft");
    const rules = await q(`SELECT 1 FROM availability_rules r JOIN calendar_resources cr ON cr.id = r.resource_id WHERE cr.practitioner_id = $1`, [practitionerId]);
    expect(rules).toHaveLength(6);
    const [o] = await q<{ base_price_paise: number }>(`SELECT ov.base_price_paise FROM offerings o JOIN offering_versions ov ON ov.id = o.current_version_id WHERE o.practitioner_id = $1`, [practitionerId]);
    expect(Number(o.base_price_paise)).toBe(60000);

    // Running it again changes nothing and does not submit twice.
    const again = await finishProfile(practitionerId, who.userId, "draft", { submit: true });
    expect(again.submitted).toBe(false);
  });

  it("saves partial input and reports what is left instead of submitting", async () => {
    const who = await account("partial");
    const p = await place();
    const { practitionerId } = await registerPractitioner(who, input(p, { practiceMode: "home_visits", clinicName: undefined, addressLine1: undefined }), {});
    await q(`UPDATE practitioners SET is_test_account = true WHERE id = $1`, [practitionerId]);
    const res = await finishProfile(practitionerId, who.userId, "draft", { about: "x".repeat(120), submit: true });
    expect(res.submitted).toBe(false);
    expect(res.percent).toBe(63);
    expect(res.gaps).toHaveLength(3);
  });
});
