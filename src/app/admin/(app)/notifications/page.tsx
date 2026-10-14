import { connection } from "next/server";
import { Suspense } from "react";
import { PageHeader } from "@/components/admin/admin-shell";
import { Empty, Hidden, Notice, Pager, Pill, Table, Tabs, Td } from "@/components/admin/ui";
import { clampInt, first, fmtDateTime, maskMobile, qs, type SP } from "@/lib/admin/format";
import { listDeliveries } from "@/lib/admin/notifications";
import { requireStaff } from "@/lib/auth/session";
import { retryDeliveryAction } from "../actions/ops";

export default function Page({ searchParams }: PageProps<"/admin/notifications">) {
  return (
    <>
      <PageHeader
        title="Notifications"
        description="SMS and email delivery records (MSG-01). Dead messages failed permanently or ran out of retries and need a person: fix the cause (missing DLT template id, wrong contact), then retry."
      />
      <Suspense fallback={<p className="text-muted">Loading…</p>}>
        <List searchParams={searchParams} />
      </Suspense>
    </>
  );
}

const STATES = ["dead", "failed", "queued", "sent", "cancelled"];

function maskEmail(e: string): string {
  const [user, domain] = e.split("@");
  return domain ? `${user.slice(0, 1)}•••@${domain}` : "•••";
}

async function List({ searchParams }: { searchParams: PageProps<"/admin/notifications">["searchParams"] }) {
  const sp = (await searchParams) as SP;
  await connection();
  await requireStaff("support_agent");
  const state = first(sp.state) ?? "dead";
  const page = clampInt(sp.page, 1, 100_000, 1);
  const { rows, total, counts } = await listDeliveries({ state: state === "all" ? undefined : state, page, pageSize: 50 });
  const self = `/admin/notifications${qs({ state, page })}`;
  return (
    <>
      <Notice sp={sp} />
      <Tabs current={state} items={[...STATES.map((s) => ({ href: `/admin/notifications?state=${s}`, label: s, count: counts[s] ?? 0 })), { href: "/admin/notifications?state=all", label: "all" }]} />
      <Table head={["Due", "Message", "Channel", "To", "Booking", "Attempts", "Status", "Last error", ""]}>
        {rows.length === 0 ? <Empty>No messages in this state.</Empty> : null}
        {rows.map((d) => (
          <tr key={d.id}>
            <Td className="text-xs">{fmtDateTime(d.scheduledFor)}{d.sentAt ? <div className="text-muted">sent {fmtDateTime(d.sentAt)}</div> : null}</Td>
            <Td className="text-xs"><code>{d.template}</code></Td>
            <Td className="text-xs">{d.channel}</Td>
            <Td className="text-xs"><code>{d.address ? (d.channel === "email" ? maskEmail(d.address) : maskMobile(d.address)) : "—"}</code><div className="text-muted">{d.recipientType}</div></Td>
            <Td className="text-xs">{d.bookingReference ?? "—"}</Td>
            <Td className="text-xs">{d.attempts}</Td>
            <Td><Pill status={d.state} /></Td>
            <Td className="max-w-xs text-xs">{d.lastError ?? "—"}</Td>
            <Td>
              {d.state === "dead" || d.state === "failed" ? (
                <form action={retryDeliveryAction}>
                  <Hidden name="deliveryId" value={d.id} /><Hidden name="returnTo" value={self} />
                  <button className="btn btn-quiet py-0.5 text-xs" type="submit">Retry now</button>
                </form>
              ) : null}
            </Td>
          </tr>
        ))}
      </Table>
      <Pager base="/admin/notifications" sp={sp} page={page} pageSize={50} total={total} />
    </>
  );
}
