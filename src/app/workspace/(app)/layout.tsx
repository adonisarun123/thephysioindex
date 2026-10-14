import { headers } from "next/headers";
import { connection } from "next/server";
import { Suspense } from "react";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";
import { requireWorkspace } from "@/lib/workspace/context";

export const metadata = { robots: { index: false, follow: false } };

/** Practitioner workspace (Section 15). Pages re-check authorisation; the shell only renders navigation (IAM-01). */
export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="p-8 text-muted">Loading workspace…</div>}>
      <Shell>{children}</Shell>
    </Suspense>
  );
}

async function Shell({ children }: { children: React.ReactNode }) {
  await connection();
  const h = await headers();
  const current = h.get("x-pathname") ?? "/workspace";
  const { practitioner } = await requireWorkspace(current);
  return (
    <WorkspaceShell practitionerName={practitioner.displayName} status={practitioner.listingStatus} current={current}>
      {children}
    </WorkspaceShell>
  );
}
