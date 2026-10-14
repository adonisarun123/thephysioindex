import { NextResponse, type NextRequest } from "next/server";

/**
 * Request proxy: forwards the pathname to server components for navigation
 * state and applies no-store on private areas. Authorisation is NOT done
 * here; every page and action calls requireViewer/requireStaff (IAM-01).
 */
export function proxy(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", request.nextUrl.pathname);
  const res = NextResponse.next({ request: { headers: requestHeaders } });
  if (/^\/(admin|workspace|account|api\/v1\/(me|workspace|admin))/.test(request.nextUrl.pathname)) {
    res.headers.set("Cache-Control", "no-store");
  }
  return res;
}

export const config = { matcher: ["/((?!_next/|favicon.ico|.*\\..*).*)"] };
