import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { PageHeader } from "@/components/admin/admin-shell";
import { Empty, Input, Notice, Pager, Pill, Select, Table, Td } from "@/components/admin/ui";
import { clampInt, first, fmtDate, type SP } from "@/lib/admin/format";
import { geoOptions, listPractitioners } from "@/lib/admin/practitioners";
import { requireStaff } from "@/lib/auth/session";
import { VERIFICATION_LABELS } from "@/lib/verification";

export default function Page({ searchParams }: PageProps<"/admin/practitioners">) {
  return (
    <>
      <PageHeader title="Practitioners" description="Every listing in every state. Public pages only ever show published, non-suspended profiles (DIR-11)." actions={<Link href="/admin/practitioners/new" className="btn btn-primary py-1.5">New staff-created profile</Link>} />
      <Suspense fallback={<p className="text-muted">Loading…</p>}>
        <List searchParams={searchParams} />
      </Suspense>
    </>
  );
}

const STATUSES = ["draft", "submitted", "changes_requested", "published", "rejected", "suspended", "archived"];

async function List({ searchParams }: { searchParams: PageProps<"/admin/practitioners">["searchParams"] }) {
  const sp = (await searchParams) as SP;
  await connection();
  await requireStaff();
  const q = first(sp.q) ?? "";
  const listingStatus = first(sp.listingStatus) || undefined;
  const claimState = first(sp.claimState) || undefined;
  const stateId = first(sp.stateId) || undefined;
  const cityId = first(sp.cityId) || undefined;
  const page = clampInt(sp.page, 1, 100_000, 1);
  const [{ rows, total }, geo] = await Promise.all([listPractitioners({ q, listingStatus, claimState, stateId, cityId, page, pageSize: 50 }), geoOptions()]);
  const cities = stateId ? geo.cities.filter((c) => c.stateId === stateId) : geo.cities;
  return (
    <>
      <Notice sp={sp} />
      <form method="get" className="mb-4 grid gap-2 md:grid-cols-[2fr_1fr_1fr_1fr_1fr_auto]">
        <Input name="q" defaultValue={q} placeholder="Name, public id or registration number" aria-label="Search" />
        <Select name="listingStatus" aria-label="Listing status" defaultValue={listingStatus ?? ""} options={[{ value: "", label: "Any status" }, ...STATUSES.map((s) => ({ value: s, label: s.replace("_", " ") }))]} />
        <Select name="claimState" aria-label="Claim state" defaultValue={claimState ?? ""} options={[{ value: "", label: "Claimed or not" }, { value: "claimed", label: "Claimed" }, { value: "unclaimed", label: "Unclaimed" }]} />
        <Select name="stateId" aria-label="State" defaultValue={stateId ?? ""} options={[{ value: "", label: "Any state" }, ...geo.states.map((s) => ({ value: s.id, label: s.name }))]} />
        <Select name="cityId" aria-label="City" defaultValue={cityId ?? ""} options={[{ value: "", label: "Any city" }, ...cities.slice(0, 400).map((c) => ({ value: c.id, label: c.name }))]} />
        <button className="btn btn-secondary" type="submit">Filter</button>
      </form>
      <Table head={["Name", "Public ID", "Listing", "Claim", "Verification", "Bookable", "Cities", "Open cases", "Source", "Created"]}>
        {rows.length === 0 ? <Empty>No practitioners match.</Empty> : null}
        {rows.map((r) => (
          <tr key={r.id}>
            <Td>
              <Link href={`/admin/practitioners/${r.id}`} className="font-semibold underline">{r.displayName}</Link>
              {r.isTestAccount ? <span className="ml-1 pill bg-surface-2 text-muted">test</span> : null}
              <div className="text-xs text-muted">{r.designation}</div>
            </Td>
            <Td><code className="text-xs">{r.publicId}</code></Td>
            <Td><Pill status={r.listingStatus} /></Td>
            <Td><Pill status={r.claimState} /></Td>
            <Td><Pill status={r.verification === "not_verified" ? "self_declared" : r.verification === "restricted" ? "revoked" : r.verification} label={VERIFICATION_LABELS[r.verification].short} /></Td>
            <Td>{r.bookingEligible ? (r.bookingPaused ? "Paused" : "Yes") : "No"}</Td>
            <Td className="text-xs">{r.cities ?? "—"}</Td>
            <Td>{r.openCases ? <Pill status="open" label={String(r.openCases)} /> : "—"}</Td>
            <Td className="text-xs">{r.source.replace("_", " ")}</Td>
            <Td className="text-xs">{fmtDate(r.createdAt)}</Td>
          </tr>
        ))}
      </Table>
      <Pager base="/admin/practitioners" sp={sp} page={page} pageSize={50} total={total} />
    </>
  );
}
