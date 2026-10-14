import type { Metadata } from "next";
import { Suspense } from "react";
import { EmailSignIn } from "@/components/auth/email-sign-in";

export const metadata: Metadata = { title: "Staff sign-in", robots: { index: false, follow: false } };

export default function Page({ searchParams }: PageProps<"/admin/sign-in">) {
  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <h1 className="text-3xl font-bold">Staff sign-in</h1>
      <p className="mt-2 text-muted">For reviewers, support and administrators. A code is emailed to your work address, then your authenticator app.</p>
      <div className="mt-6">
        <Suspense fallback={null}>
          <Form searchParams={searchParams} />
        </Suspense>
      </div>
    </div>
  );
}

async function Form({ searchParams }: { searchParams: PageProps<"/admin/sign-in">["searchParams"] }) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" && sp.next.startsWith("/admin") ? sp.next : "/admin";
  return <EmailSignIn next={next} />;
}
