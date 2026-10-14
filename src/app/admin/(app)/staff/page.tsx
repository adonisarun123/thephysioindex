import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { PageHeader } from "@/components/admin/admin-shell";
import { ConfirmButton } from "@/components/admin/confirm-button";
import { Empty, Field, Hidden, Input, Notice, Pill, Section, Select, Sensitive, Table, Td, Textarea } from "@/components/admin/ui";
import { fmtDateTime, type SP } from "@/lib/admin/format";
import { listStaff } from "@/lib/admin/master";
import { requireStaff } from "@/lib/auth/session";
import { changeRoleAction, deactivateStaffAction, inviteStaffAction, reactivateStaffAction } from "../actions/staff";

export default function Page({ searchParams }: PageProps<"/admin/staff">) {
  return (
    <>
      <PageHeader title="Staff and roles" description="Global staff grants (IAM-02). Adding an administrator needs a recent sign-in and a reason; the super_admin role needs approval by a second administrator (IAM-03). Deactivation revokes grants and terminates sessions." />
      <Suspense fallback={<p className="text-muted">Loading…</p>}>
        <Body searchParams={searchParams} />
      </Suspense>
    </>
  );
}

const ROLES = ["verification_reviewer", "support_agent", "analyst", "super_admin"];

async function Body({ searchParams }: { searchParams: PageProps<"/admin/staff">["searchParams"] }) {
  const sp = (await searchParams) as SP;
  await connection();
  const v = await requireStaff("super_admin");
  const staff = await listStaff();
  return (
    <>
      <Notice sp={sp} />
      <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
        <Table head={["Staff member", "Status", "MFA", "Roles", "Last seen", "Manage"]}>
          {staff.length === 0 ? <Empty>No staff accounts.</Empty> : null}
          {staff.map((s) => (
            <tr key={s.id}>
              <Td><span className="font-semibold">{s.name ?? "—"}</span><div className="text-xs text-muted">{s.email ?? s.mobile}</div>{s.id === v.userId ? <span className="pill bg-surface-2 text-muted">you</span> : null}</Td>
              <Td><Pill status={s.status} /></Td>
              <Td>{s.twoFactor ? "Enrolled" : <span className="text-alert">Not enrolled</span>}</Td>
              <Td>
                <ul className="text-xs">{s.roles.map((r) => <li key={r.id}><strong>{r.role}</strong> <span className="text-muted">by {r.grantedBy ?? "bootstrap"} · {fmtDateTime(r.createdAt)}{r.reason ? ` · ${r.reason}` : ""}</span></li>)}{s.roles.length === 0 ? <li className="text-muted">no active staff roles</li> : null}</ul>
                {s.pendingEscalation ? <Link href={`/admin/cases/${s.pendingEscalation}`} className="text-xs underline">super_admin escalation pending</Link> : null}
              </Td>
              <Td className="text-xs">{fmtDateTime(s.lastSeenAt)}</Td>
              <Td>
                <Sensitive viewer={v} next="/admin/staff">
                  <details>
                    <summary className="cursor-pointer text-sm underline">Roles</summary>
                    <form action={changeRoleAction} className="mt-2 grid w-64 gap-1 text-sm">
                      <Hidden name="userId" value={s.id} />
                      <Select name="role" aria-label="Role" className="py-1" options={ROLES.map((r) => ({ value: r, label: r }))} />
                      <Input name="reason" required placeholder="Reason" aria-label="Reason" className="py-1" />
                      <div className="flex gap-1"><button className="btn btn-secondary py-1" name="op" value="grant" type="submit">Grant</button><button className="btn btn-quiet py-1" name="op" value="revoke" type="submit">Revoke</button></div>
                    </form>
                  </details>
                  {s.status === "active" && s.id !== v.userId ? (
                    <form action={deactivateStaffAction} className="mt-2 grid w-64 gap-1 text-sm">
                      <Hidden name="userId" value={s.id} />
                      <Input name="reason" required placeholder="Deactivation reason" aria-label="Deactivation reason" className="py-1" />
                      <ConfirmButton message={`Deactivate ${s.name ?? s.email}? All grants are revoked and sessions terminated.`} className="btn btn-quiet py-1 text-alert">Deactivate</ConfirmButton>
                    </form>
                  ) : s.status !== "active" ? (
                    <form action={reactivateStaffAction} className="mt-2 grid w-64 gap-1 text-sm">
                      <Hidden name="userId" value={s.id} />
                      <Input name="reason" required placeholder="Reason" aria-label="Reason" className="py-1" />
                      <button className="btn btn-quiet py-1" type="submit">Reactivate</button>
                    </form>
                  ) : null}
                </Sensitive>
              </Td>
            </tr>
          ))}
        </Table>
        <Section title="Invite staff">
          <Sensitive viewer={v} next="/admin/staff">
            <form action={inviteStaffAction} className="grid gap-2">
              <Field label="Work email" name="email"><Input name="email" type="email" required /></Field>
              <Field label="Full name" name="name"><Input name="name" required minLength={2} /></Field>
              <Field label="Role" name="role" hint="super_admin opens an escalation case for a second administrator."><Select name="role" options={ROLES.map((r) => ({ value: r, label: r }))} /></Field>
              <Field label="Reason" name="reason"><Textarea name="reason" required rows={2} /></Field>
              <button className="btn btn-primary py-1.5" type="submit">Create staff account</button>
              <p className="text-xs text-muted">They sign in at /admin/sign-in with an emailed code and must enrol an authenticator before the admin area opens (SEC-02).</p>
            </form>
          </Sensitive>
        </Section>
      </div>
    </>
  );
}
