import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { Empty, Field, Notice, PageHeader, Section, StatePill } from "@/components/workspace/forms/ui";
import { formatIst } from "@/lib/workspace/calendar";
import { requireWorkspace } from "@/lib/workspace/context";
import { readMessage } from "@/lib/workspace/forms";
import { listTeam } from "@/lib/workspace/queries";
import { COORDINATOR_PERMISSIONS } from "@/lib/workspace/team";
import { inviteAction, revokeInvitationAction, revokeMemberAction } from "./actions";

export const metadata: Metadata = { title: "Team" };

export default function Page({ searchParams }: PageProps<"/workspace/team">) {
  return (
    <Suspense fallback={<p className="text-muted">Loading…</p>}>
      <Team searchParams={searchParams} />
    </Suspense>
  );
}

const LABELS = Object.fromEntries(COORDINATOR_PERMISSIONS.map((p) => [p.key, p.label]));

/** Section 15 Team: invitations, assigned coordinators, permissions and revocation (IAM-02). */
async function Team({ searchParams }: { searchParams: PageProps<"/workspace/team">["searchParams"] }) {
  await connection();
  const sp = await searchParams;
  const { practitioner: p } = await requireWorkspace("/workspace/team");
  const { members, invitations } = await listTeam(p.id);
  const msg = readMessage(sp);
  const pending = invitations.filter((i) => i.state === "pending" && new Date(i.expiresAt) > new Date());

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Team" lede="Coordinators see only this profile, with the permissions you grant. A coordinator assigned to you cannot read another practitioner’s appointments (Section 15)." />
      <Notice ok={msg.ok} error={msg.error} />
      {!p.isOwner ? <p className="card mt-4 p-3 text-sm text-muted">Only the profile owner can invite or revoke team members.</p> : null}

      <Section title="Members">
        {members.length === 0 ? <Empty>No coordinators yet.</Empty> : (
          <ul className="divide-y divide-line border-y border-line text-sm">
            {members.map((m) => (
              <li key={m.assignmentId} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <p className="font-medium">{m.name ?? m.mobile ?? m.email ?? "Team member"} <span className="text-muted">· {m.role.replace(/_/g, " ")}</span></p>
                  <p className="text-muted">{m.permissions.map((k) => LABELS[k] ?? k).join(", ") || "No permissions"} · since {formatIst(m.grantedAt, { day: "numeric", month: "short", year: "numeric" })}</p>
                </div>
                {p.isOwner && m.role !== "practitioner" ? <form action={revokeMemberAction}><input type="hidden" name="assignmentId" value={m.assignmentId} /><button type="submit" className="btn btn-quiet py-1 text-xs">Revoke access</button></form> : null}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Invitations">
        {pending.length === 0 ? <Empty>No pending invitations.</Empty> : (
          <ul className="divide-y divide-line border-y border-line text-sm">
            {pending.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <p className="font-medium">{i.mobile ?? i.email}</p>
                  <p className="text-muted">{i.permissions.map((k) => LABELS[k] ?? k).join(", ")} · expires {formatIst(i.expiresAt)}</p>
                </div>
                <div className="flex items-center gap-2"><StatePill state={i.state} />{p.isOwner ? <form action={revokeInvitationAction}><input type="hidden" name="invitationId" value={i.id} /><button type="submit" className="btn btn-quiet py-1 text-xs">Revoke</button></form> : null}</div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {p.isOwner ? (
        <form action={inviteAction}>
          <Section title="Invite a coordinator" lede="They sign in with their own mobile or email and accept the link. Links expire after 7 days and bind to the signed-in account, not the link alone.">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Mobile" htmlFor="mobile"><input id="mobile" name="mobile" className="input" inputMode="tel" /></Field>
              <Field label="or email" htmlFor="email"><input id="email" name="email" type="email" className="input" /></Field>
              <div className="sm:col-span-2">
                <p className="label">Permissions</p>
                <ul className="grid gap-1 text-sm sm:grid-cols-2">
                  {COORDINATOR_PERMISSIONS.map((perm) => (
                    <li key={perm.key}><label className="flex items-center gap-2"><input type="checkbox" name="permissions" value={perm.key} defaultChecked={perm.key === "appointments.read"} /> {perm.label}</label></li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="mt-5"><button type="submit" className="btn btn-primary">Send invitation</button></div>
          </Section>
        </form>
      ) : null}
    </div>
  );
}
