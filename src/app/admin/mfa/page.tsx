import type { Metadata } from "next";
import { Suspense } from "react";
import { TotpVerify } from "@/components/auth/totp";

export const metadata: Metadata = { title: "Two-step verification", robots: { index: false, follow: false } };

export default function Page({ searchParams }: PageProps<"/admin/mfa">) {
  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <h1 className="text-3xl font-bold">Two-step verification</h1>
      <p className="mt-2 text-muted">Enter the code from your authenticator app.</p>
      <div className="mt-6">
        <Suspense fallback={null}>
          <Form searchParams={searchParams} />
        </Suspense>
      </div>
    </div>
  );
}

async function Form({ searchParams }: { searchParams: PageProps<"/admin/mfa">["searchParams"] }) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" && sp.next.startsWith("/admin") ? sp.next : "/admin";
  return <TotpVerify next={next} />;
}
