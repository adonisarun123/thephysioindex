import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { PageHeader } from "@/components/admin/admin-shell";
import { Empty, Hidden, Notice, Pager, Pill, Table, Tabs, Td } from "@/components/admin/ui";
import { clampInt, first, fmtDateTime, maskMobile, qs, type SP } from "@/lib/admin/format";
import { listEnquiries } from "@/lib/admin/ops";
import { requireStaff } from "@/lib/auth/session";
import { enquiryStatusAction } from "../actions/ops";

export default function Page({ searchParams }: PageProps<"/admin/enquiries">) {
  return (
    <>
      <PageHeader title="Enquiries" description="Contact requests for unbookable or unclaimed profiles. An enquiry is not a booking and creates no appointment (Section 2)." />
      <Suspense fallback={<p className="text-muted">Loading…</p>}>
        <List searchParams={searchParams} />
      </Suspense>
    </>
  );
}

const STATES = ["new", "forwarded", "contacted", "closed"];

async function List({ searchParams }: { searchParams: PageProps<"/admin/enquiries">["searchParams"] }) {
  const sp = (await searchParams) as SP;
  await connection();
  await requireStaff("support_agent");
  const status = first(sp.status) ?? "new";
  const page = clampInt(sp.page, 1, 100_000, 1);
  const { rows, total, counts } = await listEnquiries({ status: status === "all" ? undefined : status, page, pageSize: 50 });
  const self = `/admin/enquiries${qs({ status, page })}`;
  return (
    <>
      <Notice sp={sp} />
      <Tabs current={status} items={[...STATES.map((s) => ({ href: `/admin/enquiries?status=${s}`, label: s, count: counts[s] ?? 0 })), { href: "/admin/enquiries?status=all", label: "all" }]} />
      <Table head={["Received", "Requester", "Mobile", "For", "Message", "Status", "Set status"]}>
        {rows.length === 0 ? <Empty>No enquiries.</Empty> : null}
        {rows.map((e) => (
          <tr key={e.id}>
            <Td className="text-xs">{fmtDateTime(e.createdAt)}</Td>
            <Td>{e.requesterName}</Td>
            <Td><code>{maskMobile(e.requesterMobile)}</code></Td>
            <Td>{e.practitionerId ? <Link href={`/admin/practitioners/${e.practitionerId}`} className="underline">{e.practitionerName}</Link> : "—"}{e.branchName ? <div className="text-xs text-muted">{e.branchName}</div> : null}</Td>
            <Td className="max-w-md whitespace-pre-wrap text-xs">{e.message ?? "—"}</Td>
            <Td><Pill status={e.status} />{e.forwardedAt ? <div className="text-xs text-muted">forwarded {fmtDateTime(e.forwardedAt)}</div> : null}</Td>
            <Td>
              <form action={enquiryStatusAction} className="flex flex-wrap gap-1">
                <Hidden name="enquiryId" value={e.id} /><Hidden name="returnTo" value={self} />
                {STATES.filter((s) => s !== e.status && s !== "new").map((s) => <button key={s} className="btn btn-quiet py-0.5 text-xs" name="status" value={s} type="submit">{s}</button>)}
              </form>
            </Td>
          </tr>
        ))}
      </Table>
      <Pager base="/admin/enquiries" sp={sp} page={page} pageSize={50} total={total} />
    </>
  );
}
