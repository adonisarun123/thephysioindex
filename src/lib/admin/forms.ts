import { redirect, unstable_rethrow } from "next/navigation";
import { z, ZodError, type ZodType } from "zod";
import { ApiError } from "@/lib/api";
import { recentlyAuthenticated, type Viewer } from "@/lib/auth/session";

/**
 * Server-action plumbing for the admin area. Forms are server-rendered and
 * post to server actions; outcomes travel back as `notice` / `error` query
 * parameters so pages stay progressive-enhancement friendly.
 */

export type FormObject = Record<string, string | string[]>;

/** FormData → plain object. Repeated keys (checkbox lists) become arrays; files are ignored. */
export function formToObject(fd: FormData): FormObject {
  const out: FormObject = {};
  for (const [k, v] of fd.entries()) {
    if (typeof v !== "string") continue;
    const existing = out[k];
    if (existing === undefined) out[k] = v;
    else if (Array.isArray(existing)) existing.push(v);
    else out[k] = [existing, v];
  }
  return out;
}

export function parseForm<T>(schema: ZodType<T>, fd: FormData): T {
  try {
    return schema.parse(formToObject(fd));
  } catch (err) {
    if (err instanceof ZodError) {
      const msg = err.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; ");
      throw new ApiError("INVALID_INPUT", msg, err.issues);
    }
    throw err;
  }
}

/** Multi-valued form field as string array, whether one or many were sent. */
export function list(v: string | string[] | undefined): string[] {
  if (v === undefined) return [];
  return Array.isArray(v) ? v : [v];
}

export function withQuery(path: string, params: Record<string, string | undefined>): string {
  const [base, existing] = path.split("?");
  const sp = new URLSearchParams(existing ?? "");
  sp.delete("notice");
  sp.delete("error");
  for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
  const s = sp.toString();
  return s ? `${base}?${s}` : base;
}

export function messageOf(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  const e = err as { code?: string; constraint?: string; message?: string; detail?: string };
  if (e?.code === "23505") return `Already exists (${e.constraint ?? "unique constraint"}).`;
  if (e?.code === "23503") return `Referenced record missing (${e.constraint ?? "foreign key"}).`;
  if (e?.code === "23514") return `Rejected by a data rule (${e.constraint ?? "check constraint"}).`;
  if (e?.code === "23P01") return "Conflicts with an existing reservation.";
  if (e?.code === "55P03" || /lock timeout/i.test(e?.message ?? "")) return "Record is busy; try again.";
  if (process.env.NODE_ENV !== "production" && e?.message) return e.message;
  return "Something went wrong.";
}

/**
 * Runs an action body and redirects with the outcome. Next's own control-flow
 * errors (redirect from requireStaff, notFound) pass straight through.
 */
export async function act(returnPath: string, fn: () => Promise<{ path?: string; notice: string } | void>): Promise<never> {
  let target = returnPath;
  let notice: string | undefined;
  let error: string | undefined;
  try {
    const res = await fn();
    if (res) {
      if (res.path) target = res.path;
      notice = res.notice;
    } else {
      notice = "Done";
    }
  } catch (err) {
    unstable_rethrow(err);
    console.error("[admin action]", err);
    error = messageOf(err);
  }
  redirect(withQuery(target, { notice, error }));
}

/** IAM-03: sensitive actions require a recent sign-in. Pages render a prompt; actions redirect. */
export function requireRecent(v: Viewer, next: string) {
  if (!recentlyAuthenticated(v)) {
    redirect(`/admin/sign-in?next=${encodeURIComponent(next)}&reason=reauth`);
  }
}

export function assert(cond: unknown, message: string, code: ApiError["code"] = "INVALID_INPUT"): asserts cond {
  if (!cond) throw new ApiError(code, message);
}

/** Zod helpers for HTML form values. Empty strings become undefined. */
export const zOpt = (max = 2000) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((s) => (s === "" ? undefined : s));
export const zReq = (max = 2000, min = 1) => z.string().trim().min(min).max(max);
export const zReason = z.string().trim().min(3, "A reason is required").max(2000);
export const zUuid = z.string().uuid();
export const zBool = z
  .union([z.literal("on"), z.literal("true"), z.literal("1"), z.literal("false"), z.literal("0"), z.literal("")])
  .optional()
  .transform((v) => v === "on" || v === "true" || v === "1");
export const zInt = (min: number, max: number) => z.coerce.number().int().min(min).max(max);
export const zOptInt = (min: number, max: number) =>
  z
    .string()
    .trim()
    .optional()
    .transform((s) => (s === undefined || s === "" ? undefined : Number(s)))
    .pipe(z.number().int().min(min).max(max).optional());
export const zList = z.union([z.string(), z.array(z.string())]).optional().transform(list);
export const zJson = z.string().transform((s, ctx) => {
  try {
    return JSON.parse(s) as unknown;
  } catch {
    ctx.addIssue({ code: "custom", message: "Invalid JSON" });
    return z.NEVER;
  }
});
export const zDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
export const zOptDate = z
  .string()
  .trim()
  .optional()
  .transform((s) => (s === "" ? undefined : s))
  .pipe(zDate.optional());
