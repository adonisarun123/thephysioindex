import { headers } from "next/headers";

/** Absolute base URL for links shown or sent from this request (production uses NEXT_PUBLIC_APP_URL; previews use their own host). */
export async function requestBaseUrl(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  if (process.env.NEXT_PUBLIC_APP_URL && process.env.VERCEL_ENV === "production") return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  return host ? `${proto}://${host}` : "http://localhost:3000";
}
