import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { TotpEnrol } from "@/components/auth/totp";
import { getViewer, isStaff } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Security", robots: { index: false, follow: false } };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <Security />
    </Suspense>
  );
}

async function Security() {
  await connection();
  const v = await getViewer();
  if (!v) redirect("/admin/sign-in?next=/admin/security");
  if (!isStaff(v)) redirect("/account?error=not_staff");
  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <h1 className="text-3xl font-bold">Security</h1>
      <p className="mt-2 text-muted">Signed in as {v.email}.</p>
      <div className="mt-6">
        {v.twoFactorEnabled ? (
          <div className="card p-6">
            <p className="font-medium text-brand-ink">Authenticator app is enabled.</p>
            <p className="mt-1 text-sm text-muted">To replace it, contact a super administrator; disabling MFA is not self-service (IAM-03).</p>
            <a href="/admin" className="btn btn-primary mt-4">Go to admin</a>
          </div>
        ) : (
          <TotpEnrol />
        )}
      </div>
    </div>
  );
}
