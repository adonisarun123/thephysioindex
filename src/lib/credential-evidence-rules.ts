/**
 * Rules for credential certificates (VER-02) that hold no secrets and touch
 * no server resources, so forms, actions and tests can share them.
 */

export const MAX_EVIDENCE_BYTES = 4 * 1024 * 1024;
export const EVIDENCE_ACCEPT = "application/pdf,image/jpeg,image/png,image/webp";

export type EvidenceMime = "application/pdf" | "image/jpeg" | "image/png" | "image/webp";
export const EVIDENCE_EXT: Record<EvidenceMime, string> = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

/** A practitioner may add or replace a certificate only until a reviewer has acted on the credential; staff always may. */
const PRACTITIONER_EDITABLE = ["self_declared", "pending"];
export const evidenceEditableBy = (status: string, byStaff: boolean) => byStaff || PRACTITIONER_EDITABLE.includes(status);

/** File type from the file's own bytes, never its name. Returns null for anything we do not accept. */
export function sniffEvidenceMime(b: Uint8Array): EvidenceMime | null {
  const ascii = (from: number, to: number) => String.fromCharCode(...b.subarray(from, to));
  if (b.length >= 5 && ascii(0, 5) === "%PDF-") return "application/pdf";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((v, i) => b[i] === v)) return "image/png";
  if (b.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  return null;
}
