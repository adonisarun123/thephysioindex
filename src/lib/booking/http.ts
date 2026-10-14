import { ApiError } from "@/lib/api";
import { apiViewer } from "@/lib/auth/session";
import type { Actor } from "./engine";

/** Authenticated actor plus the mandatory Idempotency-Key header for booking mutations (BKG-10). */
export async function bookingRequest(req: Request): Promise<{ actor: Actor; idempotencyKey: string }> {
  const viewer = await apiViewer();
  const idempotencyKey = req.headers.get("idempotency-key") ?? "";
  if (idempotencyKey.length < 8) throw new ApiError("INVALID_INPUT", "An Idempotency-Key header is required");
  return { actor: { userId: viewer.userId, role: viewer.kind }, idempotencyKey };
}

/** Path segment before a trailing action, e.g. /bookings/{id}/cancel → id. */
export function pathParam(req: Request, fromEnd: number): string {
  const parts = new URL(req.url).pathname.split("/").filter(Boolean);
  return parts[parts.length - 1 - fromEnd] ?? "";
}
