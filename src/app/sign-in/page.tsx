import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { EmailSignIn } from "@/components/auth/email-sign-in";
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

/** SMS codes only reach phones once MSG91 is live; until then email is the default for everyone. */
const SMS_LIVE = process.env.SMS_PROVIDER === "msg91";

async function SignIn({ searchParams }: { searchParams: PageProps<"/sign-in">["searchParams"] }) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" && sp.next.startsWith("/") ? sp.next : "/account";
  const intent = sp.as === "practitioner" ? "practitioner" : "patient";
  const viewer = await getViewer();
  if (viewer) redirect(next);

  const method = sp.method === "email" || (sp.method !== "mobile" && !SMS_LIVE) ? "email" : "mobile";
  const switchHref = (m: "email" | "mobile") => `/sign-in?${intent === "practitioner" ? "as=practitioner&" : ""}method=${m}&next=${encodeURIComponent(next)}`;

  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <h1 className="text-3xl font-bold">{intent === "practitioner" ? "Sign in to your practice workspace" : "Sign in or create your account"}</h1>
      <p className="mt-2 text-muted">{method === "email" ? "We email you a one-time code. No passwords." : "We send a one-time code to your mobile. No passwords."}</p>
      <div className="mt-6 inline-flex rounded-[var(--r-ctl)] border border-line p-1 text-sm" role="tablist" aria-label="Sign-in method">
          {(["email", "mobile"] as const).map((m) => (
            <Link key={m} href={switchHref(m)} role="tab" aria-selected={method === m} className={`rounded-[var(--r-sm)] px-3 py-1.5 ${method === m ? "bg-brand-soft font-semibold" : "text-muted"}`}>
              {m === "email" ? "Email" : "Mobile"}
            </Link>
          ))}
      </div>
      <div className="mt-4">{method === "email" ? <EmailSignIn next={next} audience={intent} /> : <PhoneSignIn next={next} intent={intent} />}</div>
      {method === "mobile" && !SMS_LIVE ? <p className="mt-3 text-sm text-muted">SMS codes are not live yet. Please use email.</p> : null}
      <p className="mt-6 text-sm text-muted">
        {intent === "practitioner" ? <a href={`/sign-in?next=${encodeURIComponent(next)}`} className="underline">I am a patient</a> : <a href={`/sign-in?as=practitioner&next=${encodeURIComponent("/workspace")}`} className="underline">I am a physiotherapist</a>}
        {" · "}
        <a href="/admin/sign-in" className="underline">Staff sign-in</a>
      </p>
    </div>
  );
}
