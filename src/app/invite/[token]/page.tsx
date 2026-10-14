import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { Notice } from "@/components/workspace/forms/ui";
import { getViewer } from "@/lib/auth/session";
import { readMessage } from "@/lib/workspace/forms";
import { COORDINATOR_PERMISSIONS, getInvitationByToken } from "@/lib/workspace/team";
import { acceptInvitationAction } from "./actions";

export const metadata: Metadata = { title: "Team invitation", robots: { index: false, follow: false } };

export default function Page({ params, searchParams }: PageProps<"/invite/[token]">) {
  return (
    <Suspense fallback={<div className="mx-auto max-w-md px-4 py-12 text-muted">Loading…</div>}>
      <Invite params={params} searchParams={searchParams} />
    </Suspense>
  );
}

const LABELS = Object.fromEntries(COORDINATOR_PERMISSIONS.map((p) => [p.key, p.label]));

async function Invite({ params, searchParams }: { params: PageProps<"/invite/[token]">["params"]; searchParams: PageProps<"/invite/[token]">["searchParams"] }) {
  await connection();
  const [{ token }, sp] = await Promise.all([params, searchParams]);
  const viewer = await getViewer();
  if (!viewer) redirect(`/sign-in?as=practitioner&next=${encodeURIComponent(`/invite/${token}`)}`);
  const inv = await getInvitationByToken(token);
  const msg = readMessage(sp);
  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">Workspace invitation</h1>
      <Notice ok={msg.ok} error={msg.error} />
      {!inv ? (
        <p className="mt-4 text-sm text-muted">This invitation link is not valid. Ask the practitioner to send a new one.</p>
      ) : inv.state !== "pending" || inv.expired ? (
        <p className="mt-4 text-sm text-muted">This invitation is {inv.expired ? "expired" : inv.state}. Ask {inv.practitionerName} to send a new one.</p>
      ) : (
        <form action={acceptInvitationAction} className="card mt-4 grid gap-3 p-5 text-sm">
          <input type="hidden" name="token" value={token} />
          <p><strong>{inv.practitionerName}</strong>{inv.inviterName ? ` (invited by ${inv.inviterName})` : ""} has invited you to help manage their workspace as a clinic coordinator.</p>
          <p className="text-muted">Permissions: {inv.permissions.map((k) => LABELS[k] ?? k).join(", ")}. You will see only this practitioner’s data.</p>
          <p className="text-muted">Accepting as {viewer.mobile ?? viewer.email}.</p>
          <div className="mt-2 flex gap-3">
            <button type="submit" className="btn btn-primary">Accept invitation</button>
            <Link href="/" className="btn btn-quiet">Decline</Link>
          </div>
        </form>
      )}
      {inv && inv.state === "pending" && !inv.expired ? (
        <form action="/sign-out" method="post" className="mt-3 text-sm text-muted">
          Not you? <button type="submit" className="underline">Sign out</button> and sign in with the invited number or email.
        </form>
      ) : null}
    </div>
  );
}
