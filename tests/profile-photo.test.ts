import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { imageKitEnabled, photoUrl, practitionerFolder, uploadAuth } from "@/lib/media/imagekit";
import { completionPercent, profileChecklist } from "@/lib/workspace/completion";

const ENV = { ...process.env };
afterEach(() => {
  process.env = { ...ENV };
});

function configure() {
  process.env.IMAGEKIT_PUBLIC_KEY = "public_test";
  process.env.IMAGEKIT_PRIVATE_KEY = "private_test";
  process.env.NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT = "https://ik.imagekit.io/tpi/";
}

describe("ImageKit profile photos (PRO-12)", () => {
  it("is off until all three settings exist", () => {
    delete process.env.IMAGEKIT_PRIVATE_KEY;
    expect(imageKitEnabled()).toBe(false);
    configure();
    expect(imageKitEnabled()).toBe(true);
  });

  it("signs uploads the way ImageKit verifies them (HMAC-SHA1 of token + expire)", () => {
    configure();
    const a = uploadAuth();
    expect(a.publicKey).toBe("public_test");
    expect(a.expire).toBeGreaterThan(Date.now() / 1000);
    expect(a.signature).toBe(createHmac("sha1", "private_test").update(a.token + String(a.expire)).digest("hex"));
  });

  it("keeps each practitioner in their own folder, with test data apart from production", () => {
    process.env.VERCEL_ENV = "production";
    expect(practitionerFolder("ABC123", "profile_photo")).toBe("/prod/practitioners/ABC123/profile");
    process.env.VERCEL_ENV = "preview";
    expect(practitionerFolder("ABC123", "profile_photo")).toBe("/test/practitioners/ABC123/profile");
  });

  it("builds a face-cropped square URL and nothing without an endpoint", () => {
    configure();
    expect(photoUrl("/prod/practitioners/ABC/profile/a b.jpg", 160)).toBe("https://ik.imagekit.io/tpi/tr:w-160,h-160,fo-face,q-80/prod/practitioners/ABC/profile/a%20b.jpg");
    delete process.env.NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT;
    expect(photoUrl("/x.jpg")).toBeNull();
  });
});

describe("completion with a photo item", () => {
  const done = { credentialCount: 1, branchCount: 1, clinicCount: 0, offeringCount: 1, availabilityRuleCount: 0, consents: true };
  const draft = {
    identity: { displayName: "Asha Rao", gender: "unset" as const },
    qualifications: [{ degree: "BPT", institution: "RGUHS", completionYear: null, inProgress: false }],
    about: "x".repeat(120),
    specialties: [{ specialtyId: "00000000-0000-0000-0000-000000000001", isPrimary: true }],
    languages: ["00000000-0000-0000-0000-000000000002"],
  };

  it("leaves the item out when uploads are switched off", () => {
    const items = profileChecklist(draft as never, done);
    expect(items.some((i) => i.key === "photo")).toBe(false);
    expect(completionPercent(items)).toBe(100);
  });

  it("requires a photo for 100% when uploads are on", () => {
    expect(completionPercent(profileChecklist(draft as never, { ...done, photo: false }))).toBeLessThan(100);
    expect(completionPercent(profileChecklist(draft as never, { ...done, photo: true }))).toBe(100);
  });
});
