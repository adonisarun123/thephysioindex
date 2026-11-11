import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import { closeFixtures, configureTestDatabase, makePractitioner, q, TEST_DB, type Fixture } from "./helpers/booking-fixture";

/**
 * Invited reviews and patient photos (owner decisions 11 Nov 2026):
 * one-use signed links, verified author, "invited" kept apart from the
 * headline rating, consent wording stored with every photo, nothing public
 * before moderation, and take-down by the uploader, the patient or staff.
 */

configureTestDatabase();
process.env.BETTER_AUTH_SECRET ??= "test-secret-for-vitest-only-0123456789";

// ImageKit is stubbed: `files` is what the image service "holds"; deletions are recorded.
const files = new Map<string, { fileId: string; filePath: string; fileType: string; mime: string | null; size: number; width: number | null; height: number | null }>();
const deleted: string[] = [];
vi.mock("@/lib/media/imagekit", async (orig) => {
  const real = await orig<typeof import("@/lib/media/imagekit")>();
  return {
    ...real,
    getFile: async (id: string) => files.get(id) ?? null,
    deleteFile: async (id: string | null | undefined) => {
      if (id) deleted.push(id);
    },
    fitUrl: (key: string | null | undefined, w = 800) => (key ? `https://ik.test/tr:w-${w}${key}` : null),
  };
});

const inv = await import("@/lib/review-invitations");
const photos = await import("@/lib/treatment-photos");
const { patientPhotoFolder, reviewPhotoFolder } = await import("@/lib/media/imagekit");
const code = (e: unknown) => (e instanceof ApiError ? e.code : `UNEXPECTED: ${(e as Error)?.message}`);
const put = (fileId: string, folder: string, over: Partial<{ fileType: string; size: number; width: number; height: number }> = {}) =>
  files.set(fileId, { fileId, filePath: `${folder}/${fileId}.jpg`, fileType: "image", mime: "image/jpeg", size: 200_000, width: 1200, height: 900, ...over });

describe("invitation tokens (pure)", () => {
  const id = "0b8f6c7e-2d3a-4f1b-9c5d-6e7f8a9b0c1d";
  it("round-trips the id, changes with the version and rejects malformed input", () => {
    const t = inv.invitationToken(id, 1);
    expect(t).toMatch(/^[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{24}$/);
    expect(inv.parseInvitationToken(t)?.id).toBe(id);
    expect(inv.invitationToken(id, 2)).not.toBe(t);
    expect(inv.parseInvitationToken("nope")).toBeNull();
  });
  it("refuses contact details in captions", () => {
    expect(photos.cleanCaption("  Balance   work <b>week 6</b> ")).toBe("Balance work week 6");
    expect(photos.cleanCaption("")).toBeNull();
    expect(() => photos.cleanCaption("Call 98450 12345")).toThrow(/phone number/);
  });
});

describe.skipIf(!TEST_DB)("invited reviews and patient photos (database)", () => {
  let f: Fixture;
  let p: { id: string; publicId: string; listingStatus: string };
  let owner: string;
  let patient: string;
  let patient2: string;
  let staff: string;
  const user = async (name: string) => (await q<{ id: string }>(`INSERT INTO users (auth_subject, display_name, is_test_account) VALUES ('test-' || gen_random_uuid(), $1, true) RETURNING id`, [name]))[0].id;
  const review = { rating: 5, text: "Clear explanations and my knee is much better now.", displayName: "Ravi K.", confirmedGenuine: true };

  beforeAll(async () => {
    f = await makePractitioner();
    [owner, patient, patient2, staff] = await Promise.all([user("TEST Owner"), user("TEST Invited Patient"), user("TEST Second Patient"), user("TEST Moderator")]);
    await q(`UPDATE practitioners SET owner_user_id = $1 WHERE id = $2`, [owner, f.practitionerId]);
    const [row] = await q<{ public_id: string }>(`SELECT public_id FROM practitioners WHERE id = $1`, [f.practitionerId]);
    p = { id: f.practitionerId, publicId: row.public_id, listingStatus: "published" };
  });
  afterAll(async () => {
    await closeFixtures();
  });

  it("creates links only for a published profile and rejects forged or foreign tokens", async () => {
    await expect(inv.createInvitation({ ...p, listingStatus: "submitted" }, owner, "Ravi")).rejects.toSatisfy((e) => code(e) === "CONFLICT");
    const { id, token } = await inv.createInvitation(p, owner, "Ravi K");
    expect((await inv.resolveInvitation(token))?.status).toBe("open");
    expect(await inv.resolveInvitation(inv.invitationToken(id, 2))).toBeNull();
    expect(await inv.resolveInvitation(`${token.slice(0, -1)}${token.endsWith("A") ? "B" : "A"}`)).toBeNull();
    await inv.revokeInvitation(p.id, owner, id);
    expect((await inv.resolveInvitation(token))?.status).toBe("cancelled");
    await expect(inv.submitInvitedReview(patient, token, review)).rejects.toSatisfy((e) => code(e) === "CONFLICT");
  });

  it("stops the practice reviewing itself", async () => {
    const { token } = await inv.createInvitation(p, owner, "Self");
    await expect(inv.submitInvitedReview(owner, token, review)).rejects.toSatisfy((e) => code(e) === "UNAUTHORISED");
  });

  it("takes one moderated review per link and per account, with the patient's photos and consent", async () => {
    const a = await inv.createInvitation(p, owner, "Ravi K");
    put("revphoto01", reviewPhotoFolder(a.id));
    put("elsewhere1", "/test/reviews/00000000-0000-0000-0000-000000000000");
    // A photo needs the consent tick, and must sit in this invitation's folder.
    await expect(inv.submitInvitedReview(patient, a.token, { ...review, photoFileIds: ["revphoto01"], photoConsent: false })).rejects.toSatisfy((e) => code(e) === "INVALID_INPUT");
    await expect(inv.submitInvitedReview(patient, a.token, { ...review, photoFileIds: ["elsewhere1"], photoConsent: true })).rejects.toSatisfy((e) => code(e) === "INVALID_INPUT");
    expect(deleted).toContain("elsewhere1");

    const reviewId = await inv.submitInvitedReview(patient, a.token, { ...review, photoFileIds: ["revphoto01"], photoConsent: true });
    const [row] = await q<{ source: string; state: string; booking_id: string | null; author_user_id: string }>(`SELECT source, state::text AS state, booking_id, author_user_id FROM reviews WHERE id = $1`, [reviewId]);
    expect(row).toEqual({ source: "invitation", state: "pending", booking_id: null, author_user_id: patient });
    const [ph] = await q<{ kind: string; state: string; consent_basis: string; consent_statement: string }>(`SELECT kind, state::text AS state, consent_basis, consent_statement FROM treatment_photos WHERE review_id = $1`, [reviewId]);
    expect(ph).toEqual({ kind: "review", state: "pending", consent_basis: "patient_own", consent_statement: photos.PATIENT_CONSENT_STATEMENT });
    const [cs] = await q<{ n: string }>(`SELECT count(*) AS n FROM verification_cases WHERE subject_type = 'review' AND subject_id = $1 AND state = 'open'`, [reviewId]);
    expect(Number(cs.n)).toBe(1);

    // The link is spent; a second link does not let the same account review twice.
    await expect(inv.submitInvitedReview(patient2, a.token, review)).rejects.toSatisfy((e) => code(e) === "CONFLICT");
    const b = await inv.createInvitation(p, owner, "Ravi again");
    await expect(inv.submitInvitedReview(patient, b.token, review)).rejects.toSatisfy((e) => code(e) === "CONFLICT");

    // Not public, and not in the headline rating, before or after moderation.
    const { getPublicProfile } = await import("@/lib/directory");
    expect((await getPublicProfile(p.publicId))?.reviews).toEqual([]);
    const { withTransaction } = await import("@/db/client");
    const { recalcReviews } = await import("@/lib/admin/practitioner-ops");
    await withTransaction(async (_c, tx) => {
      await tx.execute((await import("drizzle-orm")).sql`UPDATE reviews SET state = 'published', published_at = now() WHERE id = ${reviewId}`);
      await photos.setReviewPhotosState(tx, reviewId, "approved", staff);
      await recalcReviews(tx, p.id);
    });
    const pub = await getPublicProfile(p.publicId);
    expect(pub?.reviewCount).toBe(0);
    expect(pub?.ratingAvgX100).toBeNull();
    expect(pub?.reviews).toHaveLength(1);
    expect(pub?.reviews[0]).toMatchObject({ source: "invitation", displayName: "Ravi K." });
    expect(pub?.reviews[0].photos).toHaveLength(1);

    // The patient removes a photo, then the whole review; the files are deleted from the image service.
    const own = await inv.getOwnInvitedReview(patient, p.id);
    await expect(inv.removeOwnReviewPhoto(patient2, own!.photos[0].id)).rejects.toSatisfy((e) => code(e) === "NOT_FOUND");
    await inv.removeOwnReviewPhoto(patient, own!.photos[0].id);
    expect(deleted).toContain("revphoto01");
    expect((await getPublicProfile(p.publicId))?.reviews[0].photos).toEqual([]);
    await inv.withdrawInvitedReview(patient, reviewId);
    expect((await getPublicProfile(p.publicId))?.reviews).toEqual([]);
  });

  it("records the physiotherapist's consent declaration and shows a gallery photo only after approval", async () => {
    const folder = patientPhotoFolder(p.publicId);
    put("gallery001", folder);
    put("gallerybig", folder, { size: 9_000_000 });
    put("notanimage", folder, { fileType: "non-image" });
    await expect(photos.addPractitionerPhoto(p, owner, { fileId: "gallery001", consentDeclared: false })).rejects.toSatisfy((e) => code(e) === "INVALID_INPUT");
    await expect(photos.addPractitionerPhoto({ ...p, listingStatus: "draft" }, owner, { fileId: "gallery001", consentDeclared: true })).rejects.toSatisfy((e) => code(e) === "CONFLICT");
    await expect(photos.addPractitionerPhoto(p, owner, { fileId: "gallerybig", consentDeclared: true })).rejects.toSatisfy((e) => code(e) === "INVALID_INPUT");
    await expect(photos.addPractitionerPhoto(p, owner, { fileId: "notanimage", consentDeclared: true })).rejects.toSatisfy((e) => code(e) === "INVALID_INPUT");
    expect(deleted).toEqual(expect.arrayContaining(["gallerybig", "notanimage"]));

    const id = await photos.addPractitionerPhoto(p, owner, { fileId: "gallery001", caption: "Balance training", consentDeclared: true });
    const [row] = await q<{ state: string; consent_basis: string; consent_statement: string; uploaded_by_user_id: string }>(`SELECT state::text AS state, consent_basis, consent_statement, uploaded_by_user_id FROM treatment_photos WHERE id = $1`, [id]);
    expect(row).toEqual({ state: "pending", consent_basis: "practitioner_declared", consent_statement: photos.PRACTITIONER_CONSENT_STATEMENT, uploaded_by_user_id: owner });
    expect(await photos.listPublicPhotos(p.id)).toEqual([]);
    expect((await photos.listPhotosForModeration("pending")).some((x) => x.id === id)).toBe(true);

    await expect(photos.decidePhoto({ userId: staff, role: "verification_reviewer" }, id, "reject", "")).rejects.toSatisfy((e) => code(e) === "INVALID_INPUT");
    await photos.decidePhoto({ userId: staff, role: "verification_reviewer" }, id, "approve", null);
    expect((await photos.listPublicPhotos(p.id)).map((x) => x.caption)).toEqual(["Balance training"]);
    await expect(photos.decidePhoto({ userId: staff, role: "verification_reviewer" }, id, "approve", null)).rejects.toSatisfy((e) => code(e) === "CONFLICT");

    // Staff take-down is immediate and deletes the file.
    await photos.staffRemovePhoto({ userId: staff, role: "verification_reviewer" }, id, "The patient asked for removal");
    expect(await photos.listPublicPhotos(p.id)).toEqual([]);
    expect(deleted).toContain("gallery001");
    const [audit] = await q<{ n: string }>(`SELECT count(*) AS n FROM audit_events WHERE object_type = 'treatment_photo' AND object_id = $1`, [id]);
    expect(Number(audit.n)).toBe(3);
  });

  it("caps the gallery", async () => {
    const folder = patientPhotoFolder(p.publicId);
    for (let i = 0; i < photos.MAX_GALLERY_PHOTOS; i++) {
      put(`capphoto${String(i).padStart(2, "0")}`, folder);
      await photos.addPractitionerPhoto(p, owner, { fileId: `capphoto${String(i).padStart(2, "0")}`, consentDeclared: true });
    }
    put("capphotoXX", folder);
    await expect(photos.addPractitionerPhoto(p, owner, { fileId: "capphotoXX", consentDeclared: true })).rejects.toSatisfy((e) => code(e) === "CONFLICT");
    const mine = await photos.listOwnPhotos(p.id);
    await photos.removeOwnPhoto(p.id, owner, mine[0].id);
    await expect(photos.removeOwnPhoto(p.id, owner, mine[0].id)).rejects.toSatisfy((e) => code(e) === "NOT_FOUND");
  });
});
