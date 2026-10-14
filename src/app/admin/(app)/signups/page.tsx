import { connection } from "next/server";
import { Suspense } from "react";
import { PageHeader } from "@/components/admin/admin-shell";
import { Empty, Hidden, Notice, Pager, Pill, Table, Tabs, Td } from "@/components/admin/ui";
import { clampInt, first, fmtDateTime, qs, type SP } from "@/lib/admin/format";
import { listSignups } from "@/lib/admin/ops";
import { requireStaff } from "@/lib/auth/session";
import { practiceTypeLabel, SIGNUP_STATUSES } from "@/lib/practitioner-signups";
import { signupStatusAction } from "../actions/ops";

export default function Page({ searchParams }: PageProps<"/admin/signups">) {
  return (
    <>
      <PageHeader
        title="Sign-up leads"
        description="Physiotherapists who registered interest on /for-physiotherapists/join. A lead publishes nothing: call them, then create or claim their profile through the normal onboarding and verification (VER-03)."
      />
      <Suspense fallback={<p className="text-muted">Loading…</p>}>
        <List searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function List({ searchParams }: { searchParams: PageProps<"/admin/signups">["searchParams"] }) {
  const sp = (await searchParams) as SP;
  await connection();
  await requireStaff("support_agent");
  const status = first(sp.status) ?? "new";
  const page = clampInt(sp.page, 1, 100_000, 1);
  const { rows, total, counts } = await listSignups({ status: status === "all" ? undefined : status, page, pageSize: 50 });
  const self = `/admin/signups${qs({ status, page })}`;
  return (
    <>
      <Notice sp={sp} />
      <Tabs current={status} items={[...SIGNUP_STATUSES.map((s) => ({ href: `/admin/signups?status=${s}`, label: s.replace("_", " "), count: counts[s] ?? 0 })), { href: "/admin/signups?status=all", label: "all" }]} />
      <Table head={["Received", "Name", "Contact", "City", "Practice", "Reg. no.", "Source", "Status", "Update"]}>
        {rows.length === 0 ? <Empty>No sign-ups.</Empty> : null}
        {rows.map((r) => (
          <tr key={r.id}>
            <Td className="text-xs">{fmtDateTime(r.createdAt)}<div className="text-muted">{r.reference.toUpperCase()}</div></Td>
            <Td>{r.fullName}</Td>
            <Td className="text-xs">
              <a href={`tel:${r.mobile}`} className="underline">{r.mobile}</a>
              {r.email ? <div><a href={`mailto:${r.email}`} className="underline">{r.email}</a></div> : null}
            </Td>
            <Td>{r.city}</Td>
            <Td className="text-xs">{practiceTypeLabel(r.practiceType)}</Td>
            <Td className="text-xs">{r.registrationNumber ?? "—"}</Td>
            <Td className="text-xs">{[r.attribution.utm_source, r.attribution.utm_campaign, r.attribution.utm_term].filter(Boolean).join(" · ") || (r.attribution.gclid ? "google ads" : "direct")}</Td>
            <Td><Pill status={r.status} label={r.status.replace("_", " ")} />{r.notes ? <div className="mt-1 max-w-xs whitespace-pre-wrap text-xs text-muted">{r.notes}</div> : null}</Td>
            <Td>
              <form action={signupStatusAction} className="grid gap-1">
                <Hidden name="signupId" value={r.id} /><Hidden name="returnTo" value={self} />
                <input name="notes" className="input min-h-0 py-1 text-xs" placeholder="Note (optional)" maxLength={1000} />
                <div className="flex flex-wrap gap-1">
                  {SIGNUP_STATUSES.filter((s) => s !== r.status && s !== "new").map((s) => (
                    <button key={s} className="btn btn-quiet min-h-0 py-0.5 text-xs" name="status" value={s} type="submit">{s.replace("_", " ")}</button>
                  ))}
                </div>
              </form>
            </Td>
          </tr>
        ))}
      </Table>
      <Pager base="/admin/signups" sp={sp} page={page} pageSize={50} total={total} />
    </>
  );
}
