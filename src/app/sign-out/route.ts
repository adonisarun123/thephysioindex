import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";

export async function POST(req: Request) {
  await auth.api.signOut({ headers: await headers() }).catch(() => undefined);
  return NextResponse.redirect(new URL("/", req.url), { status: 303 });
}
