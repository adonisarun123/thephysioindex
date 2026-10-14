import { connection } from "next/server";
import { z } from "zod";
import { handler, ok, parseQuery } from "@/lib/api";
import { searchPractitioners } from "@/lib/directory";

const Query = z.object({
  q: z.string().trim().max(80).optional(),
  state: z.string().trim().max(80).optional(),
  city: z.string().trim().max(80).optional(),
  locality: z.string().trim().max(80).optional(),
  specialty: z.string().trim().max(80).optional(),
  language: z.string().trim().max(10).optional(),
  gender: z.enum(["female", "male", "non_binary"]).optional(),
  fee_min: z.coerce.number().int().min(0).optional(), // rupees
  fee_max: z.coerce.number().int().min(0).optional(), // rupees
  verification: z.enum(["registration_checked", "document_reviewed", "any_reviewed"]).optional(),
  bookable: z.enum(["1", "true"]).optional(),
  sort: z.enum(["relevance", "fee_asc", "fee_desc"]).optional(),
  cursor: z.string().max(400).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

/** GET /api/v1/practitioners — public search (DIR-10 to DIR-13). One card per practitioner. */
export const GET = handler(async (req, rid) => {
  await connection();
  const q = parseQuery(Query, req.url);
  const result = await searchPractitioners({
    q: q.q,
    stateSlug: q.state,
    citySlug: q.city,
    localitySlug: q.locality,
    specialtySlug: q.specialty,
    languageCode: q.language,
    gender: q.gender,
    feeMinPaise: q.fee_min != null ? q.fee_min * 100 : undefined,
    feeMaxPaise: q.fee_max != null ? q.fee_max * 100 : undefined,
    verification: q.verification,
    bookable: Boolean(q.bookable),
    sort: q.sort,
    cursor: q.cursor,
    limit: q.limit,
  });
  return ok(result, { requestId: rid, cache: "public", maxAge: 60 });
});
