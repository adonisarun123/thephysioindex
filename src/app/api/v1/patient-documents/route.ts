import { connection } from "next/server";
import { z } from "zod";
import { ApiError, handler, parseQuery } from "@/lib/api";
import { openDocument } from "@/lib/practice/documents";
import { requirePatientAccess } from "@/lib/practice/patients";

const Query = z.object({ id: z.uuid(), download: z.enum(["1"]).optional() });

/**
 * EMR-07: streams a patient document to an authorised member of the practice.
 * Never cached; type fixed from the stored (sniffed) MIME; every read audited.
 */
export const GET = handler(async (req) => {
  await connection();
  const { id, download } = parseQuery(Query, req.url);
  const { practitioner, viewer } = await requirePatientAccess("read");
  const doc = await openDocument(practitioner.id, viewer.userId, id);
  if (!doc) throw new ApiError("NOT_FOUND", "Document not found");
  const name = doc.filename.replace(/["\\\r\n]/g, "_");
  return new Response(doc.body as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": doc.mime,
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${name}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "X-Robots-Tag": "noindex",
    },
  });
});
