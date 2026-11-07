import { afterAll, describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api";
import { closeFixtures, configureTestDatabase, q, TEST_DB } from "./helpers/booking-fixture";

/**
 * Lean onboarding for a home-visit physiotherapist (PRO-03 lean core, LOC-04):
 * paid-landing-page sign-up → email account → draft → home-visit area →
 * submit without fees/about → approval publishes the area → listed in search
 * and on the profile with no address, PIN or clinic page; sign-up marked onboarded.
 */

configureTestDatabase();
process.env.BETTER_AUTH_SECRET ??= "test-secret-for-vitest-only-0123456789";
const onboarding = await import("@/lib/workspace/onboarding");
const draft = await import("@/lib/workspace/draft");
const clinics = await import("@/lib/workspace/clinics");
const credentials = await import("@/lib/workspace/credentials");
const directory = await import("@/lib/directory");
const catalog = await import("@/lib/workspace/catalog");
const { decideCase } = await import("@/lib/admin/decisions");
const offerings = await import("@/lib/workspace/offerings");
const { publishOwnApprovedLocations } = await import("@/lib/admin/locations");
const { withTransaction } = await import("@/db/client");
type Viewer = Parameters<typeof decideCase>[0];

const code = (e: unknown) => (e instanceof ApiError ? e.code : `UNEXPECTED: ${(e as Error)?.message}`);

async function moderator(): Promise<Viewer> {
  const [u] = await q<{ id: string }>(`INSERT INTO users (auth_subject, display_name, is_test_account) VALUES ('test-mod-' || gen_random_uuid(), 'TEST Moderator', true) RETURNING id`);
  return { authUserId: u.id, userId: u.id, name: "TEST Moderator", email: null, mobile: null, mobileVerified: false, kind: "staff", twoFactorEnabled: true, grants: [{ role: "verification_reviewer", scopeType: "global", scopeId: null }], sessionId: "s", sessionCreatedAt: new Date() } as unknown as Viewer;
}

describe.skipIf(!TEST_DB)("home-visit onboarding on PostgreSQL", () => {
  afterAll(closeFixtures);

  it("takes a home-visit sign-up to a published listing with no address exposed", async () => {
    const email = `test-hv-${Date.now()}@example.com`;
    const [au] = await q<{ id: string }>(`INSERT INTO auth."user" (name, email, email_verified, kind) VALUES ('TEST Home Visit', $1, true, 'practitioner') RETURNING id`, [email]);
    const [u] = await q<{ id: string }>(`INSERT INTO users (auth_subject, display_name, is_test_account) VALUES ($1, 'TEST Home Visit', true) RETURNING id`, [au.id]);
    await q(`INSERT INTO practitioner_signups (reference, full_name, mobile, email, city, practice_type) VALUES ($1, 'TEST Home Visit', '+919000000001', $2, 'Chennai', 'home_visits')`, [`t${Date.now().toString(36).slice(-7)}`, email]);

    const pid = await onboarding.createPractitioner(u.id, { displayName: "TEST Home Visit", designation: "Physiotherapist", headline: "", gender: "unset" });
    await q(`UPDATE practitioners SET is_test_account = true WHERE id = $1`, [pid]);
    await draft.saveDraftSection(pid, u.id, "qualifications", [{ degree: "BPT", institution: "TEST University", completionYear: 2020, inProgress: false }]);
    const [auth] = await q<{ id: string }>(`SELECT id FROM credential_authorities WHERE active ORDER BY name LIMIT 1`);
    await credentials.addCredential(pid, u.id, { authorityId: auth.id, number: `TEST-${Date.now()}` }, { openReviewCase: false });

    const [loc] = await q<{ locality_id: string; city_id: string; state_id: string; city_slug: string }>(`
      SELECT l.id AS locality_id, ci.id AS city_id, ci.state_id, ci.slug AS city_slug
      FROM localities l JOIN cities ci ON ci.id = l.city_id WHERE l.status = 'active' AND ci.status = 'active' ORDER BY ci.name, l.name LIMIT 1`);
    const { branchId } = await clinics.createServiceArea(pid, u.id, { stateId: loc.state_id, cityId: loc.city_id, localityId: loc.locality_id, pinCode: "600052" });
    expect(code(await clinics.createServiceArea(pid, u.id, { stateId: loc.state_id, cityId: loc.city_id, localityId: loc.locality_id, pinCode: "600052" }).catch((e) => e))).toBe("CONFLICT");

    // Nobody else can join a home-visit area, and it never shows up in clinic search.
    const other = await q<{ id: string }>(`SELECT id FROM practitioners WHERE id <> $1 LIMIT 1`, [pid]);
    if (other[0]) expect(code(await clinics.joinBranch(other[0].id, u.id, branchId).catch((e) => e))).toBe("NOT_FOUND");
    expect((await catalog.searchBranches("TEST Home Visit")).some((h) => h.branchId === branchId)).toBe(false);

    // A service at a home-visit area is a home visit (enquiry-only in R1), never an instant clinic booking.
    const [assoc] = await q<{ id: string }>(`SELECT id FROM practitioner_branches WHERE branch_id = $1`, [branchId]);
    const [svc] = await catalog.listServiceOptions();
    const defaults = await catalog.offeringDefaults();
    const offeringId = await offerings.createOffering(pid, u.id, assoc.id, {
      serviceId: svc.id, displayName: "TEST Home assessment", description: "", basePricePaise: 80000, taxPaise: 0, extraChargesPaise: 0, priceNote: "",
      durationMin: defaults.durationMin, intervalMin: defaults.intervalMin, bufferBeforeMin: defaults.bufferBeforeMin, bufferAfterMin: defaults.bufferAfterMin,
      minNoticeMin: defaults.minNoticeMin, bookingHorizonDays: defaults.horizonDays,
    });
    const [off] = await q<{ mode: string }>(`SELECT mode::text AS mode FROM offerings WHERE id = $1`, [offeringId]);
    expect(off.mode).toBe("home_visit");

    const versions = await catalog.currentPolicyVersions();
    await onboarding.recordConsents(pid, u.id, { providerTerms: versions.providerTerms, privacyNotice: versions.privacyNotice });

    const status = await onboarding.onboardingStatus(pid);
    expect(draft.validateForSubmission(status.draft, status)).toEqual([]);
    expect(draft.recommendedAdditions(status.draft, status).length).toBeGreaterThan(0);

    const caseId = await draft.submitDraft(pid, u.id, { published: false });
    await decideCase(await moderator(), { caseId, decision: "approved", reason: "TEST lean approval" });

    const [b] = await q<{ status: string; kind: string; clinic_status: string; clinic_public_id: string }>(`
      SELECT b.status, b.kind, c.status AS clinic_status, c.public_id AS clinic_public_id FROM branches b JOIN clinics c ON c.id = b.clinic_id WHERE b.id = $1`, [branchId]);
    expect(b).toMatchObject({ status: "published", kind: "service_area", clinic_status: "published" });

    const search = await directory.searchPractitioners({ citySlug: loc.city_slug, q: "TEST Home Visit", limit: 50 });
    const card = search.items.find((i) => i.id === pid);
    expect(card?.bestBranch).toMatchObject({ clinicName: "Home visits", clinicPath: null });

    const [p] = await q<{ public_id: string }>(`SELECT public_id FROM practitioners WHERE id = $1`, [pid]);
    const profile = await directory.getPublicProfile(p.public_id);
    expect(profile?.branches[0]).toMatchObject({ kind: "service_area", addressLine1: null, pinCode: null, latitude: null, clinicPath: null });
    expect(JSON.stringify(profile)).not.toContain("600052");
    expect(await directory.getPublicClinic(b.clinic_public_id)).toBeNull();

    const [s] = await q<{ status: string }>(`SELECT status FROM practitioner_signups WHERE email = $1`, [email]);
    expect(s.status).toBe("onboarded");

    // An area added after going live publishes when its association is approved (LOC-02).
    const [loc2] = await q<{ locality_id: string }>(`SELECT id AS locality_id FROM localities WHERE city_id = $1 AND id <> $2 AND status = 'active' LIMIT 1`, [loc.city_id, loc.locality_id]);
    if (loc2) {
      const later = await clinics.createServiceArea(pid, u.id, { stateId: loc.state_id, cityId: loc.city_id, localityId: loc2.locality_id, pinCode: "600053" });
      await q(`UPDATE practitioner_branches SET state = 'approved' WHERE id = $1`, [later.associationId]);
      const res = await withTransaction((_c, tx) => publishOwnApprovedLocations(tx, pid, later.associationId));
      expect(res.branches).toBe(1);
      const [b2] = await q<{ status: string }>(`SELECT status FROM branches WHERE id = $1`, [later.branchId]);
      expect(b2.status).toBe("published");
    }
  });
});
