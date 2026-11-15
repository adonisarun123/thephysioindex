import { describe, expect, it } from "vitest";
import { MAX_EVIDENCE_BYTES, evidenceEditableBy, sniffEvidenceMime } from "@/lib/credential-evidence-rules";

const bytes = (...b: number[]) => Uint8Array.from(b);
const text = (s: string) => Uint8Array.from(Buffer.from(s, "latin1"));

describe("credential certificates (VER-02)", () => {
  it("takes the type from the file's own bytes", () => {
    expect(sniffEvidenceMime(text("%PDF-1.7 rest"))).toBe("application/pdf");
    expect(sniffEvidenceMime(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("image/jpeg");
    expect(sniffEvidenceMime(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0))).toBe("image/png");
    expect(sniffEvidenceMime(text("RIFF0000WEBPVP8 "))).toBe("image/webp");
  });

  it("refuses anything else, whatever it is called", () => {
    expect(sniffEvidenceMime(text("<html><script>"))).toBeNull();
    expect(sniffEvidenceMime(text("PK\u0003\u0004 docx"))).toBeNull();
    expect(sniffEvidenceMime(bytes())).toBeNull();
  });

  it("lets a physiotherapist change a certificate only before review; staff always", () => {
    expect(evidenceEditableBy("self_declared", false)).toBe(true);
    expect(evidenceEditableBy("pending", false)).toBe(true);
    expect(evidenceEditableBy("registration_checked", false)).toBe(false);
    expect(evidenceEditableBy("document_reviewed", false)).toBe(false);
    expect(evidenceEditableBy("registration_checked", true)).toBe(true);
  });

  it("stays under the upload limit of the platform", () => {
    expect(MAX_EVIDENCE_BYTES).toBeLessThan(4.4 * 1024 * 1024);
  });
});
