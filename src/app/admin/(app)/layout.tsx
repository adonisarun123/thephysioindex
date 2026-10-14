import { headers } from "next/headers";
import { Suspense } from "react";
import { AdminShell } from "@/components/admin/admin-shell";
import { adminNav } from "@/lib/admin/nav";
import { queueCounts } from "@/lib/admin/queues";
import { requireStaff } from "@/lib/auth/session";

export const metadata = { robots: { index: false, follow: false } };

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="p-8 text-muted">Loading admin…</div>}>
      <Shell>{children}</Shell>
    </Suspense>
  );
}

async function Shell({ children }: { children: React.ReactNode }) {
  const viewer = await requireStaff();
  const [counts, h] = await Promise.all([queueCounts(), headers()]);
  // Pages re-check their own authorisation; the shell only renders navigation.
  const current = h.get("x-pathname") ?? "/admin";
  return (
    <AdminShell viewer={viewer} groups={adminNav(counts)} current={current}>
      {children}
    </AdminShell>
  );
}
