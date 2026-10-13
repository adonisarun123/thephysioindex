import { connection } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { languages, specialties } from "@/db/schema";
import { handler, ok } from "@/lib/api";

/** Controlled taxonomies for filters (DIR-10). */
export const GET = handler(async (_req, rid) => {
  await connection();
  const [specs, langs] = await Promise.all([
    db()
      .select({ code: specialties.code, label: specialties.label, slug: specialties.slug, description: specialties.description })
      .from(specialties)
      .where(eq(specialties.active, true))
      .orderBy(asc(specialties.sortOrder)),
    db().select({ code: languages.code, label: languages.label, nativeLabel: languages.nativeLabel }).from(languages).where(eq(languages.active, true)).orderBy(asc(languages.sortOrder)),
  ]);
  return ok({ specialties: specs, languages: langs }, { requestId: rid, cache: "public", maxAge: 3600 });
});
