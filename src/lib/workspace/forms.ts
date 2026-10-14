import { redirect } from "next/navigation";
import { ZodError } from "zod";
import { ApiError } from "@/lib/api";

/**
 * Helpers for plain server-rendered forms posting to server actions
 * (progressive enhancement, no client state). Outcomes travel back to the
 * page as `?ok=` / `?error=` search params.
 */

export function str(fd: FormData, name: string): string {
  const v = fd.get(name);
  return typeof v === "string" ? v.trim() : "";
}

export function opt(fd: FormData, name: string): string | undefined {
  const v = str(fd, name);
  return v === "" ? undefined : v;
}

export function num(fd: FormData, name: string): number | undefined {
  const v = str(fd, name);
  if (v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export function bool(fd: FormData, name: string): boolean {
  const v = fd.get(name);
  return v === "on" || v === "true" || v === "1";
}

export function list(fd: FormData, name: string): string[] {
  return fd.getAll(name).filter((v): v is string => typeof v === "string" && v.trim() !== "").map((v) => v.trim());
}

/** Rows of repeated fields: name[0].field, name[1].field … → objects. Blank rows are dropped. */
export function rows(fd: FormData, prefix: string): Record<string, string>[] {
  const out = new Map<number, Record<string, string>>();
  for (const [key, value] of fd.entries()) {
    if (typeof value !== "string") continue;
    const m = key.match(new RegExp(`^${prefix}\\[(\\d+)\\]\\.(\\w+)$`));
    if (!m) continue;
    const idx = Number(m[1]);
    const row = out.get(idx) ?? {};
    row[m[2]] = value.trim();
    out.set(idx, row);
  }
  return [...out.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, row]) => row)
    .filter((row) => Object.values(row).some((v) => v !== ""));
}

/** Rupees as typed ("450", "450.50") → integer paise, no floats (OFR-02). */
export function rupeesToPaise(input: string): number | null {
  const m = input.replace(/[₹,\s]/g, "").match(/^(\d{1,7})(?:\.(\d{1,2}))?$/);
  if (!m) return null;
  const rupees = Number(m[1]);
  const paise = m[2] ? Number(m[2].padEnd(2, "0")) : 0;
  return rupees * 100 + paise;
}

export function paiseToRupeesInput(paise: number): string {
  const r = Math.trunc(paise / 100);
  const p = Math.abs(paise % 100);
  return p === 0 ? String(r) : `${r}.${String(p).padStart(2, "0")}`;
}

/** Plain-text sanitiser for public copy: strips tags and control chars, collapses whitespace (PRO-10). */
export function plainText(input: string, max: number): string {
  return input
    .replace(/<[^>]*>/g, "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, max);
}

export function withQuery(path: string, q: Record<string, string | undefined>): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== "") u.set(k, v);
  const s = u.toString();
  return s ? `${path}${path.includes("?") ? "&" : "?"}${s}` : path;
}

/** Ends the action with a redirect carrying a one-line outcome. */
export function done(path: string, msg: { ok?: string; error?: string }): never {
  redirect(withQuery(path, msg));
}

/** Turns thrown validation or catalogue errors into a redirect; rethrows anything else (including redirects). */
export function failTo(path: string, err: unknown): never {
  if (err instanceof ZodError) {
    const i = err.issues[0];
    const where = i?.path.length ? `${i.path.join(".")}: ` : "";
    redirect(withQuery(path, { error: `${where}${i?.message ?? "Invalid input"}` }));
  }
  if (err instanceof ApiError) redirect(withQuery(path, { error: err.message }));
  throw err;
}

/** Message read back on the page from search params. */
export function readMessage(sp: Record<string, string | string[] | undefined>): { ok?: string; error?: string } {
  return {
    ok: typeof sp.ok === "string" ? sp.ok : undefined,
    error: typeof sp.error === "string" ? sp.error : undefined,
  };
}
