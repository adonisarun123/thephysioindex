import { connection } from "next/server";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { apiViewer } from "@/lib/auth/session";
import { handler, ok } from "@/lib/api";

const Body = z.object({ kind: z.enum(["patient", "practitioner"]) });

/** Records whether a signed-in user intends to act as a practitioner (drives the default workspace). */
export const POST = handler(async (req, rid) => {
  await connection();
  const v = await apiViewer();
  const { kind } = Body.parse(await req.json());
  if (v.kind === "staff") return ok({ kind: "staff" }, { requestId: rid });
  await db().execute(sql`UPDATE auth."user" SET kind = ${kind} WHERE id = ${v.authUserId}::uuid AND coalesce(kind, 'patient') <> 'staff'`);
  return ok({ kind }, { requestId: rid });
});
