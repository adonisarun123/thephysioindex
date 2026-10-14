import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { PhoneSignIn } from "@/components/auth/phone-sign-in";
import { getViewer } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

export default function Page({ searchParams }: PageProps<"/sign-in">) {
  return (
    <Suspense fallback={<div className="mx-auto max-w-md px-4 py-12 text-muted">Loading…</div>}>
      <SignIn searchParams={searchParams} />
    </Suspense>
  );
}

async function SignIn({ searchParams }: { searchParams: PageProps<"/sign-in">["searchParams"] }) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" && sp.next.startsWith("/") ? sp.next : "/account";
  const intent = sp.as === "practitioner" ? "practitioner" : "patient";
  const viewer = await getViewer();
  if (viewer) redirect(next);
  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <h1 className="text-3xl font-bold">{intent === "practitioner" ? "Sign in to your practice workspace" : "Sign in or create your account"}</h1>
      <p className="mt-2 text-muted">We send a one-time code to your mobile. No passwords.</p>
      <div className="mt-6">
        <PhoneSignIn next={next} intent={intent} />
      </div>
      <p className="mt-6 text-sm text-muted">
        {intent === "practitioner" ? <a href={`/sign-in?next=${encodeURIComponent(next)}`} className="underline">I am a patient</a> : <a href={`/sign-in?as=practitioner&next=${encodeURIComponent("/workspace")}`} className="underline">I am a physiotherapist</a>}
        {" · "}
        <a href="/admin/sign-in" className="underline">Staff sign-in</a>
      </p>
    </div>
  );
}
