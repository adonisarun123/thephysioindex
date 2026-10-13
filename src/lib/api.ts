import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";

/** Stable machine error codes (API-04, API-06). */
export type ErrorCode =
  | "INVALID_INPUT"
  | "UNAUTHENTICATED"
  | "UNAUTHORISED"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "DEPENDENCY_UNAVAILABLE"
  | "SLOT_UNAVAILABLE"
  | "HOLD_EXPIRED"
  | "OFFER_INELIGIBLE"
  | "OFFER_LIMIT_REACHED"
  | "PRICE_CHANGED"
  | "PROFILE_NOT_BOOKABLE"
  | "POLICY_CUTOFF_PASSED"
  | "VERSION_CONFLICT"
  | "FEATURE_DISABLED"
  | "INTERNAL";

const STATUS: Record<ErrorCode, number> = {
  INVALID_INPUT: 400,
  UNAUTHENTICATED: 401,
  UNAUTHORISED: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  DEPENDENCY_UNAVAILABLE: 503,
  SLOT_UNAVAILABLE: 409,
  HOLD_EXPIRED: 409,
  OFFER_INELIGIBLE: 422,
  OFFER_LIMIT_REACHED: 409,
  PRICE_CHANGED: 409,
  PROFILE_NOT_BOOKABLE: 422,
  POLICY_CUTOFF_PASSED: 422,
  VERSION_CONFLICT: 409,
  FEATURE_DISABLED: 403,
  INTERNAL: 500,
};

export class ApiError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export function requestId(req: Request): string {
  return req.headers.get("x-request-id") ?? randomUUID();
}

const PRIVATE_HEADERS = { "Cache-Control": "no-store" } as const;

/** JSON success. Public responses may be cached briefly by the caller; private ones are no-store (API-03). */
export function ok<T>(data: T, init: { status?: number; requestId: string; cache?: "public" | "private"; maxAge?: number }) {
  const headers: Record<string, string> = { "x-request-id": init.requestId };
  if (init.cache === "public") {
    headers["Cache-Control"] = `public, s-maxage=${init.maxAge ?? 60}, stale-while-revalidate=${(init.maxAge ?? 60) * 5}`;
  } else {
    Object.assign(headers, PRIVATE_HEADERS);
  }
  return NextResponse.json(data, { status: init.status ?? 200, headers });
}

export function fail(err: unknown, rid: string) {
  if (err instanceof ApiError) {
    return NextResponse.json(
      { error: { code: err.code, message: err.message, details: err.details ?? undefined }, requestId: rid },
      { status: STATUS[err.code], headers: { ...PRIVATE_HEADERS, "x-request-id": rid } },
    );
  }
  if (err instanceof ZodError) {
    return NextResponse.json(
      { error: { code: "INVALID_INPUT", message: "Request validation failed", details: err.issues }, requestId: rid },
      { status: 400, headers: { ...PRIVATE_HEADERS, "x-request-id": rid } },
    );
  }
  // Never leak raw exception messages (API-07).
  console.error(`[api] ${rid}`, err);
  const message = isDbUnavailable(err) ? "The booking database is unavailable. Please try again shortly." : "Something went wrong.";
  const code: ErrorCode = isDbUnavailable(err) ? "DEPENDENCY_UNAVAILABLE" : "INTERNAL";
  return NextResponse.json(
    { error: { code, message }, requestId: rid },
    { status: STATUS[code], headers: { ...PRIVATE_HEADERS, "x-request-id": rid } },
  );
}

function isDbUnavailable(err: unknown): boolean {
  const e = err as { code?: string; message?: string };
  return (
    e?.code === "ECONNREFUSED" ||
    e?.code === "ENOTFOUND" ||
    e?.code === "ETIMEDOUT" ||
    e?.code === "57P01" ||
    /DATABASE_URL is not set|timeout exceeded when trying to connect/i.test(e?.message ?? "")
  );
}

export function parseQuery<T>(schema: ZodType<T>, url: string): T {
  const params = Object.fromEntries(new URL(url).searchParams.entries());
  return schema.parse(params);
}

/** Wraps a handler with request id, error mapping and the dynamic-rendering opt-in. */
export function handler(fn: (req: Request, rid: string) => Promise<Response>) {
  return async (req: Request) => {
    const rid = requestId(req);
    try {
      return await fn(req, rid);
    } catch (err) {
      return fail(err, rid);
    }
  };
}
