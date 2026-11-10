import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api";
import { closeFixtures, configureTestDatabase, makePractitioner, q, TEST_DB, type Fixture } from "./helpers/booking-fixture";

/** Patient documents (addendum EMR-07): type sniffing, size limit, scoping, audited reads, delete removes bytes. */

configureTestDatabase();
process.env.BETTER_AUTH_SECRET ??= "test-secret-for-vitest-only-0123456789";
process.env.STORAGE_LOCAL_DIR = mkdtempSync(join(tmpdir(), "tpi-docs-"));
const docs = await import("@/lib/practice/documents");
const emr = await import("@/lib/practice/patients");
const { privateStorage } = await import("@/lib/storage");

const code = (e: unknown) => (e instanceof ApiError ? e.code : `UNEXPECTED: ${(e as Error)?.message}`);
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF");
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(16)]);

describe("type sniffing (pure)", () => {
  it("accepts PDF/JPEG/PNG/WebP by content and rejects the rest", () => {
    expect(docs.sniffMime(PDF)).toBe("application/pdf");
    expect(docs.sniffMime(PNG)).toBe("image/png");
    expect(docs.sniffMime(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]))).toBe("image/jpeg");
    expect(docs.sniffMime(Buffer.from("RIFF\0\0\0\0WEBPVP8 "))).toBe("image/webp");
    expect(docs.sniffMime(Buffer.from("<html><script>alert(1)</script>"))).toBeNull();
    expect(docs.sniffMime(Buffer.from("MZ\x90\x00"))).toBeNull();
  });
});

describe.skipIf(!TEST_DB)("patient documents on PostgreSQL + local storage", () => {
  let a: Fixture;
  let b: Fixture;
  let owner: string;
  let patientId: string;

  beforeAll(async () => {
    a = await makePractitioner();
    b = await makePractitioner();
    const [u] = await q<{ id: string }>(`INSERT INTO users (auth_subject, display_name, is_test_account) VALUES ('test-doc-' || gen_random_uuid(), 'TEST Doc', true) RETURNING id`);
    owner = u.id;
    await emr.acceptRecordsTerms(a.practitionerId, owner);
    patientId = await emr.createPatient(a.practitionerId, owner, emr.PatientSchema.parse({ fullName: "Asha K" }), true);
  });
  afterAll(async () => {
    await closeFixtures();
  });

  it("uploads, lists, opens (audited) and deletes the bytes (EMR-07)", async () => {
    const id = await docs.uploadDocument(a.practitionerId, owner, patientId, { title: "MRI knee", category: "imaging" }, { name: "mri knee (final).pdf", bytes: PDF });
    const [row] = await q<{ object_key: string; mime: string; original_name: string }>(`SELECT object_key, mime, original_name FROM patient_documents WHERE id = $1`, [id]);
    expect(row.object_key).toMatch(new RegExp(`^patients/${a.practitionerId}/${patientId}/[0-9a-f-]{36}$`));
    expect(row.object_key).not.toContain("mri");
    expect(row.mime).toBe("application/pdf");
    expect(row.original_name).toBe("mri knee _final_.pdf");
    expect((await docs.listDocuments(a.practitionerId, patientId)).map((d) => d.id)).toEqual([id]);

    expect(await docs.openDocument(b.practitionerId, owner, id)).toBeNull();
    const opened = await docs.openDocument(a.practitionerId, owner, id);
    expect(Buffer.from(opened!.body as Buffer).equals(PDF)).toBe(true);
    const [{ n }] = await q<{ n: number }>(`SELECT count(*)::int AS n FROM audit_events WHERE action = 'patient_document.view' AND object_id = $1`, [id]);
    expect(n).toBe(1);
    expect((await emr.patientTimeline(a.practitionerId, patientId)).some((e) => e.kind === "document")).toBe(true);

    expect(code(await docs.deleteDocument(b.practitionerId, owner, id).catch((e) => e))).toBe("NOT_FOUND");
    await docs.deleteDocument(a.practitionerId, owner, id);
    expect(await privateStorage()!.get(row.object_key)).toBeNull();
    expect(await docs.listDocuments(a.practitionerId, patientId)).toEqual([]);
    expect(await docs.openDocument(a.practitionerId, owner, id)).toBeNull();
  });

  it("rejects disguised, oversized and cross-practice uploads", async () => {
    const html = Buffer.from("<html><script>alert(1)</script></html>");
    expect(code(await docs.uploadDocument(a.practitionerId, owner, patientId, { title: "x", category: "other" }, { name: "scan.pdf", bytes: html }).catch((e) => e))).toBe("INVALID_INPUT");
    const big = Buffer.concat([PDF, Buffer.alloc(docs.MAX_DOCUMENT_BYTES)]);
    expect(code(await docs.uploadDocument(a.practitionerId, owner, patientId, { title: "x", category: "other" }, { name: "big.pdf", bytes: big }).catch((e) => e))).toBe("INVALID_INPUT");
    expect(code(await docs.uploadDocument(b.practitionerId, owner, patientId, { title: "x", category: "other" }, { name: "a.png", bytes: PNG }).catch((e) => e))).toBe("INVALID_INPUT");
    const [{ n }] = await q<{ n: number }>(`SELECT count(*)::int AS n FROM patient_documents WHERE patient_id = $1 AND deleted_at IS NULL`, [patientId]);
    expect(n).toBe(0);
  });
});
