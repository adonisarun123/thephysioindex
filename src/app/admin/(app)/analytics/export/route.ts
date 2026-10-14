import { connection } from "next/server";
import { analyticsCsv, loadAnalytics, type DateType } from "@/lib/admin/analytics";
import { isoDateShift, todayIst } from "@/lib/admin/format";
import { actorRole } from "@/lib/admin/practitioner-ops";
import { audit } from "@/lib/audit";
import { requireStaff } from "@/lib/auth/session";

/** ANA-03: aggregate CSV of the analytics page. Aggregates only (no patient rows); export is audited (SEC-09). */
export async function GET(req: Request) {
  await connection();
  const v = await requireStaff("analyst");
  const url = new URL(req.url);
  const date = (k: string, d: string) => (/^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get(k) ?? "") ? url.searchParams.get(k)! : d);
  const from = date("from", isoDateShift(-30));
  const to = date("to", todayIst());
  const dt = url.searchParams.get("dateType");
  const dateType: DateType = dt === "created" || dt === "completed" ? dt : "appointment";
  const a = await loadAnalytics(from, to, dateType);
  await audit({ actorUserId: v.userId, actorRole: actorRole(v), action: "analytics.export", objectType: "analytics", objectId: null, changedFields: { from, to, dateType } });
  return new Response(analyticsCsv(a, from, to, dateType), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="tpi-analytics-${from}-${to}.csv"`, "Cache-Control": "no-store" },
  });
}
