import { connection } from "next/server";
import { z } from "zod";
import { ApiError, handler, parseQuery } from "@/lib/api";
import { apiViewer, canManagePractitioner, hasRole, mfaRequired } from "@/lib/auth/session";
import { openEvidence } from "@/lib/credential-evidence";

const Query = z.object({ id: z.uuid(), download: z.enum(["1"]).optional() });

/**
 * VER-02 / DAT-02: streams the certificate behind a credential to the
 * profile's own managers or to verification staff. Never cached, never
 * public; type fixed from the stored (sniffed) MIME; every read audited.
 * `id` is the credential id, so a replaced document is never reachable.
 */
export const GET = handler(async (req) => {
  await connection();
  const { id, download } = parseQuery(Query, req.url);
  const viewer = await apiViewer();
  const doc = await openEvidence(id, async (practitionerId) => {
    const asStaff = hasRole(viewer, "verification_reviewer") && (!mfaRequired() || viewer.twoFactorEnabled);
    return asStaff || (await canManagePractitioner(viewer, practitionerId)) ? { userId: viewer.userId, asStaff } : null;
  });
  if (!doc) throw new ApiError("NOT_FOUND", "Document not found");
  return new Response(doc.body as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": doc.mime,
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${doc.filename}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "X-Robots-Tag": "noindex",
    },
  });
});
